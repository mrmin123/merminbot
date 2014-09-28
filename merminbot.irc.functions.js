var moment = require('moment');
var tz = require('moment-timezone');

var in_chan_add = function(nick_list, nick) {
    nick_list[nick] = 1;
    return nick_list;
};

var in_chan_remove = function(nick_list, nick) {
    if (nick in nick_list) {
        delete nick_list[nick];
    }
    return nick_list;
}

var in_chan_rename = function(nick_list, oldnick, newnick) {
    if (oldnick in nick_list) {
        delete nick_list[oldnick];
        nick_list[newnick] = 1;
    }
    return nick_list;
}

var parse_date = function(raw, timezone) {
    timezone = (typeof timezone === 'undefined') ? 'America/Los_Angeles' : timezone;
    var formatted_datetime = new Array(4);
    var time = moment(raw);
    formatted_datetime[0] = time.tz(timezone).format('MMMM Do YYYY');
    formatted_datetime[1] = time.tz(timezone).format('h:mma z');
    formatted_datetime[2] = time.fromNow();
    formatted_datetime[3] = formatted_datetime[0] + ' ' + formatted_datetime[1] + ' (' + formatted_datetime[2] + ')';
    return formatted_datetime;
}

var channel_new_alias = function(users, channel, nick, mode) {
    var date_time = 0;
    if (mode == 'manual') {
        date_time = -1;
    }
    
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1 },
        function(err, result) {
            if (result == null) {
                users.insert(
                    { 'aliases': [nick], 'channel': channel, 'last_seen': date_time },
                    function(err, result) { console.log('channel_new_alias: ' + nick + ' (' + channel + ') added'); }
                );
            }
            else {
                users.findAndModify(
                    { '_id': result['_id'] },
                    [ ['aliases', 1] ],
                    { $set: { 'last_seen': date_time } },
                    { w: 1 },
                    function(err, result2) { console.log('channel_new_alias: ' + nick + ' (' + channel + ') updated'); }
                );
            }
        }
    );
}

var channel_add_alias = function(users, channel, oldnick, newnick) {
    users.findAndModify(
        { 'aliases': { $in: [oldnick] }, 'channel': channel },
        [ ['aliases', 1] ],
        { $addToSet: { 'aliases': newnick } },
        { w: 1 },
        function(err, result) { console.log('channel_add_alias: ' + newnick + ' alias added to ' + oldnick + ' (' + channel + ')'); }
    );
}

var channel_merge_alias = function(users, notes, channel, oldnick, newnick) {
    users.findOne(
        { 'aliases': { $in: [newnick] }, 'channel': channel },
        { '_id': 1, 'aliases': 1 },
        function(err, result_new) {
            if (result_new != null) {
                users.findOne(
                    { 'aliases': { $in: [oldnick] }, 'channel': channel },
                    { '_id': 1, 'aliases': 1 },
                    function(err, result_old) {
                        if (result_old != null) {
                            if (result_new['_id'] != result_old['_id']) {
                                users.findAndModify(
                                    { '_id': result_new['_id'] },
                                    [ ['_id', 1] ],
                                    {
                                        $addToSet: { 'aliases': { $each: result_old['aliases'] } },
                                        $set: { 'last_seen': 0 }
                                    },
                                    { w: 1 },
                                    function(err, result_merge) { 
                                        console.log('channel_merge_alias: ' + oldnick + ' merged to ' + newnick + ' (' + channel + ')');
                                        users.remove(
                                            { '_id': result_old['_id'] },
                                            {w: 1},
                                            function(err, result_remove) { 
                                                console.log('channel_merge_alias: ' + oldnick + ' (' + channel + ') entry removed');
                                                notes.find(
                                                    { 'to': result_old['_id'], 'channel': channel },
                                                    { sort: { 'date_time': 1 } }
                                                ).toArray(function(err, result_notes) {
                                                    if (result_notes.length > 0) {
                                                        for (var i = 0; i < result_notes.length; i++) {
                                                            var raw_obj = result_notes[i];
                                                            notes.findAndModify(
                                                                { '_id': raw_obj['_id'] },
                                                                [ ],
                                                                { $set: { 'to': result_new['_id'] } },
                                                                { w: 1 },
                                                                function(err, result_merge_notes) { console.log('channel_merge_alias: notes for ' + oldnick + ' switched to ' + newnick + ' (' + channel + ')'); }
                                                            );
                                                        }
                                                    }
                                                });
                                            }
                                        );
                                    }
                                );
                            }
                        }
                    }
                );
            }
            else {
                channel_add_alias(users, channel, oldnick, newnick);
            }
        }
    );
    return 1;
}

var channel_check_alias = function(client, users, notes, channel, from_nick, nick, date_time, mode, note) {
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1, 'aliases': 1 },
        function(err, result) {
            if (mode == 'adduser') {
                if (result == null) {
                    console.log('channel_check_alias: attempt manual add of user ' + nick + ' (' + channel + ')');
                    channel_new_alias(users, channel, nick, 'manual');
                    client.say(channel, 'user ' + nick + ' added');
                }
                else {
                    console.log('channel_check_alias: manual add of user ' + nick + ' (' + channel + ') failed: already in memory');
                    client.say(channel, 'user ' + nick + ' already in memory');
                }
            }
            else if (mode == 'viewalias') {
                if (result != null) {
                    console.log('channel_check_alias: list aliases for ' + nick + ' (' + channel + ')');
                    var aliases = result['aliases'].join(', ');
                    client.say(channel, 'known aliases for ' + nick + ': ' + aliases);
                }
                else {
                    console.log('channel_check_alias: cannot list aliases for ' + nick + ' (' + channel + '): unknown user');
                    client.say(channel, 'unknown user ' + nick);
                }
            }
            else if (mode == 'addnote') {
                if (result != null) {
                    console.log('channel_check_alias: attempt to leave note for ' + nick + ' (' + channel + '): ' + note);
                    note_add(users, notes, channel, from_nick, nick, note, date_time);
                    client.say(channel, 'saved note for ' + nick);
                }
                else {
                    console.log('channel_check_alias: cannot leave note for ' + nick + ' (' + channel + '): unknown user');
                    client.say(channel, 'unknown user ' + nick + '. Try adduser first.');
                }
            }
        }
    );
}

var channel_alias_set_datetime = function(users, channel, nick, date_time) {
    users.findAndModify(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        [ ['aliases', 1] ],
        { $set: { 'last_seen': date_time } },
        { w: 1 },
        function(err, result) { console.log('channel_alias_set_datetime: update last seen for ' + nick + ' (' + channel + ')'); }
    );
}

var note_add = function(users, notes, channel, name_from, name_to, note, date_time) {
    users.findOne(
        { 'aliases': { $in: [name_to] }, 'channel': channel },
        { '_id': 1 },
        function(err, result) {
            if (result != null) {
                notes.insert(
                    { 'from': name_from, 'to': result['_id'], 'channel': channel, 'note': note, 'read': 0, 'date_time': date_time },
                    function(err, result) { console.log('note_add: added note for ' + name_to + ' (' + channel + ') from ' + name_from); }
                );
            }
        }
    );
}

var note_view = function(client, users, notes, channel, nick, mode) {
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1 },
        function(err, result_users) {
            if (result_users != null) {
                notes.find(
                    { 'to': result_users['_id'], 'channel': channel, 'read': 0 },
                    { sort: { 'date_time': 1 } }
                ).toArray(function(err, result_notes) {
                    if (result_notes.length > 0) {
                        console.log('note_view: got notes for ' + nick + ' (' + channel + ')');
                        for (var i = 0; i < result_notes.length; i++) {
                            var raw_obj = result_notes[i];
                            var formatted_datetime = parse_date(raw_obj['date_time']);
                            client.say(channel, 'note left by ' + raw_obj['from'] + ' for ' + nick + ' on ' + formatted_datetime[3] + ': ' + raw_obj['note']);
                            notes.findAndModify(
                                { '_id': raw_obj['_id'] },
                                [ ],
                                { $set: { 'read': 1 } },
                                { w: 1 },
                                function(err, result_toss) { console.log('note_view: set notes for ' + nick + ' (' + channel + ') as read'); }
                            );
                        }
                    }
                    else {
                        if (mode == 'manual') {
                            console.log('note_view: no notes for ' + nick + ' (' + channel + ')');
                            client.say(channel, 'no unread notes for ' + nick);
                        }
                    }
                });
            }
        }
    );
}


var misc_update_uptime = function(misc, date_time) {
    misc.update(
        { 'status': 1 },
        { 'status': 1, 'last_uptime': date_time },
        { upsert: true },
        function(err, result) {}
    );
}

var misc_get_uptime = function(client, misc, misc) {
    misc.findOne(
        { 'status': 1 },
        { 'last_uptime': 1 },
        function (err, result) {
            var formatted_datetime = parse_date(result['last_uptime']);
            client.say(to, 'Lost track of ' + misc + '! Last seen around ' + formatted_datetime[3]);
        }
    );
}

module.exports = {
    in_chan_add: in_chan_add,
    in_chan_remove: in_chan_remove,
    in_chan_rename: in_chan_rename,
    parse_date: parse_date,
    channel_new_alias: channel_new_alias,
    channel_add_alias: channel_add_alias,
    channel_merge_alias: channel_merge_alias,
    channel_check_alias: channel_check_alias,
    channel_alias_set_datetime: channel_alias_set_datetime,
    note_add: note_add,
    note_view: note_view,
    misc_update_uptime: misc_update_uptime,
    misc_get_uptime: misc_get_uptime
}