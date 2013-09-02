var path = require('path');
var fs = require('fs');
var http = require('http');
var util = require("util");

var mkdirp = require('mkdirp');

var Gitana = require('gitana');

var localeUtil = require("../util/locale");

var dust = require("dustjs-linkedin");
require('dustjs-helpers');
require("./dusthelpers")(dust);

var exports = module.exports;

var populateContext = function(context, model)
{
    if (model)
    {
        for (var k in model)
        {
            context[k] = model[k];
        }
    }

    // TODO: populate user information
    context.user = {
        "name": "user@user.com",
        "firstName": "First Name",
        "lastName": "Last Name",
        "email": "user@email.com"
    };
};

exports.execute = function(filePath, model, callback)
{
    if (typeof(model) === "function")
    {
        callback = model;
        model = {};
    }

    var templatePath = filePath.split(path.sep).join("/");

    // load the contents of the file
    // make sure this is text
    var compiled = false;
    if (!dust.cache[templatePath])
    {
        var html = "" + fs.readFileSync(filePath);

        try
        {
            // compile
            var compiledTemplate = dust.compile(html, templatePath);
            dust.loadSource(compiledTemplate);

            compiled = true;
        }
        catch (e)
        {
            // compilation failed
            console.log("Compilation failed for: " + filePath);
            console.log(e);
        }
    }
    else
    {
        compiled = true;
    }

    // render compiled file
    if (compiled)
    {
        // build context
        var context = {};
        populateContext(context, model);

        // execute template
        dust.render(templatePath, context, function(err, out) {

            if (err)
            {
                console.log("An error was caught while rendering dust template: " + filePath + ", error: " + err);
            }

            callback(err, out);
        });
    }
    else
    {
        callback({
            "mesage": "Unable to compile template for file path: " + filePath
        });
    }
};

var watch = require("watch");
if (process.env.CLOUDCMS_APPSERVER_PUBLIC_PATH)
{
    var watchPath = path.join(process.env.CLOUDCMS_APPSERVER_PUBLIC_PATH);
    watch.watchTree(watchPath, {
        "ignoreDotFiles": true
    }, function (f, curr, prev) {

        for (var k in dust.cache)
        {
            delete dust.cache[k];
        }

    });
}