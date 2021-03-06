"use strict";

var dgram  = require('dgram');
var preq   = require('preq');
var http   = require('http');
var uuid   = require('cassandra-uuid').TimeUuid;

var server = require('../../utils/server.js');
var assert = require('../../utils/assert.js');

describe('Change event emitting', function() {

    before(function () { return server.start(); });

    it('should not explode if events config is not provided', function() {
        return preq.post({
            uri: server.config.baseURL + '/events_no_config/',
            body: [
                { uri: '//en.wikipedia.org' }
            ]
        });
    });

    function createEventLogging(done, eventOptions) {
        var eventLogging = http.createServer(function(request) {
            try {
                assert.deepEqual(request.method, 'POST');
                var postData;
                request.on('data', function(data) {
                    postData = postData ? Buffer.concat(postData, data) : data;
                });
                request.on('end', function() {
                    try {
                        var events = JSON.parse(postData.toString());
                        assert.deepEqual(events.length, 1);
                        var event = events[0];
                        assert.deepEqual(event.meta.domain, 'en.wikipedia.org');
                        assert.deepEqual(!!new Date(event.meta.dt), true);
                        assert.deepEqual(uuid.test(event.meta.id), true);
                        assert.deepEqual(!!event.meta.request_id, true);
                        assert.deepEqual(event.meta.topic, eventOptions.topic);
                        assert.deepEqual(event.meta.uri, eventOptions.uri);
                        assert.deepEqual(event.tags, ['test', 'restbase']);
                        if (eventOptions.trigger) {
                            assert.deepEqual(event.triggered_by, eventOptions.trigger);
                        }
                        done();
                    } catch (e) {
                        done(e);
                    }
                });
            } catch (e) {
                done(e);
            }
        });
        eventLogging.on('error', done);
        eventLogging.listen(8085);
        return eventLogging;
    }

    it('should send correct events to the service', function(done) {
        var eventLogging;

        function really_done(e) {
            if (eventLogging) {
                eventLogging.close();
                eventLogging = undefined;
                done(e)
            }
        }

        eventLogging = createEventLogging(really_done, {
            topic: 'resource_change',
            uri: 'http://en.wikipedia.org/wiki/User:Pchelolo'
        });

        preq.post({
            uri: server.config.baseURL + '/events/',
            headers: {
                'content-type': 'application/json',
                connection: 'close',
            },
            body: [
                {
                    meta: {
                        uri: '//en.wikipedia.org/wiki/User:Pchelolo'
                    },
                    tags: ['test']
                },
                {meta: {}},
                {should_not_be: 'here'}
            ]
        })
        .delay(20000)
        .finally(function() {
            really_done(new Error('HTTP event server timeout!'));
        });
    });

    it('should send correct events to the service, transcludes', function(done) {
        var eventLogging;

        function really_done(e) {
            if (eventLogging) {
                eventLogging.close();
                eventLogging = undefined;
                done(e)
            }
        }

        eventLogging = createEventLogging(really_done, {
            topic: 'change-prop.transcludes.resource-change',
            uri: 'http://en.wikipedia.org/api/rest_v1/page/html/User:Pchelolo',
            trigger: 'mediawiki.revision-create:https://en.wikimedia.org/wiki/Template:One,change-prop.transcludes.resource-change:https://en.wikipedia.org/wiki/User:Pchelolo'
        });

        preq.post({
            uri: server.config.baseURL + '/events/',
            headers: {
                'content-type': 'application/json',
                connection: 'close',
                'x-triggered-by': 'mediawiki.revision-create:https://en.wikimedia.org/wiki/Template:One,change-prop.transcludes.resource-change:https://en.wikipedia.org/wiki/User:Pchelolo'
            },
            body: [
                {
                    meta: {
                        uri: '//en.wikipedia.org/api/rest_v1/page/html/User:Pchelolo'
                    },
                    tags: ['test']
                }
            ]
        })
        .delay(20000)
        .finally(function() {
            really_done(new Error('HTTP event server timeout!'));
        });
    });

    it('Should skip event if it will cause a loop', function(done) {
        var eventLogging;

        function really_done(e) {
            if (eventLogging) {
                eventLogging.close();
                eventLogging = undefined;
                done(e)
            }
        }

        eventLogging = createEventLogging(really_done, {
            topic: 'resource_change',
            uri: 'http://en.wikipedia.org/wiki/User:Pchelolo',
            trigger: 'resource_change:https://en.wikipedia.org/wiki/Prohibited'
        });

        preq.post({
            uri: server.config.baseURL + '/events/',
            headers: {
                'content-type': 'application/json',
                'x-triggered-by': 'resource_change:https://en.wikipedia.org/wiki/Prohibited'
            },
            body: [
                {
                    meta: {
                        uri: '//en.wikipedia.org/wiki/Prohibited'
                    },
                    tags: ['test']
                },
                {
                    meta: {
                        uri: '//en.wikipedia.org/wiki/User:Pchelolo'
                    },
                    tags: ['test']
                }
            ]
        })
        .delay(20000)
        .finally(function() {
            really_done(new Error('HTTP event server timeout!'));
        });
    })
});
