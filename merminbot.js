var express = require('express');
var app = express();
var stylus = require('stylus');
var nib = require('nib');
var db = require('mongodb').MongoClient;
var moment = require('moment');
var params = require('./params.js');

function compile(str, path) { return stylus(str) .set('filename', path) .use(nib()) }
app.use(express.logger('dev'));
app.set('views', __dirname + '/views');
app.set('view engine', 'jade');
app.use(stylus.middleware( { src: __dirname + '/public' , compile: compile } ))
app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.listen(app.get('port'), function() {
    console.log("merminbot web running at localhost:" + app.get('port'))
})

app.get('/', function(req, res) {
    res.render('index');
});

require('./merminbot.irc.js');