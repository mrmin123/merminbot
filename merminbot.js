var express = require('express');
var app = express();
var stylus = require('stylus');
var nib = require('nib');
var db = require('mongodb').MongoClient;
var moment = require('moment');
var params = require('./params.js');
var functions = require('./merminbot.irc.functions.js');

function compile(str, path) { return stylus(str) .set('filename', path) .use(nib()) }
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

db.connect(params.db, function(err, db) {
    if (!err) {
        console.log('web db connect');
        
        var users = db.collection('users');
        var notes = db.collection('notes');
        var misc = db.collection('misc');
        
        app.get('/:channel', function(req, res){
            var channel = '#' + req.params.channel;
            misc.findOne(
                { 'status': 1 },
                { 'last_uptime': 1 },
                function (err, result_uptime) {
                    var body_raw = [];
                    body_raw.push('<h2>stats for bot in channel <strong>' + channel + '</strong></h2>');
                    var formatted_datetime = functions.parse_date(result_uptime['last_uptime']);
                    body_raw.push('<div class="box"><i class="fa fa-globe fa-5x"></i><strong>' + formatted_datetime[0] + '<br />' + formatted_datetime[1] + '</strong><span>last bot ping</span></div>');
                    
                    users.find(
                        { 'channel': channel }
                    ).toArray(function(err, result_users) {
                        var user_count = 0;
                        var alias_array = [];
                        if (result_users != null) {
                            if (result_users.length > 0) {
                                for (var i = 0; i < result_users.length; i++) {
                                    user_count++;
                                    alias_array = alias_array.concat(result_users['aliases']);
                                }
                                var alias_count = alias_array.length;
                                body_raw.push('<div class="box"><i class="fa fa-user fa-5x"></i><strong>' + user_count + '</strong><span>tracked users</span></div>');
                                body_raw.push('<div class="box"><i class="fa fa-users fa-5x"></i><strong>' + alias_count + '</strong><span>tracked aliases</span></div>');
                            }
                        }
                        
                        notes.count(
                            { 'channel': channel },
                            function(err, result_notes) {
                                if (result_notes != null) {
                                    body_raw.push('<div class="box"><i class="fa fa-envelope-o fa-5x"></i><strong>' + result_notes + '</strong><span>notes saved</span></div>');
                                }
                                
                                misc.findOne(
                                    { 'channel': channel },
                                    { 'youtube': 1 },
                                    function (err, result_counters) {
                                        if (result_counters != null) {
                                            var counters_youtube = result_counters['youtube'];
                                            body_raw.push('<div class="box"><i class="fa fa-video-camera fa-5x"></i><strong>' + counters_youtube + '</strong><span>youtube links parsed</span></div>');
                                        }
                                        body = body_raw.join('\n');
                                        res.render('sub', { body: body });
                                    }
                                );
                            }
                        );
                    });
                }
            );
        });
        
        app.get('/:channel/:nick', function(req, res){
            users.findOne(
                { 'aliases': { $in: [req.params.nick] }, 'channel': '#' + req.params.channel },
                { '_id': 1 },
                function (err, result) {
                    var body_raw = [];
                    body_raw.push('<h2>notes saved for <strong>' + req.params.nick + '</strong> in channel <a href="/' + req.params.channel + '/"><strong>#' + req.params.channel + '</strong></a></h2>');
                    if (result != null) {
                        notes.find(
                            { 'to': result['_id'], 'channel': '#' + req.params.channel },
                            { sort: { 'date_time': 1 } }
                        ).toArray(function(err, result_notes) {
                            if (result_notes.length > 0) {
                                for (var i = 0; i < result_notes.length; i++) {
                                    var formatted_datetime = functions.parse_date(result_notes[i]['date_time']);
                                    body_raw.push('<p class="message">' + result_notes[i]['note'] + '</p>\n<p class="details"><i class="fa fa-envelope-o"></i> from <strong>' +
                                        result_notes[i]['from'] + '</strong>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<i class="fa fa-clock-o"></i> ' + formatted_datetime[3] + '</p>');
                                }
                                body = body_raw.join('\n');
                                res.render('sub', { body: body});
                            }
                            else {
                                body_raw.push('<p class="error">no messages found</p>');
                                body = body_raw.join('\n');
                                res.render('sub', { body: body });
                            }
                        });
                    }
                    else {
                        body_raw.push('<p class="error">unknown user/channel</p>');
                        body = body_raw.join('\n');
                        res.render('sub', { body: body });
                    }
                }
            );
        });
    }
});

require('./merminbot.irc.js');