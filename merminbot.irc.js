var db = require('mongodb').MongoClient;
var moment = require('moment');
var params = require('./params.js');
var functions = require('./functions.js');

start_irc();

function get_date_time() {
    var date_time = new Array(2);
    date_time[0] = moment().format('MMMM Do YYYY');
    date_time[1] = moment().format('h:mm a');
    return date_time;
}

function start_irc() {
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
                            functions.channel_new_alias(users, channel, nick);
                        }
                    }
                }
                in_chan[channel] = nick_list;
            });
            
            client.addListener('join', function (channel, nick, message) {
                if (nick != params.irc['botname']) {
                    nick = nick.toLowerCase();
                    in_chan[channel] = functions.in_chan_add(in_chan[channel], nick);
                    functions.channel_alias_set_datetime(users, channel, nick, [0, 0]);
                    console.log('join:');
                    console.log(in_chan[channel]);
                    //add check for notes left for user
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
            
            client.addListener('nick', function (oldnick, newnick, channel, message) {
                if (oldnick != params.irc['botname']) {
                    oldnick = oldnick.toLowerCase();
                    newnick = newnick.toLowerCase();
                    in_chan[channel] = functions.in_chan_rename(in_chan[channel], oldnick, newnick);
                    functions.channel_add_alias(users, channel, oldnick, newnick);
                }
                //add function for merging aliases and users
            });
            
            client.addListener('message', function (nick, to, text, message) {
                if (nick == params.irc['botname'] || to == params.irc['botname']) { return; }
                
                var regex = '^' + params.botflag + ' (\\S+)(.*)';
                var re = new RegExp(regex, "i");
                var match = text.match(re);
                if (match) {
                    var subcmd = match[2].substring(1);
                    var subcmdlow = subcmd.toLowerCase();
                    match[1] = match[1].toLowerCase();
                    
                    if(match[1] == 'lastseen') {
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
                                            client.say(to, 'haven\'t seen "' + subcmd + '" yet (added manually)');
                                        }
                                        else {
                                            client.say(to, '"' + subcmd + '" last seen on ' + raw[0] + ' ' + raw[1]);
                                        }
                                    }
                                    else {
                                        client.say(to, 'never seen "' + subcmd + '" before');
                                    }
                                }
                            );
                        }
                        else {
                            client.say(to, 'lastseen usage: ' + params.botflag + ' lastseen <nick>');
                        }
                    }
                    else if (match[1] == 'addalias') {
                        var result = subcmdlow.split(' ');
                        if (result.length == 2) {
                            functions.channel_add_alias(users, to, result[0], result[1]);
                        }
                        else {
                            client.say(to, 'addalias usage: ' + params.botflag + ' addalias <known nick> <additional nick/alias>');
                        }
                    }
                    else if (match[1] == 'adduser') {
                        //adduser, if it doesn't exist already
                        
                        // add function for checking existence of user in db (for adduser and addnote)
                        
                    }
                    else if (match[1] == 'addnote') {
                        // check if user exists;
                        
                        // add function for adding note
                    }
                    //add function for seeing aliases of a user
                    //add youtube scraper?
                }
            });
        }
    });
}