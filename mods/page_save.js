'use strict';


/**
 * page_save module
 *
 * Sends the wikitext of a page to the MW API for saving
 */


var P = require('bluebird');
var URI = require('swagger-router').URI;
var rbUtil = require('../lib/rbUtil');


function PageSave(options) {
    var self = this;
    this.log = options.log || function() {};
    this.spec = {
        paths: {
            '/wikitext/{title}{/revision}': {
                post: {
                    operationId: 'saveWikitext'
                }
            }
        }
    };
    this.operations = {
        saveWikitext: self.saveWikitext.bind(self)
    };
}

PageSave.prototype._getRevInfo = function(restbase, req) {
    var rp = req.params;
    var path = [rp.domain,'sys','page_revisions','page',
                         rbUtil.normalizeTitle(rp.title)];
    if (!/^(?:[0-9]+)$/.test(rp.revision)) {
        throw new Error("Invalid revision: " + rp.revision);
    }
    path.push(rp.revision);
    return restbase.get({
        uri: new URI(path)
    })
    .then(function(res) {
        return res.body.items[0];
    }).catch(function(err) {
        if(err.status != 403) {
            throw err;
        }
        // we are dealing with a restricted revision
        // however, let MW deal with it as the user
        // might have sufficient permissions to do an edit
        return {title: rbUtil.normalizeTitle(rp.title)};
    });
};

PageSave.prototype.saveWikitext = function(restbase, req) {
    var rp = req.params;
    var promise = P.resolve({
        title: rbUtil.normalizeTitle(rp.title)
    });
    if(rp.revision) {
        promise = this._getRevInfo(restbase, req);
    }
    return promise.then(function(revInfo) {
        var body = {
            action: 'edit',
            format: 'json',
            formatversion: 2,
            title: revInfo.title,
            text: req.body.text,
            summary: req.body.summary || 'Change text to: ' + req.body.text.substr(0, 100),
            minor: req.body.minor,
            bot: req.body.bot,
            token: req.body.token
        };
        // we need to add each info separately
        // since the presence of an empty value
        // might startle the MW API
        if(revInfo.rev) { body.parentrevid = revInfo.rev; }
        if(revInfo.timestamp) { body.basetimestamp = revInfo.timestamp; }
        // FIXME: use the action module instead here!
        return restbase.post({
            uri: 'http://' + rp.domain + '/w/api.php',
            headers: {
                cookie: req.headers.cookie
            },
            body: body
        });
    });
};



module.exports = function(options) {
    var ps = new PageSave(options || {});
    return {
        spec: ps.spec,
        operations: ps.operations
    };
};

