/* global describe, it */

describe('Editor Cell', function () {
  var Editor  = App.View.EditorCell;
  var fixture = document.getElementById('fixture');

  it('should exist', function () {
    expect(Editor).to.be.a('function');
  });

  it('should enable editor options to be extended', function () {
    expect(Editor.prototype.editorOptions).to.be.an('object');
  });

  describe('Editor Cell instance', function () {
    var view;

    beforeEach(function () {
      view = new Editor();
    });

    it('should have a class', function () {
      expect(view.el.className).to.contain('cell');
    });

    describe('#render', function () {
      var editor;

      beforeEach(function () {
        view   = view.render();
        editor = view.editor;
      });

      it('should initialize a CodeMirror instance', function () {
        expect(editor).to.be.an.instanceof(CodeMirror);
      });

      it('should have smart defaults set', function () {
        expect(editor.getOption('tabSize')).to.equal(2);
        expect(editor.getOption('lineNumbers')).to.be.ok;
        expect(editor.getOption('lineWrapping')).to.be.ok;
      });

      it('should render with a previous value', function () {
        view.model = new App.Model.Entry({
          value: 'testing'
        });

        expect(view.render().editor.getValue()).to.equal('testing');
      });

      it('should always set the cursor at the end of the editor', function () {
        view.model = new App.Model.Entry({
          value: 'testing'
        });

        expect(view.render().editor.getCursor().ch).to.equal(7);
      });
    });

    describe('Editor', function () {
      var editor;

      beforeEach(function () {
        view   = view.render().appendTo(fixture);
        editor = view.editor;
      });

      afterEach(function () {
        view.remove();
      });

      // Keyboard shortcuts need to be tested across browser
      describe('keyboard shortcuts', function () {
        var UP     = 38;
        var DOWN   = 40;
        var DELETE = 8;

        it('Navigate Up (`Alt-Up`)', function () {
          var spy = sinon.spy();
          view.on('navigateUp', spy);
          fakeKey(editor, UP, { altKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Navigate Down (`Alt-Down`)', function () {
          var spy = sinon.spy();
          view.on('navigateDown', spy);
          fakeKey(editor, DOWN, { altKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Move Cell Up (`Cmd-Alt-Up`)', function () {
          var spy = sinon.spy();
          view.on('moveUp', spy);
          fakeKey(editor, UP, { altKey: true, metaKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Move Cell Down (`Cmd-Alt-Down`)', function () {
          var spy = sinon.spy();
          view.on('moveDown', spy);
          fakeKey(editor, DOWN, { altKey: true, metaKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Clone Cell (`Ctrl-Alt-C`)', function () {
          var spy = sinon.spy();
          view.on('clone', spy);
          fakeKey(editor, 'C', { altKey: true, ctrlKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Delete Cell (`Cmd-Delete`)', function () {
          var spy = sinon.spy();
          view.on('remove', spy);
          fakeKey(editor, DELETE, { metaKey: true });
          expect(spy.calledOnce).to.be.ok;
        });

        it('Switch Cell (`Cmd-Alt-B`)', function () {
          var spy = sinon.spy();
          view.on('switch', spy);
          fakeKey(editor, 'B', { metaKey: true, altKey: true });
          expect(spy.calledOnce).to.be.ok;
        });
      });

      it('#focus', function () {
        var el = document.createElement('input');
        fixture.appendChild(el);
        el.focus();
        fixture.removeChild(el);

        expect(editor.hasFocus()).to.not.be.ok;
        view.focus();
        expect(editor.hasFocus()).to.be.ok;
      });

      it('#setValue', function () {
        view.setValue('testing');

        expect(editor.getValue()).to.equal('testing');
      });

      it('#getValue', function () {
        editor.setValue('testing');

        expect(view.getValue()).to.equal('testing');
      });

      it('#moveCursorToEnd', function () {
        editor.setValue('multi\nline\ntest');

        view.moveCursorToEnd();
        expect(editor.getCursor().ch).to.equal(4);
        expect(editor.getCursor().line).to.equal(2);

        view.moveCursorToEnd(0);
        expect(editor.getCursor().ch).to.equal(5);
        expect(editor.getCursor().line).to.equal(0);

        view.moveCursorToEnd(1);
        expect(editor.getCursor().ch).to.equal(4);
        expect(editor.getCursor().line).to.equal(1);
      });
    });
  });
});