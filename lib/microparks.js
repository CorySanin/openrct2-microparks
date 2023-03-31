function main() {
    if (network.mode === 'server') {
        var PREFIX_1 = new RegExp('^(!|/)');
        var CMDRELEASE_1 = new RegExp('^release($| )', 'i');
        var TILEWIDTH_1 = 32;
        var MINIWIDTH_1 = 18;
        var CLAIMS_1 = [];
        var PLAYERS_1 = {};
        var COLUMN_1 = Math.floor(map.size.x / MINIWIDTH_1);
        (function () {
            var size = Math.pow(COLUMN_1, 2);
            for (var i = 0; i < size; i++) {
                CLAIMS_1.push(null);
            }
        })();
        function getClaimNum(coords) {
            return (Math.floor(coords.x / MINIWIDTH_1) * COLUMN_1) + Math.floor(coords.y / MINIWIDTH_1);
        }
        function isInBuildableArea(coords) {
            return coords.x % MINIWIDTH_1 >= 3 && coords.y % MINIWIDTH_1 >= 3;
        }
        function getCommand(str) {
            if (str.match(PREFIX_1)) {
                return str.replace(PREFIX_1, '').trim();
            }
            return false;
        }
        function doesCommandMatch(str, commands) {
            for (var _i = 0, commands_1 = commands; _i < commands_1.length; _i++) {
                var command = commands_1[_i];
                if (typeof command === 'string') {
                    if (str.startsWith(command)) {
                        var ret = str.substring(command.length, str.length).trim();
                        return (ret) ? ret : true;
                    }
                }
                else {
                    if (str.match(command)) {
                        return str.replace(command, '').trim();
                    }
                }
            }
            return false;
        }
        function getForbiddenReason(player, coords) {
            var claimNum = getClaimNum(coords);
            var currentClaim = PLAYERS_1[player.publicKeyHash];
            var owner = CLAIMS_1[claimNum];
            if (isInBuildableArea(coords)) {
                if (owner === null || owner === player.publicKeyHash) {
                    if (typeof currentClaim !== 'number' || currentClaim === claimNum) {
                        return false;
                    }
                    else {
                        return 'You already have a land claim, and this ain\'t it!';
                    }
                }
                else {
                    return "Plot #".concat(claimNum, " belongs to another player");
                }
            }
            else {
                return 'Not buildable area';
            }
        }
        function getPlayer(id) {
            var match = null;
            network.players.every(typeof id === 'number' ?
                (function (p) {
                    if (p.id === id) {
                        match = p;
                    }
                    return match == null;
                }) : (function (p) {
                if (p.name === id) {
                    match = p;
                }
                return match == null;
            }));
            return match;
        }
        function isPlayerAdmin(player) {
            var perms = network.getGroup(player.group).permissions;
            return perms.indexOf('kick_player') >= 0;
        }
        context.subscribe('action.query', function (e) {
            var player = getPlayer(e.player);
            if (e.player !== -1 && ('x' in e.args || 'x1' in e.args)) {
                var coords1 = {
                    x: (e.args['x1'] || e.args['x']) / TILEWIDTH_1,
                    y: (e.args['y1'] || e.args['y']) / TILEWIDTH_1,
                };
                var coords2 = {
                    x: (e.args['x2'] || 0) / TILEWIDTH_1,
                    y: (e.args['y2'] || 0) / TILEWIDTH_1,
                };
                var claimNum = getClaimNum(coords1);
                var reason = void 0;
                if (reason =
                    (getForbiddenReason(player, coords1)
                        || (typeof e.args['x2'] === 'number'
                            && (getForbiddenReason(player, coords2)
                                || (claimNum !== getClaimNum(coords2) && 'Build action spans multiple claims'))))) {
                    network.sendMessage("{RED}ERROR: ".concat(reason), [e.player]);
                    e.result = {
                        error: 1,
                        errorTitle: 'Land ownership issue',
                        errorMessage: reason
                    };
                }
                else {
                    if (CLAIMS_1[claimNum] === null) {
                        CLAIMS_1[claimNum] = player.publicKeyHash;
                        PLAYERS_1[player.publicKeyHash] = claimNum;
                        console.log("Plot ".concat(claimNum, " was claimed by ").concat(player.name, " (").concat(player.publicKeyHash, ")"));
                    }
                }
            }
            else if ('ride' in e.args) {
                var ride = map.getRide(e.args['ride']);
                if (ride.stations && ride.stations.length) {
                    var reason = void 0;
                    var coords = ride.stations[0].start;
                    if (coords) {
                        coords = {
                            x: coords.x / TILEWIDTH_1,
                            y: coords.y / TILEWIDTH_1,
                        };
                        if (reason = getForbiddenReason(player, coords)) {
                            network.sendMessage("{RED}ERROR: ".concat(reason), [e.player]);
                            e.result = {
                                error: 1,
                                errorTitle: 'Land ownership issue',
                                errorMessage: reason
                            };
                        }
                    }
                }
            }
        });
        context.subscribe('network.chat', function (e) {
            var msg = e.message;
            var outmsg, args, command = getCommand(msg);
            if (command !== false) {
                if ((args = doesCommandMatch(command, [CMDRELEASE_1])) !== false) {
                    var player = getPlayer(e.player);
                    if (args) {
                        if (isPlayerAdmin(player)) {
                            var target = getPlayer(args);
                            var claimNum = void 0;
                            if (args in PLAYERS_1) {
                                claimNum = PLAYERS_1[args];
                            }
                            else if (target) {
                                claimNum = PLAYERS_1[target.publicKeyHash];
                            }
                            if (typeof claimNum === 'number') {
                                CLAIMS_1[claimNum] = null;
                                delete PLAYERS_1[player.publicKeyHash];
                                outmsg = 'Claim was freed successfully.';
                            }
                            else {
                                outmsg = 'Claim could not be found.';
                            }
                        }
                        else {
                            outmsg = 'Must be admin to release another player\'s claim.';
                        }
                    }
                    else {
                        var claimNum = PLAYERS_1[player.publicKeyHash];
                        if (typeof claimNum === 'number') {
                            CLAIMS_1[claimNum] = null;
                            delete PLAYERS_1[player.publicKeyHash];
                            outmsg = 'Claim was freed successfully.';
                        }
                        else {
                            outmsg = 'You don\'t have a claim to release!';
                        }
                    }
                }
            }
            if (outmsg) {
                context.setTimeout(function () { return network.sendMessage(outmsg, [e.player]); }, 100);
            }
        });
    }
}
registerPlugin({
    name: 'microparks',
    version: '0.0.3',
    authors: ['Cory Sanin'],
    type: 'remote',
    licence: 'MIT',
    minApiVersion: 65,
    targetApiVersion: 66,
    main: main
});
