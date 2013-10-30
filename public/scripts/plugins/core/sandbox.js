var loadScript = require('../../lib/browser/load-script');

var ASYNC_TIMEOUT = 2000;

/**
 * Set the some additional context variables.
 *
 * @param {Object}   context
 * @param {Function} next
 */
var contextPlugin = function (context, next) {
  // Unfortunately it isn't as easy as this since we have lexical scoping issues
  // with the wrong window object. It would load the script in the wrong window.
  context.load    = function (/* src, done */) {};
  context.async   = function () {};
  context.timeout = function () {};

  return next();
};

/**
 * Sets up the pre-execution plugin.
 *
 * @param {Object}   data
 * @param {Function} next
 * @param {Function} done
 */
var executePlugin = function (data, next, done) {
  /* global App */
  var code    = 'with (window.console._notebookApi) {\n' + data.code + '\n}';
  var async   = false;
  var exec    = {};
  var context = data.context;
  var fallback;

  // Provides additional context under the `console` object. This works in the
  // same fashion as how Chrome's console is implemented, and has the benefit
  // of any context variables not wiping out `window` variables (they will
  // just be shadowed using `with`).
  data.window.console = data.window.console || {};
  data.window.console._notebookApi = context;

  /**
   * Completed code cell execution and removes left over content.
   *
   * @param {Error}  err
   * @param {Object} data
   */
  var complete = function (err, data) {
    window.clearTimeout(fallback);
    delete App._executeContext;
    delete data.window.console._notebookApi;
    return done(err, data);
  };

  /**
   * Pass in a timeout function that can be used to reset the async timer.
   *
   * @param {Number} ms
   */
  var timeout = context.timeout = function (ms) {
    var timeout = +ms;

    // Clears the old timeout before setting the new one.
    window.clearTimeout(fallback);

    // Break immediately if the timeout is an unknown number.
    if (isNaN(timeout) || timeout < 0) {
      return complete(new Error('Cannot use timeout of ' + ms + 'ms'));
    }

    // Add a fallback catch in case we are using the `async` function accidently
    // or not handling some edge case. This idea comes from `Mocha` async tests,
    // but we change the timeout by using `timeout = Infinity`.
    if (isFinite(timeout)) {
      fallback = window.setTimeout(function () {
        return complete(
          new Error('Timeout of ' + timeout + 'ms exceeded'), exec
        );
      }, timeout);
    }
  };

  /**
   * Call the async function within a code cell to trigger async mode. It will
   * return a function that should be used to end the async execution.
   *
   * @return {Function}
   */
  context.async = function () {
    // Sets the async flag to true so we don't trigger the callback immediately.
    async = true;

    // Return a function that can be executed to end the async operation inside
    // the cell. This is handy for all sorts of things, like ajax requests.
    return function (err, result) {
      // Passes iteration off to the middleware since it already caters for
      // async execution like this. This function accepts two parameters, like
      // a normal async callback, but instead off passing it directly off to
      // `done`, we need to transform it into the data format the result
      // cell understands and pass `null` as the error since we don't have an
      // execution error in this context (it came from the sandbox).
      exec.result  = err || result;
      exec.isError = !!err;
      return complete(null, exec);
    };
  };

  /* jshint evil: true */
  data.window.eval([
    'console._notebookApi.load = function (src, done) {',
    '  console._notebookApi.timeout(Infinity);', // Increase AJAX timeout.
    '  return (' + loadScript + ')(src, done || this.async());',
    '};'
  ].join('\n'));

  // Uses an asynchronous callback to clear the any possible stack trace
  // that would include implementation logic.
  process.nextTick(function () {
    App._executeWindow  = data.window;
    App._executeContext = context;

    // Sets up the initial timeout.
    timeout(ASYNC_TIMEOUT);

    try {
      /* jshint evil: true */
      exec.result  = data.window.eval(code);
      exec.isError = false;
    } catch (error) {
      exec.result  = error;
      exec.isError = true;
    } finally {
      // If the execution is not asynchronous or an error has been thrown,
      // trigger completion of the cell execution.
      if (!async || exec.isError) {
        return complete(null, exec);
      }
    }
  });
};

/**
 * Attach sandbox related core middleware.
 *
 * @param  {Object} middleware
 */
module.exports = function (middleware) {
  middleware.core('sandbox:execute', executePlugin);
  middleware.core('sandbox:context', contextPlugin);
};
