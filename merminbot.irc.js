var db = require('mongodb').MongoClient;
var moment = require('moment');
var youtube = require('youtube-node');
var params = require('./params.js');
var functions = require('./functions.js');

function get_date_time() {
    var date_time = new Array(2);
    date_time[0] = moment().format('MMMM Do YYYY');
    date_time[1] = moment().format('h:mm a');
    return date_time;
}

youtube.setKey(params.google_api_key);

var irc = require('irc');
var client = new irc.Client(
    params.irc['server'],
    params.irc['botname'],
    {
        channels: params.irc['channels'],
        floodProtection: true,
        floodProtectionDelay: 1000,
        stripColors: true,
        debug: 0
    }
);

client.addListener('error', function(message) {
    console.log('irc error: ', message);
});

db.connect(params.db, function(err, db) {
    if (!err) {
        var users = db.collection('users');
        var notes = db.collection('notes');
        var misc = db.collection('misc');
        var in_chan = [];
        
        client.addListener('ping', function (server) {
            functions.misc_update_uptime(misc, get_date_time());
        });
        
        client.addListener('names', function (channel, nicks) {
            functions.misc_update_uptime(misc, get_date_time());
            var nick_list = {};
            for (var nick in nicks) {
                if (nicks.hasOwnProperty(nick)) {
                    if (nick != params.irc['botname']) {
                        nick = nick.toLowerCase();
                        nick_list[nick] = 1;
                        functions.channel_new_alias(users, channel, nick, 'auto');
                    }
                }
            }
            in_chan[channel] = nick_list;
        });
        
        client.addListener('join', function (channel, nick, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                in_chan[channel] = functions.in_chan_add(in_chan[channel], nick);
                functions.channel_new_alias(users, channel, nick, 'auto');
                functions.view_notes(client, users, notes, channel, nick, 'auto');
            }
        });
        
        client.addListener('quit', function (nick, reason, channels, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                var cur_channels = params.irc['channels'];
                for (var i = 0; i < channels.length; i++) {
                    var channel = channels[i];
                    if (cur_channels.indexOf(channel != -1)) {
                        in_chan[channel] = functions.in_chan_remove(in_chan[channel], nick);
                        functions.channel_alias_set_datetime(users, channel, nick, get_date_time());
                    }
                }
            }
            else {
                functions.misc_update_uptime(misc, get_date_time());
                in_chan[channel] = {};
            }
        });
        
        client.addListener('part', function (channel, nick, reason, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                in_chan[channel] = functions.in_chan_remove(in_chan[channel], nick);
                functions.channel_alias_set_datetime(users, channel, nick, get_date_time());
            }
            else {
                in_chan[channel] = {};
            }
        });
        
        client.addListener('kick', function (channel, nick, by, reason, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                in_chan[channel] = functions.in_chan_remove(in_chan[channel], nick);
                functions.channel_alias_set_datetime(users, channel, nick, get_date_time());
            }
            else {
                in_chan[channel] = {};
            }
        });
        
        client.addListener('nick', function (oldnick, newnick, channels, message) {
            if (oldnick != params.irc['botname']) {                    
                oldnick = oldnick.toLowerCase();
                newnick = newnick.toLowerCase();
                for (var i = 0; i < channels.length; i++) {
                    var channel = channels[i];
                    in_chan[channel] = functions.in_chan_rename(in_chan[channel], oldnick, newnick);
                    if (functions.channel_merge_alias(users, channel, oldnick, newnick) == 1) {
                        functions.channel_add_alias(users, channel, oldnick, newnick);
                    }
                }
            }
        });
        
        client.addListener('message', function (nick, to, text, message) {
            if (nick == params.irc['botname'] || to == params.irc['botname']) { return; }
            
            var regex_botflag = '^' + params.botflag + ' (\\S+)(.*)';
            var re_botflag = new RegExp(regex_botflag, "i");
            var match_botflag = text.match(re_botflag);
            
            var regex_yt = /(?:https?:\/\/)?(?:[\w]+\.)?youtube\.com\/watch\?v=([\S]+)/ig;
            var match_yt = regex_yt.exec(text);
            
            if (match_botflag) {
                var subcmd = match_botflag[2].substring(1);
                var subcmdlow = subcmd.toLowerCase();
                match_botflag[1] = match_botflag[1].toLowerCase();
                
                if(match_botflag[1] == 'lastseen') {
                    if (subcmd != '') {
                        users.findOne(
                            { 'aliases': { $in: [subcmdlow] }, 'channel': to },
                            { '_id': 0, 'last_seen': 1 },
                            function(err, result) {
                                if (result) {
                                    var raw = result['last_seen'];
                                    if (raw[0] == 0 && raw[1] == 0) {
                                        client.say(to, '"' + subcmd + '" is still here (theoretically)');
                                        // add check to compare current users to requested user
                                    }
                                    else if (raw[0] == -1 && raw[1] == -1) {
                                        client.say(to, 'haven\'t seen ' + subcmd + ' yet (added manually)');
                                    }
                                    else {
                                        client.say(to, subcmd + ' last seen on ' + raw[0] + ' ' + raw[1]);
                                    }
                                }
                                else {
                                    client.say(to, 'never seen ' + subcmd + ' before');
                                }
                            }
                        );
                    }
                    else {
                        client.say(to, 'lastseen usage: ' + params.botflag + ' lastseen <nick>');
                    }
                }
                else if (match_botflag[1] == 'addalias') {
                    var result = subcmdlow.split(' ');
                    if (result.length == 2) {
                        functions.channel_add_alias(users, to, result[0], result[1]);
                    }
                    else {
                        client.say(to, 'addalias usage: ' + params.botflag + ' addalias <known nick> <additional nick/alias>');
                    }
                }
                else if (match_botflag[1] == 'viewalias') {
                    if (subcmd != '') {
                        functions.channel_check_alias(client, users, notes, to, nick, subcmd, get_date_time(), 'viewalias', '');
                    }
                    else {
                        client.say(to, 'viewalias usage: ' + params.botflag + ' viewalias <known nick>');
                    }
                }
                else if (match_botflag[1] == 'adduser') {
                    if (subcmd != '') {
                        functions.channel_check_alias(client, users, notes, to, nick, subcmd, get_date_time(), 'adduser', '');
                    }
                    else {
                        client.say(to, 'adduser usage: ' + params.botflag + ' adduser <nick>');
                    }
                }
                else if (match_botflag[1] == 'addnote') {
                    if (subcmd != '') {
                        var result = subcmdlow.split(' ');
                        if (result.length > 1) {
                            var name_to = result.shift();
                            var note = result.join(' ');
                            functions.channel_check_alias(client, users, notes, to, nick, name_to, get_date_time(), 'addnote', note);
                        }
                        else {
                            client.say(to, 'addnote usage: ' + params.botflag + ' addnote <recipient nick> <note>');
                        }
                    }
                    else {
                        client.say(to, 'addnote usage: ' + params.botflag + ' addnote <recipient nick> <note>');
                    }
                }
                else if (match_botflag[1] == 'getnotes') {
                    functions.view_notes(client, users, notes, to, nick, 'manual');
                }
            }
            
            if (match_yt) {
                while (match_yt != null) {
                    var pasted_url = match_yt[0];
                    var regex_yt_id = /^([^&]+)/;
                    var match_yt_id = regex_yt_id.exec(match_yt[1]);
                    
                    youtube.getById(match_yt_id[1], function(result) {
                        client.say(to, pasted_url + ' : "' + result['items'][0]['snippet']['title'] + '" uploaded by ' + result['items'][0]['snippet']['channelTitle'] +
                            ' (' + result['items'][0]['contentDetails']['duration'].substring(2).toLowerCase() + ')');
                    });
                    match_yt = regex_yt.exec(text);
                }
            }
        });
    }
});