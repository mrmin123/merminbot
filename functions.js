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

var channel_new_alias = function(users, channel, nick, mode) {
    var date_time = [0, 0];
    if (mode == 'manual') {
        date_time = [-1, -1];
    }
    
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1 },
        function(err, result) {
            if (result == null) {
                users.insert(
                    { 'aliases': [nick], 'channel': channel, 'last_seen': date_time },
                    function(err, result) {}
                );
            }
            else {
                users.findAndModify(
                    { '_id': result['_id'] },
                    [ ['aliases', 1] ],
                    { $set: { 'last_seen': date_time } },
                    { w: 1 },
                    function(err, result2) {}
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
        function(err, result) { added = 1;}
    );
}

var channel_merge_alias = function(users, channel, oldnick, newnick) {
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
                                        $set: { 'last_seen': [0, 0] }
                                    },
                                    { w: 1 },
                                    function(err, result_toss) {}
                                );
                                users.remove(
                                    { '_id': result_old['_id'] },
                                    {w: 1},
                                    function(err, result_toss) {}
                                );
                            }
                        }
                    }
                );
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
                    channel_new_alias(users, channel, nick, 'manual');
                    client.say(channel, 'user ' + nick + ' added');
                }
                else {
                    client.say(channel, 'user ' + nick + ' already in memory');
                }
            }
            else if (mode == 'viewalias') {
                if (result != null) {
                    var aliases = result['aliases'].join(', ');
                    client.say(channel, 'known aliases for ' + nick + ': ' + aliases);
                }
                else {
                    client.say(channel, 'unknown user ' + nick);
                }
            }
            else if (mode == 'addnote') {
                if (result != null) {
                    add_note(users, notes, channel, from_nick, nick, note, date_time);
                    client.say(channel, 'saved note for ' + nick);
                }
                else {
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
        function(err, result) {}
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

var add_note = function(users, notes, channel, name_from, name_to, note, date_time) {
    users.findOne(
        { 'aliases': { $in: [name_to] }, 'channel': channel },
        { '_id': 1 },
        function(err, result) {
            if (result != null) {
                notes.insert(
                    { 'from': name_from, 'to': result['_id'], 'channel': channel, 'note': note, 'read': 0, 'date_time': date_time, 'date_time_raw': new Date() },
                    function(err, result) {}
                );
            }
        }
    );
}

var view_notes = function(client, users, notes, channel, nick, mode) {
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1 },
        function(err, result_users) {
            if (result_users != null) {
                notes.find(
                    { 'to': result_users['_id'], 'channel': channel, 'read': 0 },
                    { sort: { 'date_time_raw': 1 } }
                ).toArray(function(err, result_notes) {
                    if (result_notes.length > 0) {
                        for (var i = 0; i < result_notes.length; i++) {
                            var raw_obj = result_notes[i];
                            var date_time = raw_obj['date_time'];
                            client.say(channel, 'note left by ' + raw_obj['from'] + ' for ' + nick + ' on ' + date_time[0] + ' ' + date_time[1] + ': ' + raw_obj['note']);
                            notes.findAndModify(
                                { '_id': raw_obj['_id'] },
                                [ ],
                                { $set: { 'read': 1 } },
                                { w: 1 },
                                function(err, result_toss) {}
                            );
                        }
                    }
                    else {
                        if (mode == 'manual') {
                            client.say(channel, 'no unread notes for ' + nick);
                        }
                    }
                });
            }
        }
    );
}

module.exports = {
    in_chan_add: in_chan_add,
    in_chan_remove: in_chan_remove,
    in_chan_rename: in_chan_rename,
    channel_new_alias: channel_new_alias,
    channel_add_alias: channel_add_alias,
    channel_merge_alias: channel_merge_alias,
    channel_check_alias: channel_check_alias,
    channel_alias_set_datetime: channel_alias_set_datetime,
    misc_update_uptime: misc_update_uptime,
    add_note: add_note,
    view_notes: view_notes
}