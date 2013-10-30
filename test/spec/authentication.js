/* global describe, it, beforeEach, afterEach */

describe('Authentication', function () {
  describe('Oauth2', function () {
    var oldOpen, server;

    beforeEach(function () {
      server = sinon.fakeServer.create();
      sinon.stub(window, 'open').returns({});
    });

    afterEach(function () {
      server.restore();
      window.open.restore();
    });

    it('should be able to do the server-side code flow', function (done) {
      var tokenUrl         = 'https://www.example.com/oauth2/token';
      var authorizationUrl = 'https://www.example.com/oauth2/authorize';

      App.middleware.trigger('authenticate:oauth2', {
        clientId:            '',
        clientSecret:        '',
        accessTokenUrl:      tokenUrl,
        authorizationGrants: 'code',
        authorizationUrl:    authorizationUrl
      }, function (err, auth) {
        expect(err).to.not.exist;
        expect(auth.accessToken).to.equal('123456');

        return done();
      });

      server.respondWith(
        'POST',
        'https://www.example.com/oauth2/token',
        [200, {
          'Content-Type': 'application/json'
        }, '{"access_token":"123456","token_type":"bearer"}']
      );

      expect(window.open.lastCall.args[0]).to.contain(authorizationUrl);
      // Cheat and grab the state we passed through to the authentication server.
      var state = window.open.lastCall.args[0].match(/state=(\w+)/)[1];
      window.authenticateOAuth2(App.Library.url.resolve(
        location.href, 'authentication/oauth2.html?code=123&state=' + state
      ));

      server.respond();
    });
  });
});
