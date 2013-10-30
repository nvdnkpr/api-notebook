var request     = require('request');
var DEV         = process.env.NODE_ENV !== 'production';
var PLUGIN_DIR  = __dirname + '/public/scripts/plugins/addons';
var BUILD_DIR   = __dirname + '/build';
var TEST_DIR    = BUILD_DIR + '/test';
var FIXTURE_DIR = TEST_DIR  + '/fixtures';
var PORT        = process.env.PORT      || 3000;
var TEST_PORT   = process.env.TEST_PORT || 9876;

var serverMiddleware = function (connect, options) {
  var middleware = [];

  // Enables cross-domain requests.
  middleware.push(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin',  '*');
    res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With');
    return next();
  });

  // Serve the regular static directory.
  middleware.push(connect.static(options.base));

  middleware.push(function (req, res, next) {
    if (req.url.substr(0, 7) !== '/proxy/') {
      return next();
    }

    var url = req.url.substr(7);

    // Attach the client secret to any Github access token requests.
    if (/^https?:\/\/github.com\/login\/oauth\/access_token/.test(url)) {
      url += (url.indexOf('?') > -1 ? '&' : '?');
      url += 'client_secret=';
      url += encodeURIComponent(process.env.GITHUB_CLIENT_SECRET);
    }

    var proxy = request(url);

    // Send the proxy error to the client.
    proxy.on('error', function (err) {
      res.writeHead(500);
      return res.end(err.message);
    });

    // Pipe the request data directly into the proxy request and back to the
    // response object. This avoids having to buffer the request body in cases
    // where they could be unexepectedly large and/or slow.
    return req.pipe(proxy).pipe(res);
  });

  return middleware;
};

module.exports = function (grunt) {
  require('matchdep').filterDev('grunt-*').forEach(grunt.loadNpmTasks);

  var jsRegex             = /\.js$/;
  var browserifyPlugins   = {};
  var browserifyTransform = ['envify'];

  if (!DEV) {
    browserifyTransform.push('uglifyify');
  }

  require('fs').readdirSync(PLUGIN_DIR).forEach(function (filename) {
    if (!jsRegex.test(filename)) { return; }
    // Remove trailing extension and transform to camelCase
    var baseName = grunt.util._.camelize(filename.replace(jsRegex, ''));

    browserifyPlugins[baseName] = {
      src:  PLUGIN_DIR + '/' + filename,
      dest: 'build/plugins/' + filename,
      options: {
        debug:      DEV,
        transform:  browserifyTransform,
        standalone: baseName + 'Plugin'
      }
    };
  });

  grunt.initConfig({
    clean: {
      build: BUILD_DIR
    },

    copy: {
      build: {
        files: [
          {
            expand: true,
            cwd: 'public',
            src: ['*.html', 'raml/*.yml', 'authentication/**', 'images/**'],
            dest: 'build/'
          },
          {
            expand: true,
            cwd: 'test/fixtures',
            src: '**',
            dest: FIXTURE_DIR
          },
          {
            expand: true,
            cwd: 'public/fontello/font',
            src: '*',
            dest: 'build/font'
          }
        ]
      }
    },

    connect: {
      server: {
        options: {
          middleware: serverMiddleware,
          port: PORT,
          base: BUILD_DIR
        }
      },
      'test-server': {
        options: {
          middleware: serverMiddleware,
          port: TEST_PORT,
          base: BUILD_DIR
        }
      }
    },

    jshint: {
      all: {
        src: ['routes/**/*.js', 'public/**/*.js', '*.js']
      },
      options: {
        jshintrc: '.jshintrc'
      }
    },

    shell: {
      'mocha-browser': {
        command: './node_modules/.bin/mocha-phantomjs test/index.html',
        options: {
          stdout: true,
          stderr: true,
          failOnError: true
        }
      }
    },

    browserify: grunt.util._.extend({
      application: {
        src: 'public/scripts/index.js',
        dest: 'build/scripts/bundle.js',
        options: {
          debug:     DEV,
          transform: browserifyTransform
        }
      },
      embed: {
        src: 'public/scripts/embed.js',
        dest: 'build/scripts/embed.js',
        options: {
          debug:      DEV,
          transform:  browserifyTransform,
          standalone: 'Notebook'
        }
      },
      test: {
        src: ['test/scripts/common.js', 'test/scripts/helpers.js'],
        dest: TEST_DIR + '/scripts/bundle.js',
        options: {
          debug:     DEV,
          transform: browserifyTransform
        }
      }
    }, browserifyPlugins),

    stylus: {
      compile: {
        files: {
          'build/styles/main.css': 'public/styles/index.styl'
        },
        options: {
          'include css': true,
          import: [
            'nib',
            'includes/colors.styl'
          ]
        }
      }
    },

    watch: {
      html: {
        files: ['public/**/*.{html,yml}'],
        tasks: ['newer:copy:build']
      },
      lint: {
        files: ['<%= jshint.all.src %>'],
        tasks: ['newer:jshint:all']
      },
      scripts: {
        files: ['public/**/*.js'],
        tasks: ['browserify']
      },
      styles: {
        files: ['public/**/*.styl'],
        tasks: ['stylus']
      }
    }
  });

  // Set the notebook test url.
  grunt.registerTask('test-notebook-url', function () {
    process.env.NOTEBOOK_URL = 'http://localhost:' + TEST_PORT;
  });

  // Test the application in a headless browser environment.
  grunt.registerTask('test-browser', [
    'test-notebook-url', 'build', 'connect:test-server', 'shell:mocha-browser'
  ]);

  // Test the application in a headless environment.
  grunt.registerTask('test', [
    'check', 'test-browser'
  ]);

  // Generate the built application.
  grunt.registerTask('build', [
    'clean:build', 'copy:build', 'browserify', 'stylus'
  ]);

  // Do a static check to make sure the code is correct.
  grunt.registerTask('check', [
    'jshint:all'
  ]);

  // Build the application and watch for file changes.
  grunt.registerTask('default', [
    'build', 'connect:server', 'watch'
  ]);
};
