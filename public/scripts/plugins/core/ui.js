var _        = require('underscore');
var domify   = require('domify');
var Backbone = require('backbone');
var messages = require('../../state/messages');

/**
 * Generate the HTML for a modal popup.
 *
 * @type {Function}
 */
var template = _.template([
  '<div class="modal" tabindex="-1" data-dismiss>',
  '<div class="modal-dialog">',
  '<div class="modal-content">',
  '<% if (title) { %>',
  '<div class="modal-header">',
  '<button class="modal-close" data-dismiss>&times;</button>',
  '<h4 class="modal-title" id="myModalLabel"><%- title %></h4>',
  '</div>',
  '<% } %>',
  '<div class="modal-body">',
  '<%= content %>',
  '</div>',
  '</div>',
  '</div>',
  '</div>'
].join('\n'));

/**
 * Simple middleware handler for opening modal windows. It should proceed to
 * the next function in the execution stack when the modal window is closed.
 *
 * @param {Object}   options
 * @param {Function} next
 * @param {Function} done
 */
var modalPlugin = function (options, next, done) {
  var modal = domify(template(options));

  var close = function () {
    messages.off('keydown:Esc', close);
    document.body.removeChild(modal);
    document.body.classList.remove('modal-visible');
    return done();
  };

  document.body.appendChild(modal);
  document.body.classList.add('modal-visible');

  messages.on('keydown:Esc', close);
  Backbone.$(modal).on('click', function (e) {
    if (e.target !== modal) { return; }

    return close();
  });
  Backbone.$(modal).on('click', '[data-dismiss]', close);
};

/**
 * Attach the core UI-based middleware plugins.
 *
 * @param {Object} middleware
 */
module.exports = function (middleware) {
  middleware.core('ui:modal', modalPlugin);
};
