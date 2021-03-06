var Backbone = require('backbone');

/**
 * Create a new view instance. This is the base view instance so any generic
 * view methods or functionality should be added here.
 *
 * @type {Function}
 */
var View = module.exports = Backbone.View.extend();

/**
 * Render the view instance.
 *
 * @return {View}
 */
View.prototype.render = function () {
  this.el.innerHTML = '';
  return this;
};

/**
 * Remove the view instance from the DOM.
 *
 * @return {View}
 */
View.prototype.remove = function () {
  // Trigger the `remove` event before actually removing the view since we may
  // need to append a new element afterward, etc. Also needs to be called before
  // `#off()` - no events will work anymore after calling it.
  this.trigger('remove', this);
  Backbone.View.prototype.remove.call(this);
  return this;
};

/**
 * Insert an element last in the list of child nodes of this view.
 * @param    {Node} el  The element to append this view to.
 * @returns  {View}     This view.
 */
View.prototype.appendTo = function (el) {
  if (typeof el.appendChild === 'function') {
    el.appendChild(this.el);
  } else {
    el.call(this, this.el);
  }
  return this;
};

/**
 * Insert an element first in the list of child nodes of this element.
 * @param    {Node} el  The element to prepend this view to.
 * @returns  {View}     This view.
 */
View.prototype.prependTo = function (el) {
  var thisEl = this.el;
  this.appendTo(function () {
    el.insertBefore(thisEl, el.firstChild);
  });
  return this;
};
