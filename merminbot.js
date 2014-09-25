var express = require('express');
var app = express();
var db = require('mongodb').MongoClient;
var moment = require('moment');
var params = require('./params.js');

app.get('/', function(request, response) {
    response.send('connect!');
});

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'))
})

require('./merminbot.irc.js');