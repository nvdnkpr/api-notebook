var _        = require('underscore');
var domify   = require('domify');
var Backbone = require('backbone');

var View         = require('./view');
var Notebook     = require('./notebook');
var EditNotebook = require('./edit-notebook');
var controls     = require('../lib/controls');
var messages     = require('../state/messages');
var persistence  = require('../state/persistence');

var ENTER_KEY = 13;

/**
 * Helper function for removing old application contents and resizing the
 * viewport container.
 *
 * @param  {Function} fn
 * @return {Function}
 */
var changeNotebook = function (fn) {
  return function () {
    // Remove the old application contents/notebook.
    if (this.contents) {
      this.contents.remove();
      delete this.contents;
      this.el.classList.remove('notebook-view-active', 'notebook-edit-active');
    }

    // Sets the new notebook contents.
    this.contents = fn && fn.apply(this, arguments);

    // If the function returned an object, assume it is a view and render it.
    if (this.contents instanceof Backbone.View) {
      this.contents.render().appendTo(this._contentsEl);
    }

    // Resize the parent frame since we have added notebook contents.
    messages.trigger('resize');
    return this;
  };
};

/**
 * Create a central application view.
 *
 * @type {Function}
 */
var App = module.exports = View.extend({
  className: 'application'
});

/**
 * Keep track of all events that can be triggered from the DOM.
 *
 * @type {Object}
 */
App.prototype.events = {
  'click .modal-toggle':   'toggleShortcuts',
  'click .modal-backdrop': 'hideShortcuts',
  'click .notebook-exec':  'runNotebook',
  'click .notebook-fork':  'forkNotebook',
  'click .notebook-clone': 'forkNotebook',
  'click .notebook-auth':  'authNotebook',
  'click .notebook-save':  'saveNotebook',
  // Switch between application views.
  'click .toggle-notebook-edit': 'renderNotebook',
  // Listen for `Enter` presses and blur the input.
  'keydown .notebook-title': function (e) {
    if (e.which !== ENTER_KEY) { return; }

    e.preventDefault();
    e.srcElement.blur();
  },
  // Update the notebook title when leaving the input.
  'focusout .notebook-title': function (e) {
    persistence.set('title', e.srcElement.value);
  },
  // Pre-select the notebook title before input.
  'click .notebook-title': function (e) {
    if (persistence.isOwner()) {
      e.srcElement.select();
    }
  }
};

/**
 * Runs when we create an instance of the applications. Starts listening for
 * relevant events to respond to.
 */
App.prototype.initialize = function () {
  // Start up the history router, which will trigger the start of other
  // subsystems such as persistence and authentication.
  Backbone.history.start({
    pushState: false
  });
};

/**
 * Switch between raw source edit mode and the normal notebook execution.
 *
 * @return {App}
 */
App.prototype.renderNotebook = changeNotebook(function () {
  if (this.notebook) {
    delete this.notebook;
    this.el.classList.add('notebook-edit-active');
    return new EditNotebook();
  }

  this.el.classList.add('notebook-view-active');
  return this.notebook = new Notebook();
});

/**
 * Remove the application view from the DOM.
 *
 * @return {App}
 */
App.prototype.remove = function () {
  Backbone.history.stop();
  changeNotebook().call(this);
  return View.prototype.remove.call(this);
};

/**
 * Update all data "bound" methods.
 *
 * @return {App}
 */
App.prototype.update = function () {
  this.updateId();
  this.updateUser();
  this.updateTitle();
  this.updateState();

  return this;
};

/**
 * Updates the template when the user or document owner changes.
 *
 * @return {App}
 */
App.prototype.updateUser = function () {
  var auth    = this.el.querySelector('.auth-status');
  var title   = this.el.querySelector('.notebook-title');
  var isAuth  = persistence.isAuthenticated();
  var isOwner = persistence.isOwner();

  this.el.classList[isOwner  ? 'add' : 'remove']('user-is-owner');
  this.el.classList[!isOwner ? 'add' : 'remove']('user-not-owner');
  this.el.classList[isAuth   ? 'add' : 'remove']('user-is-authenticated');
  this.el.classList[!isAuth  ? 'add' : 'remove']('user-not-authenticated');

  // Allow/disallow editing of the title based on authentication status.
  title.readOnly = !isOwner;

  // Update the auth display status with the user title.
  auth.textContent = persistence.get('userTitle') + '.';

  // Adding and removing some of these classes cause the container to resize.
  messages.trigger('resize');

  return this;
};

/**
 * Updates the template when the persistence id changes.
 *
 * @return {App}
 */
App.prototype.updateId = function () {
  var isSaved = persistence.has('id');

  this.el.classList[isSaved  ? 'add' : 'remove']('notebook-is-saved');
  this.el.classList[!isSaved ? 'add' : 'remove']('notebook-not-saved');

  return this;
};

/**
 * Updates the application title when the notebook title changes.
 *
 * @return {App}
 */
App.prototype.updateTitle = function () {
  this.el.querySelector('.notebook-title').value = persistence.get('title');

  return this;
};

/**
 * Update the displayed notebook persistence state.
 *
 * @return {App}
 */
App.prototype.updateState = function () {
  var state    = persistence.get('state');
  var statusEl = this.el.querySelector('.save-status');
  var now      = new Date();
  var hours    = now.getHours();
  var minutes  = now.getMinutes();
  var suffix   = 'AM';

  if (hours > 11) {
    hours  = hours - 12;
    suffix = 'PM';
  }

  if (hours === 0) {
    hours = 12;
  }

  var stamp = hours + ':' + ('0' + minutes).slice(-2) + suffix;

  // Remove the content of the status display.
  statusEl.innerHTML = '';

  if (state === persistence.LOADING) {
    statusEl.textContent = 'Loading.';
  } else if (state === persistence.LOAD_FAIL) {
    statusEl.textContent = 'Load failed.';
  } else if (state === persistence.LOAD_DONE) {
    statusEl.textContent = persistence.isNew() ? '' : 'Loaded ' + stamp + '.';
  } else if (state === persistence.SAVING) {
    statusEl.textContent = 'Saving.';
  } else if (state === persistence.SAVE_FAIL) {
    var saveEl = document.createElement('button');
    saveEl.className   = 'btn-text notebook-save';
    saveEl.textContent = 'Try again';

    statusEl.appendChild(document.createTextNode('Save failed.'));
    statusEl.appendChild(saveEl);
    statusEl.appendChild(document.createTextNode('.'));
  } else if (state === persistence.SAVE_DONE) {
    statusEl.textContent = persistence.isNew() ? '' : 'Saved ' + stamp + '.';
  }

  return this;
};

/**
 * Shows the shortcut modal.
 */
App.prototype.showShortcuts = function () {
  this.el.classList.add('modal-visible');
};

/**
 * Hides the shortcut modal.
 */
App.prototype.hideShortcuts = function () {
  this.el.classList.remove('modal-visible');
};

/**
 * Toggle the visibility of the shortcut modal window.
 */
App.prototype.toggleShortcuts = function () {
  if (this.el.classList.contains('modal-visible')) {
    this.hideShortcuts();
  } else {
    this.showShortcuts();
  }
};

/**
 * Render the applications `innerHTML`.
 *
 * @return {App}
 */
App.prototype.render = function () {
  View.prototype.render.call(this);

  this.el.appendChild(domify(
    '<header class="notebook-header clearfix">' +
      '<input class="notebook-title" autocomplete="off">' +
    '</header>' +

    '<div class="notebook-toolbar clearfix">' +
      '<div class="toolbar-end">'+
        '<button class="edit-source toggle-notebook-edit"></button>' +
      '</div>' +

      '<div class="toolbar-inner">' +
        '<div class="auth-status"></div>' +
        '<div class="save-status"></div>' +
        '<div class="toolbar-buttons">' +
          '<span class="btn-edit">' +
            '<button class="btn-text toggle-notebook-edit">' +
              'Return to notebook view' +
            '</button>' +
          '</span>' +
          '<span class="btn-view">' +
            '<button class="btn-text notebook-fork">' +
              'Make my own copy' +
            '</button>' +
            '<button class="btn-text notebook-clone">' +
              'Make another copy' +
            '</button>' +
            '<button class="btn-round ir notebook-exec">Run All</button>' +
            '<button class="btn-round ir modal-toggle">Shortcuts</button>' +
          '</span>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<div class="notebook-banner notebook-auth">' +
      '<p>Please <span class="text-underline">authenticate</span> ' +
      'to save the notebook.</p>' +
    '</div>' +

    '<div class="modal-backdrop"></div>'
  ));

  var allControls = controls.editor.concat(controls.code).concat(controls.text);

  var controlMap = _.map(allControls, function (control) {
    return '<tr>' +
      '<td>' + (control.keyCode || control.shortcut) + '</td>' +
      '<td>' + control.description + '</td>' +
    '</tr>';
  });

  this.el.appendChild(domify(
    '<div class="modal">' +
      '<header class="modal-header">' +
        '<h3>Keyboard Shortcuts</h3>' +
      '</header>' +

      '<div class="modal-body">' +
        '<table>' +
          '<colgroup>' +
            '<col class="col-mini">' +
            '<col class="col-large">' +
          '</colgroup>' +
          '<tr>' +
            '<th>Key Combination</th>' +
            '<th>Action</th>' +
          '</tr>' +
          controlMap.join('') +
        '</table>' +
      '</div>' +
    '</div>'
  ));

  // Listens to different application state changes and updates accordingly.
  this.listenTo(persistence, 'changeUser',   this.updateUser);
  this.listenTo(persistence, 'change:state', this.updateState);
  this.listenTo(persistence, 'change:id',    this.updateId);
  this.listenTo(persistence, 'change:title', this.updateTitle);
  this.listenTo(messages,    'keydown:Esc',  this.hideShortcuts);

  // Trigger all the update methods.
  this.update();

  this.el.appendChild(domify(
    '<div class="notebook clearfix">' +
    '<div class="notebook-content"></div>' +
    '<a href="http://mulesoft.com/" class="ir powered-by-logo">Mulesoft</a>' +
    '</div>'
  ));

  // Keep a static reference to the notebook contents element.
  this._contentsEl = this.el.lastChild.firstChild;

  return this;
};

/**
 * Append the application view to an element.
 *
 * @return {App}
 */
App.prototype.appendTo = function () {
  View.prototype.appendTo.apply(this, arguments);
  this.renderNotebook();
  return this;
};

/**
 * Runs the entire notebook sequentially.
 */
App.prototype.runNotebook = function () {
  return this.notebook && this.notebook.execute();
};

/**
 * Authenticate with the persistence layer.
 */
App.prototype.authNotebook = function () {
  persistence.authenticate();
};

/**
 * Fork the current notebook in-memory.
 */
App.prototype.forkNotebook = function () {
  persistence.fork();
};

/**
 * Manually attempt to save the notebook.
 */
App.prototype.saveNotebook = function () {
  persistence.save();
};
