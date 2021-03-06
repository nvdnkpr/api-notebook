var _ = require('underscore');

var AJAX_TIMEOUT = 20000;

/**
 * Ajax middleware transportation protocol. Allows third-party to hook into the
 * middleware and augment properties such as the URL or request headers.
 *
 * @param  {Object} middleware
 */
module.exports = function (middleware) {
  /**
   * Send an ajax request and return the xhr request back to the final listener.
   *
   * @param  {Object}   options
   * @param  {Function} next
   */
  middleware.core('ajax', function (options, next) {
    var url     = options.url;
    var method  = options.method || 'GET';
    var xhr     = options.xhr = new XMLHttpRequest();
    var timeout = +options.timeout || AJAX_TIMEOUT;
    var async   = options.async === false ? false : true;
    var ajaxTimeout;

    /**
     * Wraps callback functions to remove xhr data.
     *
     * @param  {Function} fn
     * @return {Function}
     */
    var complete = function (fn) {
      return function () {
        window.clearTimeout(ajaxTimeout);

        // Remove all xhr callbacks. No need to keep references to unused
        // functions.
        xhr.onload = xhr.onerror = xhr.onabort = null;

        return fn.apply(this, arguments);
      };
    };

    xhr.open(method, url, async);

    // Sets all request headers before we make the request.
    _.each(options.headers, function (value, header) {
      xhr.setRequestHeader(header, value);
    });

    // Enable hooking into the ajax request before we send it.
    if (options.beforeSend) {
      options.beforeSend(xhr);
    }

    // Successful callback.
    xhr.onload = complete(function () {
      return next(null, xhr);
    });

    // Failure callback.
    xhr.onerror = xhr.onabort = complete(function () {
      return next(new Error(xhr.statusText || 'Ajax request aborted'), xhr);
    });

    // Set a request timeout. Modern browsers can set a `timeout` property
    // which works the same, but we'll use a timeout for consistency.
    if (async) {
      ajaxTimeout = window.setTimeout(complete(function () {
        xhr.abort();

        // Calls the `next` function with the timeout details.
        return next(
          new Error('Ajax timeout of ' + timeout + 'ms exceeded'), xhr
        );
      }), timeout);
    }

    xhr.send(options.data);
  });
};
