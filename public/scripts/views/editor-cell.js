var _            = require('underscore');
var domify       = require('domify');
var Cell         = require('./cell');
var BtnControls  = require('./btn-cell-controls');
var extraKeys    = require('./lib/extra-keys');
var controls     = require('../lib/controls').editor;
var messages     = require('../state/messages');
var persistence  = require('../state/persistence');
var ownerProtect = require('./lib/owner-protect');

/**
 * Create a generic editor cell instance view.
 *
 * @type {Function}
 */
var EditorCell = module.exports = Cell.extend({
  className: 'cell cell-editor'
});

/**
 * Runs when we initialize the editor cell.
 */
EditorCell.prototype.initialize = function () {
  Cell.prototype.initialize.apply(this, arguments);
  this.model       = this.model || new this.EditorModel();
  this.model.view  = this;
  this.btnControls = new BtnControls();
};

/**
 * Sets a fallback model to initialize.
 *
 * @type {Function}
 */
EditorCell.prototype.EditorModel = require('../models/cell');

/**
 * Event listeners for all editor cells in the notebook.
 *
 * @type {Object}
 */
EditorCell.prototype.events = {
  'click .cell-insert-top .btn-insert-text':    'newTextAbove',
  'click .cell-insert-top .btn-insert-code':    'newCodeAbove',
  'click .cell-insert-bottom .btn-insert-text': 'newTextBelow',
  'click .cell-insert-bottom .btn-insert-code': 'newCodeBelow'
};

/**
 * Set the base editor options used in CodeMirror.
 *
 * @type {Object}
 */
EditorCell.prototype.editorOptions = {
  tabSize:        2,
  lineNumbers:    true,
  lineWrapping:   true,
  viewportMargin: Infinity,
  extraKeys:      extraKeys(controls)
};

/**
 * Remove the editor cell.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.remove = ownerProtect(function () {
  Cell.prototype.remove.call(this);
  messages.trigger('resize');

  return this;
});

/**
 * Moves the cells position in the notebook up by one cell.
 */
EditorCell.prototype.moveUp = ownerProtect(function () {
  this.trigger('moveUp', this);
});

/**
 * Moves the cells position in the notebook down by one cell.
 */
EditorCell.prototype.moveDown = ownerProtect(function () {
  this.trigger('moveDown', this);
});

/**
 * Navigate up to the previous cell with the cursor.
 */
EditorCell.prototype.navigateUp = ownerProtect(function () {
  this.trigger('navigateUp', this);
});

/**
 * Navigate down to the next cell with the cursor.
 */
EditorCell.prototype.navigateDown = ownerProtect(function () {
  this.trigger('navigateDown', this);
});

/**
 * Clones the editor cell and triggers a clone event with the cloned view.
 *
 * @return {EditorCell} Cloned view.
 */
EditorCell.prototype.clone = ownerProtect(function () {
  var clone = new this.constructor(_.extend({}, this.options, {
    model: this.model.clone()
  }));
  this.trigger('clone', this, clone);
  return clone;
});

/**
 * Triggers a `switch` event to switch the cell mode.
 */
EditorCell.prototype.switch = ownerProtect(function () {
  this.trigger('switch', this);
});

/**
 * Append a new editor cell directly below the current cell.
 */
EditorCell.prototype.appendNew = ownerProtect(function () {
  this.trigger('appendNew', this);
});

/**
 * Inserts a new line directly below the current line. Keeps previous cursor
 * history so undo puts the cursor back to the same position.
 */
EditorCell.prototype.newLineBelow = ownerProtect(function () {
  var line = this.editor.getCursor().line;

  this.editor.doc.replaceRange('\n', {
    ch:   Infinity,
    line: line++
  });
  this.editor.indentLine(line, null, true);
  this.editor.doc.setCursor({
    cm:   Infinity,
    line: line
  });
});

EditorCell.prototype.toggleComment = ownerProtect(function () {
  this.editor.execCommand('toggleComment');
});

/**
 * Focus the editor cell.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.focus = function () {
  // Set a hidden focus flag so we can use it to check in tests
  this._hasFocus = true;

  // Make focusing the editor async since it triggers other events such as
  // scrolling into view which interferes with iframe resizing events.
  process.nextTick(_.bind(this.editor.focus, this.editor));
  return this;
};

/**
 * Check whether the current cell has focus.
 *
 * @return {Boolean}
 */
EditorCell.prototype.hasFocus = function () {
  return this._hasFocus || (!!this.editor && this.editor.hasFocus());
};

/**
 * Attempt to save the editor contents.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.save = function () {
  if (this.editor) {
    this.model.set('value', this.editor.getValue());
  }

  return this;
};

/**
 * Refresh the editor instance.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.refresh = function () {
  this.editor.refresh();

  return this;
};

/**
 * Set up bindings with the CodeMirror instance.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.bindEditor = function () {
  this.listenTo(this.editor, 'focus', _.bind(function () {
    delete this._hasFocus;

    if (this._triggerBlur) {
      window.clearTimeout(this._triggerBlur);
      return this._triggerBlur = null;
    }

    this.trigger('focus', this);
    this.el.classList.add('active');
  }, this));

  this.listenTo(this.editor, 'blur', _.bind(function () {
    this._triggerBlur = window.setTimeout(_.bind(function () {
      this.el.classList.remove('active');
      this.trigger('blur', this);
    }, this), 20);
  }, this));

  // Save the value of the model every time a change happens
  this.listenTo(this.editor, 'change', _.bind(function (cm, data) {
    this.save();
    messages.trigger('resize');

    // When the presented data looks line a new line has been added, emit an
    // event the notebook can listen to.
    if (data.text.length > 1 || data.from.line !== data.to.line) {
      this.trigger('linesChanged', this);
    }

    this.trigger('change', this, data);
  }, this));

  return this;
};

/**
 * Remove all bindings set up with the CodeMirror instance.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.unbindEditor = function () {
  this.stopListening(this.editor);
  window.clearTimeout(this._triggerBlur);
  this._triggerBlur = null;
  return this;
};

/**
 * Remove the CodeMirror view from the DOM.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.removeEditor = function () {
  if (!this.editor) { return this; }

  // Cache history for cell re-renders.
  this._history = this.editor.doc.getHistory();
  this.unbindEditor();

  // Remove the old CodeMirror instance from the DOM.
  var editorEl = this.editor.getWrapperElement();
  if (editorEl && editorEl.parentNode) {
    editorEl.parentNode.removeChild(editorEl);
  }

  // Delete any reference to the CodeMirror instance.
  delete this.editor;

  return this;
};

/**
 * Render a CodeMirror instance inside the view.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.renderEditor = function () {
  // Remove the currently rendered editor from all references.
  this.removeEditor();

  // If an editor already exists, rerender the editor keeping the same options
  // Initialize the codemirror editor.
  this.editor = new CodeMirror(_.bind(function (el) {
    this.el.insertBefore(el, this.el.firstChild);
  }, this), _.extend({}, this.editorOptions, {
    view:     this,
    readOnly: !this.isOwner()
  }));

  // Add an extra css class for helping with styling read-only editors.
  if (this.editor.getOption('readOnly')) {
    this.editor.getWrapperElement().className += ' CodeMirror-readOnly';
  }

  // Alias the current view to the editor, since keyMaps are shared between
  // all instances of CodeMirror.
  this.editor.view = this;

  // Set the editor value if it already exists.
  if (this.getValue()) {
    this.editor.setValue(this.getValue());
    this.moveCursorToEnd();
  }

  // Bind the editor events at the end in case of any focus issues when
  // changing docs, etc.
  this.bindEditor();

  // Swap the previous history in place. Otherwise, assume this is a brand new
  // editor instance and clear all history.
  if (this._history) {
    this.editor.doc.setHistory(this._history);
    delete this._history;
  } else {
    this.editor.doc.clearHistory();
  }

  return this;
};

/**
 * Render the editor cell and attach the controls.
 *
 * @return {EditorCell}
 */
EditorCell.prototype.render = function () {
  Cell.prototype.render.call(this);
  this.renderEditor();

  var insertContents = [
    '<span class="insert-dot icon-plus-circled"></span>',
    '<div class="cell-insert-buttons">',
    '<button class="btn btn-insert-text">Insert Comment Cell</button>',
    '<button class="btn btn-insert-code">Insert Code Cell</button>',
    '</div>',
  ].join('\n');

  this.el.appendChild(domify([
    '<span class="cell-insert cell-insert-top">',
    insertContents,
    '</span>',
    '<span class="cell-insert cell-insert-bottom">',
    insertContents,
    '</span>'
  ].join('\n')));

  this.listenTo(this.btnControls, 'showControls', function () {
    this.trigger('showControls', this);
  }, this);
  this.btnControls.render().prependTo(this.el);

  /**
   * Attach hover listeners to the cell insert bars, which will display the
   * insert buttons.
   */
  _.each(this.el.querySelectorAll('.cell-insert'), function (el) {
    var hoverTimeout;

    el.addEventListener('mouseenter', function (e) {
      hoverTimeout = setTimeout(function () {
        e.target.classList.add('cell-insert-hover');
      }, 300);
    });

    el.addEventListener('mouseleave', function (e) {
      clearTimeout(hoverTimeout);
      e.target.classList.remove('cell-insert-hover');
    });
  }, this);

  return this;
};

/**
 * Get the current value of the cell.
 *
 * @return {String}
 */
EditorCell.prototype.getValue = function () {
  return this.model.get('value');
};

/**
 * Sets the value of the current editor instance.
 *
 * @param  {String}     value
 * @return {EditorCell}
 */
EditorCell.prototype.setValue = function (value) {
  if (_.isString(value)) {
    if (this.editor) {
      this.editor.setValue(value);
    } else {
      this.model.set('value', value);
    }
  }

  return this;
};

/**
 * Moves the CodeMirror cursor to the end of document, or end of the line.
 *
 * @param  {Number}     line
 * @return {EditorCell}
 */
EditorCell.prototype.moveCursorToEnd = function (line) {
  if (!this.editor) { return this; }

  this.editor.setCursor(
    isNaN(line) ? this.editor.doc.lastLine() : line,
    Infinity
  );

  return this;
};

/**
 * Appends the editor cell to an element.
 *
 * @param  {Node}       el
 * @return {EditorCell}
 */
EditorCell.prototype.appendTo = function (el) {
  Cell.prototype.appendTo.call(this, el);

  // Since the `render` method is called before being appended to the DOM, we
  // need to refresh the CodeMirror UI so it becomes visible
  if (this.editor) {
    this.refresh();
    // Since the CodeMirror refresh appears to be async, push the resize event
    // into the following event loop.
    process.nextTick(function () {
      messages.trigger('resize');
    });
  }

  return this;
};

/**
 * Checks whether the current user is the current owner of the cell and able to
 * edit it.
 *
 * @return {Boolean}
 */
EditorCell.prototype.isOwner = function () {
  return persistence.isOwner();
};

/**
 * Inserts new cells around the current cell.
 */
var triggerSelfAndHideButtons = function (obj, method) {
  obj[method] = ownerProtect(function () {
    this.trigger(method, this);
    this.el.classList.remove('cell-insert-hover');
  });
};

/**
 * Attach numerous listeners that just trigger events.
 */
triggerSelfAndHideButtons(EditorCell.prototype, 'newTextAbove');
triggerSelfAndHideButtons(EditorCell.prototype, 'newCodeAbove');
triggerSelfAndHideButtons(EditorCell.prototype, 'newTextBelow');
triggerSelfAndHideButtons(EditorCell.prototype, 'newCodeBelow');
