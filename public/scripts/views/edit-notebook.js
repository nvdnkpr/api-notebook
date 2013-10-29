var View        = require('./view');
var persistence = require('../state/persistence');

/**
 * Create a new raw notebook editor instance.
 *
 * @type {Function}
 */
var EditNotebook = module.exports = View.extend({
  className: 'notebook-edit'
});

/**
 * Render the notebook editor.
 *
 * @return {EditNotebook}
 */
EditNotebook.prototype.render = function () {
  this.editor = new CodeMirror(this.el, {
    mode:           'gfm',
    value:          persistence.get('contents'),
    tabSize:        2,
    lineNumbers:    true,
    lineWrapping:   true,
    viewportMargin: Infinity
  });

  var direction = false;

  // Update the persistence code every time we change the content.
  this.listenTo(this.editor, 'change', function (cm) {
    direction = true;
    persistence.set('contents', cm.getValue());
  });

  this.listenTo(persistence, 'change:contents', function () {
    if (!direction) {
      this.editor.setValue(persistence.get('contents'));
    }

    direction = false;
  });

  return this;
};

/**
 * Append the editor to an element and refresh the CodeMirror editor (when it's
 * rendered off screen the view is broken).
 *
 * @return {EditNotebook}
 */
EditNotebook.prototype.appendTo = function () {
  View.prototype.appendTo.apply(this, arguments);
  this.editor.refresh();
  return this;
};
