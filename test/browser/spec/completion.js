/* global describe, it */

describe('Completion', function () {
  var editor;

  beforeEach(function () {
    editor = new CodeMirror(document.body, {
      mode: 'javascript'
    });
    new App.CodeMirror.Completion(editor, {
      global:  window,
      context: window
    });
  });

  afterEach(function () {
    delete window.test;
    document.body.removeChild(editor.getWrapperElement());
  });

  var testAutocomplete = function (text, expected, unexpected) {
    return function (done) {
      testCompletion(editor, text, function (results) {
        try {
          if (expected) {
            expect(results).to.contain(expected);
          }

          if (unexpected) {
            expect(results).to.not.contain(unexpected);
          }
        } catch (e) {
          return done(e);
        }

        return done();
      });
    };
  };

  it('should complete keywords', testAutocomplete('sw', 'switch'));

  it('should complete variables', testAutocomplete('doc', 'document'));

  it('should complete exact matches', testAutocomplete('window', 'window'));

  it(
    'should complete using static analysis',
    testAutocomplete('var testing = "test";\ntes', 'testing')
  );

  it(
    'should complete from outer scope statically',
    testAutocomplete('var testing = "test";\nfunction () {\n  tes', 'testing')
  );

  it(
    'should complete from the global scope statically',
    testAutocomplete(
      'var testing = "test";\nfunction () {\n  var test = "again";\n' +
      '  function () {\n    tes',
      'testing'
    )
  );

  describe('properties', function () {
    it(
      'should complete object properties',
      testAutocomplete('document.getElementBy', 'getElementById')
    );

    it('should complete single characters', function (done) {
      window.test = { o: 'test' };

      testAutocomplete('test.', 'o')(done);
    });

    it('should complete numbers', testAutocomplete('123..to', 'toFixed'));

    it('should complete strings', testAutocomplete('"test".sub', 'substr'));

    it(
      'should complete regular expressions',
      testAutocomplete('(/./g).te', 'test')
    );

    it('should complete booleans', testAutocomplete('true.to', 'toString'));

    it('should complete function property', testAutocomplete('Date.n', 'now'));

    it(
      'should complete constructor properties',
      testAutocomplete('new Date().get', 'getYear')
    );

    it(
      'should complete object constructor properties',
      testAutocomplete('new window.Date().get', 'getYear')
    );

    it(
      'should complete normal object properties with new',
      testAutocomplete('new window.Dat', 'Date')
    );

    it(
      'constructor should work without parens',
      testAutocomplete('(new Date).get', 'getMonth')
    );

    it(
      'should work with parens around the value',
      testAutocomplete('(123).to', 'toFixed')
    );

    it(
      'should work with arbitrary prefixed characters for the completion',
      testAutocomplete('(wind', 'window')
    );

    it('should not complete plain functions', function (done) {
      window.test = function () {};
      window.test.prop = 'test';

      testAutocomplete('test().', null, 'prop')(done);
    });

    it('should not complete invalid with multiline parens', function (done) {
      window.test = function () {};

      // Catch case where it switches to "global mode"
      testAutocomplete('test(\n"test").', null, 'window')(function (err) {
        if (err) { done(err); }
        // Catching case where it assumes the value on the inside of the paren
        testAutocomplete('test(\n"string").', null, 'substr')(done);
      });
    });

    it(
      'should not complete made up functions',
      testAutocomplete('"test".fake().', null, 'substr')
    );

    it('should complete numbers in the square brackets', function (done) {
      window.test = ['string'];

      testAutocomplete('test[0].', 'substr')(done);
    });

    it('should complete strings in the square brackets', function (done) {
      window.test = {
        string: 'test'
      };

      testAutocomplete('test["string"].', 'substr')(done);
    });

    it('should complete booleans in the square brackets', function (done) {
      window.test = {
        'true': 'test'
      };

      testAutocomplete('test[true].', 'substr')(done);
    });

    it('should complete undefined in the square brackets', function (done) {
      window.test = {
        'undefined': 'test'
      };

      testAutocomplete('test[undefined].', 'substr')(done);
    });

    it('should complete a regex in the square brackets', function (done) {
      window.test = {
        '/./': 'test'
      };

      testAutocomplete('test[/./].', 'substr')(done);
    });

    it('should complete basic variables in the square brackets', function (done) {
      window.test = {
        test: 'test'
      };

      window.variable = 'test';

      testAutocomplete('test[variable].', 'substr')(done);
    });

    it('should complete properties in the square brackets', function (done) {
      window.test = {
        test: 'test'
      };

      window.property = {
        nested: {
          test: 'test'
        }
      };

      testAutocomplete('test[property.nested.test].', 'substr')(done);
    });

    it('should complete sequential square bracket properties', function (done) {
      window.test = {
        test: {
          again: 'test'
        }
      };

      testAutocomplete('test["test"]["again"].', 'substr')(done);
    });

    it('should not complete empty bracket notation', function (done) {
      window.test = [1, 2, 3];

      testAutocomplete('test[].', null, 'concat')(done);
    });

    it('should complete nested square bracket properties', function (done) {
      window.test = {
        test: 'test'
      };

      window.property = {
        nested: 'test'
      };

      testAutocomplete('test[property["nested"]].', 'substr')(done);
    });

    it(
      'should complete array literals',
      testAutocomplete('[1, 2, 3].con', 'concat')
    );

    it(
      'should not complete square brackets that can\'t be done statically',
      testAutocomplete('window[1 + 2 + 3].w', null, 'window')
    );

    describe('Multiple Lines', function () {
      it(
        'should complete properties across multiple lines',
        testAutocomplete('document\n.getEle', 'getElementById')
      );

      it(
        'should complete properties across multiple lines with whitespace',
        testAutocomplete('document \n\t.getEle', 'getElementById')
      );

      it(
        'should complete properties over multiple parts and lines',
        testAutocomplete('document\n  .\t\n getEl', 'getElementById')
      );

      it(
        'should complete square brackets over multiple lines',
        testAutocomplete('window\n["Date"]\n.', 'now')
      );

      it(
        'should complete square brackets over multiple lines with whitespace',
        testAutocomplete('window \n\t[ "Date"  ].\n\tn', 'now')
      );

      it(
        'should complete arrays over multiple lines',
        testAutocomplete('[\n1, 2, 3\n].', 'concat')
      );
    });

    describe('Whitespace', function () {
      it(
        'should ignore whitespace after variable',
        testAutocomplete('window  .win', 'window')
      );

      it(
        'should ignore whitespace before property',
        testAutocomplete('window.   win', 'window')
      );

      it(
        'should ignore whitespace before after after properties',
        testAutocomplete('window    .   win', 'window')
      );

      it(
        'should ignore whitespace at beginning of parens',
        testAutocomplete('(   123).to', 'toFixed')
      );

      it(
        'should ignore whitespace at the end of parens',
        testAutocomplete('(123    ).to', 'toFixed')
      );

      it(
        'should ignore whitespace at the beginning and end of parens',
        testAutocomplete('(    123    ).to', 'toFixed')
      );

      it('should ignore whitespace with square brackets', function (done) {
        window.test = ['string'];

        testAutocomplete('test  [ 0  ].', 'substr')(done);
      });
    });
  });

  describe('middleware', function () {
    it('should be able to hook onto variable completion', function (done) {
      var spy = sinon.spy(function (data, next) {
        data.results.something = true;
        next();
      });

      App.middleware.use('completion:variable', spy);

      testAutocomplete('some', 'something')(function () {
        expect(spy).to.have.been.calledOnce;
        App.middleware.disuse('completion:variable', spy);
        done();
      });
    });

    it('should be able to hook onto context lookups', function (done) {
      var spy = sinon.spy(function (data, next, done) {
        data.context = { random: 'property' };
        done();
      });

      App.middleware.use('completion:context', spy);

      testAutocomplete('something.ran', 'random')(function () {
        expect(spy).to.have.been.calledOnce;
        App.middleware.disuse('completion:context', spy);
        done();
      });
    });

    it('should be able to hook into property completion', function (done) {
      var spy = sinon.spy(function (data, next) {
        data.results.somethingElse = true;
        next();
      });

      App.middleware.use('completion:property', spy);

      testAutocomplete('moreOf.some', 'somethingElse')(function () {
        expect(spy).to.have.been.calledOnce;
        App.middleware.disuse('completion:property', spy);
        done();
      });
    });
  });
});
