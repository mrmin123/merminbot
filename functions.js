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

var channel_new_alias = function(users, channel, nick) {
    users.findOne(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        { '_id': 1 },
        function(err, result) {
            if (result == null) {
                users.insert(
                    { 'aliases': [nick], 'channel': channel, 'last_seen': [0, 0] },
                    function(err, result) {}
                );
            }
            else {
                users.findAndModify(
                    { '_id': result['_id'] },
                    [ ['aliases', 1] ],
                    { $set: { 'last_seen': [0, 0] } },
                    { w:1 },
                    function(err, result2) {}
                );
            }
        }
    );
}

var channel_add_alias = function (users, channel, oldnick, newnick) {
    users.findAndModify(
        { 'aliases': { $in: [oldnick] }, 'channel': channel },
        [ ['aliases', 1] ],
        { $addToSet: { 'aliases': newnick } },
        { w:1 },
        function(err, result) {}
    );
}

var channel_alias_set_datetime = function (users, channel, nick, date_time) {
    users.findAndModify(
        { 'aliases': { $in: [nick] }, 'channel': channel },
        [ ['aliases', 1] ],
        { $set: { 'last_seen': date_time } },
        { w:1 },
        function(err, result) {}
    );
}

var misc_update_uptime = function (misc, date_time) {
    misc.update(
        { 'status': 1 },
        { 'status': 1, 'last_uptime': date_time },
        { upsert: true },
        function(err, result) {}
    );
}


exports.in_chan_add = in_chan_add;
exports.in_chan_remove = in_chan_remove;
exports.in_chan_rename = in_chan_rename;
exports.channel_new_alias = channel_new_alias;
exports.channel_add_alias = channel_add_alias;
exports.channel_alias_set_datetime = channel_alias_set_datetime;
exports.misc_update_uptime = misc_update_uptime;