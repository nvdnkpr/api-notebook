var Ghost        = require('./ghost');
var state        = require('../../state/state');
var correctToken = require('../codemirror/correct-token');
var middleware   = require('../../state/middleware');

var Widget = module.exports = function (completion, data) {
  var cm   = completion.cm;
  var that = this;

  this.data       = data;
  this.completion = completion;

  if (!data.list.length) { return this.remove(); }

  cm.addKeyMap(this.keyMap = {
    'Esc': function () { that.remove(); }
  });

  this.refresh();
};

Widget.prototype.remove = function () {
  this.removeGhost();
  this.removeHints();
  this.completion.cm.removeKeyMap(this.keyMap);
  delete this.keyMap;
  delete this.completion.widget;
};

Widget.prototype.removeHints = function () {
  if (!this.hints) { return; }

  this.completion.cm.off('scroll', this.onScroll);
  this.completion.cm.removeKeyMap(this.hintKeyMap);
  state.off('change:window.height change:window.width', this.onResize);
  if (this.hints.parentNode) { this.hints.parentNode.removeChild(this.hints); }
  delete this.hints;
  delete this.onScroll;
  delete this.hintKeyMap;
};

Widget.prototype.removeGhost = function () {
  if (!this.ghost) { return; }

  this.ghost.remove();
};

Widget.prototype.refresh = function () {
  var that        = this;
  var cm          = this.completion.cm;
  var activeHint  = 0;
  var currentHint = 0;

  // If we have current hints, get the current resultId so we can set it back as
  // close as possible
  if (this.hints && !isNaN(this.selectedHint)) {
    currentHint = this.hints.childNodes[this.selectedHint].listId;
  }

  this.removeGhost();
  this.removeHints();
  delete this.selectedHint;

  // Update data attributes with new positions
  this.data.to    = cm.getCursor();
  this.data.token = correctToken(cm, this.data.to);

  var list     = this.data.list;
  var text     = cm.getRange(this.data.from, this.data.to);
  var hints    = this.hints = document.createElement('ul');
  var results  = this._results = [];

  for (var i = 0, j = 0; i < list.length; i++) {
    var string = list[i];

    // Check against the filter to see if the element should be appended. This
    // is going to fail if any of the middleware is async.
    this._filter(string, function (err, display) {
      if (!display) { return; }

      var el = hints.appendChild(document.createElement('li'));
      el.hintId    = j++;
      el.listId    = i;
      el.className = 'CodeMirror-hint';

      // Keep an array of displayed results
      results.push(string);

      // Move the activeHint as close as possible to the currently selected
      // hints list position.
      if (i <= currentHint) {
        activeHint = el.hintId;
      }

      // Do Blink-style bolding of the completed text
      var index = string.indexOf(text);
      if (index > -1) {
        var prefix = string.substr(0, index);
        var match  = string.substr(index, text.length);
        var suffix = string.substr(index + text.length);

        var highlight = document.createElement('span');
        highlight.className = 'CodeMirror-hint-match';
        highlight.appendChild(document.createTextNode(match));
        el.appendChild(document.createTextNode(prefix));
        el.appendChild(highlight);
        el.appendChild(document.createTextNode(suffix));
      } else {
        el.appendChild(document.createTextNode(string));
      }
    });
  }

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

  if (hints.childNodes.length < 2) {
    this.setActive(0);
    return this.removeHints();
  }

  hints.className = 'CodeMirror-hints';
  document.body.appendChild(hints);

  // Set the active element after render so we can calculate scroll positions
  this.setActive(activeHint);

  CodeMirror.on(hints, 'click', function (e) {
    var el = e.target || e.srcElement;
    if (isNaN(el.hintId)) { return; }

    that.setActive(el.hintId);
    that.accept();
  });

  CodeMirror.on(hints, 'mousedown', function () {
    setTimeout(function () { cm.focus(); }, 20);
  });

  state.on(
    'change:window.height change:window.width',
    this.onResize = function () { that.reposition(); }
  );
};

Widget.prototype.reposition = function () {
  if (this.onScroll) { this.completion.cm.off('scroll', this.onScroll); }

  var cm    = this.completion.cm;
  var pos   = cm.cursorCoords(this.data.from);
  var top   = pos.bottom;
  var left  = pos.left;
  var that  = this;
  var hints = this.hints;

  hints.className  = hints.className.replace(' CodeMirror-hints-top', '');
  hints.style.top  = top  + 'px';
  hints.style.left = left + 'px';

  var box       = hints.getBoundingClientRect();
  var padding   = 5;
  var winWidth  = state.get('window.width');
  var winHeight = state.get('window.height');

  var overlapX = box.right  - winWidth;
  var overlapY = box.bottom - winHeight;

  if (overlapX > 0) {
    if (box.right - box.left > winWidth) {
      hints.style.width = (winWidth - padding * 2) + 'px';
      overlapX -= (box.right - box.left) - winWidth;
    }
    hints.style.left = (left = pos.left - overlapX - padding) + 'px';
  }

  if (overlapY > 0) {
    var height = box.bottom - box.top;
    var winPos = cm.cursorCoords(this.data.from, 'window');
    // Switch the hints to be above instead of below
    if (winHeight - top < winPos.top) {
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
    } else if (top + height > winHeight) {
      hints.style.height = (winHeight - pos.bottom - 5) + 'px';
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
};

Widget.prototype.accept = function () {
  this.ghost.accept();
  this.remove();
};

Widget.prototype._filter = function (string, done) {
  return middleware.trigger('completion:filter', {
    token:   this.data.token,
    string:  string,
    display: true,
    context: this.data.context
  }, function (err, data) {
    return done(err, !data.filter);
  });
};

Widget.prototype.setActive = function (i) {
  var total = this.hints.childNodes.length;
  var node;

  // Switch `i` to the closest number we can abuse.
  i = total ? i % total : 0;

  // When we have a negative value, take away from the end of the list, this
  // allows up to loop around the menu.
  if (i < 0) { i = total + i; }

  if (!total)                  { return this.removeGhost(); }
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
  // with the text.
  this.removeGhost();
  this.ghost = new Ghost(this, this.data, this.data.list[node.listId]);
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

Widget.prototype.screenAmount = function () {
  var amount = this.hints.clientHeight / this.hints.firstChild.offsetHeight;
  return Math.floor(amount) || 1;
};
