var path = require('path');
var fs = require('fs');
var http = require('http');

var util = require("../../util/util");

var duster = require("../../duster");


/**
 * Server Tags Middleware.
 *
 * Performs variable and token substitution on some text files that find themselves being served.
 * This includes any HTML file and the gitana.js driver.
 */
exports = module.exports = function()
{
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////
    //
    // RESULTING OBJECT
    //
    //////////////////////////////////////////////////////////////////////////////////////////////////////////////

    var r = {};

    r.interceptor = function()
    {
        return util.createInterceptor("serverTags", function(req, res, next, configuration, stores) {

            var webStore = stores.web;

            var doParse = false;
            if (req.path.indexOf(".html") !== -1)
            {
                doParse = true;
            }

            if (doParse)
            {
                wrapWithDustParser(webStore, req, res);
                next();
                return;
            }

            var doGitanaInject = false;
            if (req.path.indexOf("/gitana/gitana.js") > -1 || req.path.indexOf("/gitana/gitana.min.js") > -1)
            {
                if (req.gitanaConfig)
                {
                    doGitanaInject = true;
                }
            }

            if (doGitanaInject)
            {
                wrapWithGitanaInjection(req, res);
                next();
                return;
            }

            // otherwise, we don't bother
            next();
        });
    };

    var wrapWithDustParser = function(webStore, req, res)
    {
        var _sendFile = res.sendFile;
        var _send = res.send;

        res.sendFile = function(filePath, options, fn)
        {
            // path to the html file
            var fullFilePath = filePath;
            if (options.root) {
                fullFilePath = path.join(options.root, fullFilePath);
            }

            // read the file
            webStore.readFile(fullFilePath, function(err, text) {

                if (!text)
                {
                    _sendFile.call(res, filePath, options, fn);
                    return;
                }
                text = text.toString();
                var z = text.indexOf("{@query");
                if (z === -1)
                {
                    _sendFile.call(res, filePath, options, fn);
                    return;
                }
                duster.execute(req, fullFilePath, function(err, out) {

                    if (err)
                    {
                        // use the original method
                        _sendFile.call(res, filePath, options, fn);
                    }
                    else
                    {
                        _send.call(res, 200, out);
                    }
                });

            });
        };
    };

    var wrapWithGitanaInjection = function(req, res, next)
    {
        var _sendFile = res.sendFile;
        var _send = res.send;

        res.sendFile = function(filePath, options, fn)
        {
            var filename = path.basename(filePath);

            // process file and insert CLIENT_KEY into the served gitana driver
            var json = req.gitanaConfig;
            if (json.clientKey)
            {
                // check "cloudcms-server" node modules
                filePath = path.join(__dirname, "..", "..", "node_modules", "gitana", "lib", filename);
                if (!fs.existsSync(filePath)) // OK
                {
                    // check another level up
                    filePath = path.join(__dirname, "..", "..", "..", "..", "node_modules", "gitana", "lib", filename);
                }

                fs.readFile(filePath, function(err, text) { // OK

                    if (err)
                    {
                        fn(err);
                        return;
                    }

                    text = "" + text;

                    var ick = "Gitana.__INSERT_MARKER = null;";

                    var i1 = text.indexOf(ick);
                    if (i1 > -1)
                    {
                        var i2 = i1 + ick.length;

                        var config = {
                            "clientKey": json.clientKey
                        };
                        // NO, this does not get handed back
                        // FOR NOW, hand back because the Apache proxy doesn't auto-insert and we're still
                        // using it for /console
                        //if (json.clientSecret) {
                        //    config.clientSecret = json.clientSecret;
                        //}
                        if (json.application) {
                            config.application = json.application;
                        }

                        // append in the default config settings
                        var itext = "";
                        itext += "/** INSERTED BY CLOUDCMS-NET SERVER **/";
                        itext += "Gitana.autoConfigUri = false;";
                        itext += "Gitana.loadDefaultConfig = function() {";
                        itext += "   return " + JSON.stringify(config, null, "   ") + ";";;
                        itext += "};";
                        itext += "/** END INSERTED BY CLOUDCMS-NET SERVER **/";

                        text = text.substring(0, i1) + itext + text.substring(i2);
                    }

                    res.status(200);
                    _send.call(res, text);

                    fn();
                });
            }
            else
            {
                fn({
                    "message": "Missing json clientKey in gitana config"
                });
            }
        };
    };

    return r;
}();
