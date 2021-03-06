var _            = require('underscore');
var Ghost        = require('./ghost');
var state        = require('../../state/state');
var correctToken = require('../codemirror/correct-token');
var middleware   = require('../../state/middleware');
var asyncFilter  = require('async').filter;

/**
 * Renders a completion suggestion list.
 *
 * @param  {Completion} completion
 * @param  {Object}     data
 * @return {Widget}
 */
var Widget = module.exports = function (completion, data) {
  this.data       = data;
  this.completion = completion;

  CodeMirror.signal(completion.cm, 'startCompletion', completion.cm);

  completion.cm.addKeyMap(this.keyMap = {
    'Esc': _.bind(function () { this.remove(); }, this)
  });

  this.refresh();
};

/**
 * Removes all widget data, including the currently display ghost and hint
 * overlay.
 *
 * @return {Widget}
 */
Widget.prototype.remove = function () {
  this.removeGhost();
  this.removeHints();
  this.completion._completionActive = false;
  this.completion.cm.removeKeyMap(this.keyMap);
  CodeMirror.signal(this.completion.cm, 'endCompletion', this.completion.cm);
  delete this.keyMap;
  delete this.completion.widget;

  return this;
};

/**
 * Remove the hints overlay.
 *
 * @return {Widget}
 */
Widget.prototype.removeHints = function () {
  if (this._refreshing || !this.hints) { return this; }

  // Remove all event listeners associated with the hints.
  this.completion.cm.off('scroll', this.onScroll);
  this.completion.cm.removeKeyMap(this.hintKeyMap);
  state.off('change:viewportHeight change:viewportWidth', this.onResize);
  if (this.hints.parentNode) { this.hints.parentNode.removeChild(this.hints); }
  delete this.hints;
  delete this.onScroll;
  delete this.hintKeyMap;

  return this;
};

/**
 * Remove the currently displayed ghost widget.
 *
 * @return {Widget}
 */
Widget.prototype.removeGhost = function () {
  if (!this.ghost) { return; }

  this.ghost.remove();

  return this;
};

/**
 * Refresh the completion widget displayed suggestions.
 *
 * @param  {Function} done
 */
Widget.prototype.refresh = function (done) {
  if (!this.data.results) { return; }

  var that = this;
  var cm   = this.completion.cm;
  var list = this.data.results;

  // Removes the previous ghost and hints before we start rendering the new
  // display widgets.
  this.removeGhost();
  this.removeHints();
  delete this.selectedHint;

  // Update data attributes with new positions
  this.data.to     = cm.getCursor();
  this.data.token  = correctToken(cm, this.data.to);
  this._refreshing = true;

  // Run an async filter on the data before we create the nodes
  asyncFilter(list, _.bind(this._filter, this), _.bind(function (results) {
    // Remove the rendering flag now we have finished rendering the widget
    delete this._refreshing;
    CodeMirror.signal(cm, 'refreshCompletion', cm, results);

    // Break completion if we have no suggestions.
    if (results.length === 0) { return; }

    // If we have less than two available results, there is no reason to render
    // the hints overlay menu.
    if (results.length < 2) {
      this.ghost = new Ghost(this, this.data, results[0]);
      return done && done();
    }

    var text  = cm.getRange(this.data.from, this.data.to);
    var hints = this.hints = document.createElement('ul');

    // Loop through each of the results and append an item to the hints list
    _.each(results, function (result, index) {
      var el      = hints.appendChild(document.createElement('li'));
      var isMatch = (result.name === result.value);
      var indexOf, hint;

      el.hintId      = index;
      el.className   = 'CodeMirror-hint';
      el.ghostResult = result;

      // Do Blink-style bolding of the completed text
      if (isMatch && (indexOf = result.name.indexOf(text)) > -1) {
        var prefix = result.name.substr(0, indexOf);
        var match  = result.name.substr(indexOf, text.length);
        var suffix = result.name.substr(indexOf + text.length);

        hint = document.createElement('span');
        hint.className = 'CodeMirror-hint-match';
        hint.appendChild(document.createTextNode(match));
        el.appendChild(document.createTextNode(prefix));
        el.appendChild(hint);
        el.appendChild(document.createTextNode(suffix));
      } else {
        hint = document.createTextNode(result.name);

        // Italicize special properties to make them distinct from regular
        // completion results.
        if (result.special) {
          hint.className = 'CodeMirror-hint-special';
        }

        el.appendChild(hint);
      }
    });

    // Add the hinting keymap here instead of later or earlier since we need to
    // listen before we remove again, and we can't be listening when we don't
    // display any hints to listen to.
    cm.addKeyMap(this.hintKeyMap = {
      'Up':       function () { that.setActive(that.selectedHint - 1); },
      'Down':     function () { that.setActive(that.selectedHint + 1); },
      // Enable `Alt-` navigation for when we are showing advanced properties
      'Alt-Up':   function () { that.setActive(that.selectedHint - 1); },
      'Alt-Down': function () { that.setActive(that.selectedHint + 1); },
      'Home':     function () { that.setActive(0); },
      'End':      function () { that.setActive(-1); },
      'Enter':    function () { that.accept(); },
      'PageUp':   function () {
        that.setActive(that.selectedHint - that.screenAmount());
      },
      'PageDown': function () {
        that.setActive(that.selectedHint + that.screenAmount());
      }
    });

    hints.className = 'CodeMirror-hints';
    document.body.appendChild(hints);

    // Set the active element after render so we can calculate scroll positions
    this.setActive(0);

    CodeMirror.on(hints, 'click', function (e) {
      var el = e.target || e.srcElement;
      if (isNaN(el.hintId)) { return; }

      that.setActive(el.hintId);
      that.accept();
    });

    CodeMirror.on(hints, 'mousedown', function () {
      window.setTimeout(function () { cm.focus(); }, 20);
    });

    state.on(
      'change:viewportHeight change:viewportWidth',
      this.onResize = function () { that.reposition(); }
    );

    return done && done();
  }, this));
};

/**
 * Reposition the current hints overlay.
 *
 * @return {Widget}
 */
Widget.prototype.reposition = function () {
  if (this.onScroll) {
    this.completion.cm.off('scroll', this.onScroll);
  }

  var cm    = this.completion.cm;
  var pos   = cm.cursorCoords(this.data.from);
  var top   = pos.bottom;
  var left  = pos.left;
  var that  = this;
  var hints = this.hints;

  hints.className    = hints.className.replace(' CodeMirror-hints-top', '');
  hints.style.top    = top  + 'px';
  hints.style.left   = left + 'px';
  hints.style.height = 'auto';

  var box       = hints.getBoundingClientRect();
  var padding   = 5;
  var winWidth  = state.get('viewportWidth');
  var winHeight = state.get('viewportHeight');

  var overlapX = box.right  - winWidth;
  var overlapY = box.bottom - winHeight;

  if (overlapX > 0) {
    if (box.right - box.left > winWidth) {
      overlapX -= (box.right - box.left) - winWidth;
      hints.style.width = (winWidth - padding * 2) + 'px';
    }

    hints.style.left = (left = pos.left - overlapX - padding) + 'px';
  }

  if (overlapY > 0) {
    var height = box.bottom - box.top;
    var winPos = cm.cursorCoords(this.data.from, 'window');

    // Switch the hints to be above instead of below
    if (winHeight - winPos.bottom < winPos.top) {
      // When the box is larger than the available height, resize it. Otherwise,
      // we need to position `x` from the top taking into account the height.
      if (height > (winPos.top - padding)) {
        top = pos.top - winPos.top + padding;
        hints.style.height = (winPos.top - padding) + 'px';
      } else {
        top = pos.top - height;
      }

      hints.style.top = top + 'px';
      hints.className += ' CodeMirror-hints-top';
    } else {
      hints.style.height = (winHeight - winPos.bottom - padding) + 'px';
    }
  }

  var startScroll = cm.getScrollInfo();
  cm.on('scroll', this.onScroll = function () {
    var curScroll = cm.getScrollInfo();
    var newTop    = top + startScroll.top - curScroll.top;
    var editor    = cm.getWrapperElement().getBoundingClientRect();
    var point     = newTop - (window.pageYOffset ||
      (document.documentElement || document.body).scrollTop);

    if (point <= editor.top || point >= editor.bottom) {
      return that.completion.remove();
    }

    that.hints.style.top  = newTop + 'px';
    that.hints.style.left = (left + startScroll.left - curScroll.left) + 'px';
  });

  return this;
};

/**
 * Accept the currently highlighted suggestion.
 *
 * @return {Widget}
 */
Widget.prototype.accept = function () {
  this.ghost.accept();

  return this;
};

/**
 * Filter the a string suggestion and decide whether it should be displayed.
 *
 * @param  {String}   string
 * @param  {Function} done
 */
Widget.prototype._filter = function (result, done) {
  // Don't ever filter special properties.
  if (result.special === true) {
    return done(true);
  }

  return middleware.trigger('completion:filter', {
    token:   this.data.token,
    result:  result,
    context: this.data.context
  }, function (err, filter) {
    if (err) { throw err; }
    return done(filter);
  });
};

/**
 * Sets an item in the widget menu to be displayed as active.
 *
 * @param {Number} i
 */
Widget.prototype.setActive = function (i) {
  var total = this.hints.childNodes.length;
  var node;

  // Switch `i` to the closest number we can abuse.
  i = total ? i % total : 0;

  // When we have a negative value, take away from the end of the list, this
  // allows up to loop around the menu.
  if (i < 0) { i = total + i; }

  if (!total) { return this.removeGhost(); }
  // Avoid reprocessing of the position if it's already set to that position.
  if (this.selectedHint === i) { return; }

  // Remove the old active hint if we have a selected hint id.
  if (!isNaN(this.selectedHint)) {
    node = this.hints.childNodes[this.selectedHint];
    node.className = node.className.replace(' CodeMirror-hint-active', '');
  }

  // Add the class to the new active hint
  node = this.hints.childNodes[this.selectedHint = i];
  node.className += ' CodeMirror-hint-active';

  // Should always create new ghost nodes for any text changes. When the new
  // ghost is appended, trigger a reposition event to align the autocompletion
  // with the text (This can be an issue on end of lines).
  this.removeGhost();
  this.ghost = new Ghost(this, this.data, node.ghostResult);
  this.reposition();

  if (node.offsetTop < this.hints.scrollTop) {
    this.hints.scrollTop = node.offsetTop - 3;
  } else {
    var totalOffset = node.offsetTop + node.offsetHeight;
    if (totalOffset > this.hints.scrollTop + this.hints.clientHeight) {
      this.hints.scrollTop = totalOffset - this.hints.clientHeight + 3;
    }
  }
};

/**
 * Returns the amount of screen space the menu takes up in entries.
 *
 * @return {Number}
 */
Widget.prototype.screenAmount = function () {
  var amount = this.hints.clientHeight / this.hints.firstChild.offsetHeight;
  return Math.floor(amount) || 1;
};
