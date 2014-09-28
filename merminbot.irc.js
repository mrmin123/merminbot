var db = require('mongodb').MongoClient;
var moment = require('moment');
var tz = require('moment-timezone');
var youtube = require('youtube-node');
var params = require('./params.js');
var functions = require('./functions.js');

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
            functions.misc_update_uptime(misc, moment().format());
        });
        
        client.addListener('names', function (channel, nicks) {
            functions.misc_update_uptime(misc, moment().format());
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
                        functions.channel_alias_set_datetime(users, channel, nick, moment().format());
                    }
                }
            }
            else {
                functions.misc_update_uptime(misc, moment().format());
                in_chan[channel] = {};
            }
        });
        
        client.addListener('part', function (channel, nick, reason, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                in_chan[channel] = functions.in_chan_remove(in_chan[channel], nick);
                functions.channel_alias_set_datetime(users, channel, nick, moment().format());
            }
            else {
                in_chan[channel] = {};
            }
        });
        
        client.addListener('kick', function (channel, nick, by, reason, message) {
            if (nick != params.irc['botname']) {
                nick = nick.toLowerCase();
                in_chan[channel] = functions.in_chan_remove(in_chan[channel], nick);
                functions.channel_alias_set_datetime(users, channel, nick, moment().format());
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
                    functions.channel_merge_alias(users, channel, oldnick, newnick);
                    functions.view_notes(client, users, notes, channel, newnick, 'auto');
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
                
                if(match_botflag[1] == 'lastseen' || match_botflag[1] == 'ls' || match_botflag[1] == 'seen') {
                    if (subcmd != '') {
                        users.findOne(
                            { 'aliases': { $in: [subcmdlow] }, 'channel': to },
                            { '_id': 0, 'last_seen': 1, 'aliases': 1 },
                            function(err, result) {
                                if (result) {
                                    var raw_datetime = result['last_seen'];
                                    if (raw_datetime == 0) {
                                        var known_aliases = result['aliases'];
                                        var in_channel_temp = in_chan[to];
                                        var alias_in_channel = '';
                                        var alias_in_channel_check = 0;
                                        for (var i = 0; i < known_aliases.length; i++) {
                                            for (var j = 0; j < in_channel_temp.length; j++) {
                                                if (known_aliases[i] == in_channel_temp[j].toLowerCase()) {
                                                    alias_in_channel = in_channel_temp[j];
                                                    alias_in_channel_check = 1;
                                                }
                                            }
                                        }
                                        if (alias_in_channel_check == 1) {
                                            client.say(to, subcmd + ' is still here as ' + alias_in_channel);
                                        }
                                        else {
                                            functions.misc_get_uptime(client, misc, subcmd);
                                        }
                                    }
                                    else if (raw_datetime == -1) {
                                        client.say(to, 'haven\'t seen ' + subcmd + ' yet (added manually)');
                                    }
                                    else {
                                        var formatted_datetime = functions.parse_date(raw_datetime);
                                        client.say(to, subcmd + ' last seen on ' + formatted_datetime[3]);
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
                else if (match_botflag[1] == 'viewalias' || match_botflag[1] == 'viewaliases') {
                    if (subcmd != '') {
                        functions.channel_check_alias(client, users, notes, to, nick, subcmdlow, moment().format(), 'viewalias', '');
                    }
                    else {
                        client.say(to, 'viewalias usage: ' + params.botflag + ' viewalias <known nick>');
                    }
                }
                else if (match_botflag[1] == 'adduser') {
                    if (subcmd != '') {
                        functions.channel_check_alias(client, users, notes, to, nick, subcmdlow, moment().format(), 'adduser', '');
                    }
                    else {
                        client.say(to, 'adduser usage: ' + params.botflag + ' adduser <nick>');
                    }
                }
                else if (match_botflag[1] == 'addnote' | match_botflag[1] == 'leavenote') {
                    if (subcmd != '') {
                        var result = subcmd.split(' ');
                        if (result.length > 1) {
                            var name_to = result.shift().toLowerCase();
                            var note = result.join(' ');
                            functions.channel_check_alias(client, users, notes, to, nick, name_to, moment().format(), 'addnote', note);
                        }
                        else {
                            client.say(to, 'addnote usage: ' + params.botflag + ' addnote <recipient nick> <note>');
                            client.say(to, 'addnote aliases: leavenote');
                        }
                    }
                    else {
                        client.say(to, 'addnote usage: ' + params.botflag + ' addnote <recipient nick> <note>');
                        client.say(to, 'addnote aliases: leavenote');
                    }
                }
                else if (match_botflag[1] == 'getnotes' || match_botflag[1] == 'getnote' || match_botflag[1] == 'viewnote' || match_botflag[1] == 'viewnotes') {
                    functions.view_notes(client, users, notes, to, nick, 'manual');
                }
                else {
                    client.say(to, 'commands (and aliases): lastseen (ls seen) addalias viewalias (viewaliases) adduser addnote (leavenote) getnotes (getnote viewnote viewnotes)');
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