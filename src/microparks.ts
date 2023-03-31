/// <reference path="../types/openrct2.d.ts" />

function main(): void {
    if (network.mode === 'server') {
        const PREFIX = new RegExp('^(!|/)');
        const CMDRELEASE = new RegExp('^release($| )', 'i');
        const TILEWIDTH = 32;
        const MINIWIDTH = 18;
        const CLAIMS = [];
        const PLAYERS = {};
        const COLUMN = Math.floor(map.size.x / MINIWIDTH);

        (function (): void {
            const size = Math.pow(COLUMN, 2);
            for (let i = 0; i < size; i++) {
                CLAIMS.push(null);
            }
        })();

        function getClaimNum(coords: CoordsXY): number {
            return (Math.floor(coords.x / MINIWIDTH) * COLUMN) + Math.floor(coords.y / MINIWIDTH);
        }

        function isInBuildableArea(coords: CoordsXY): boolean {
            return coords.x % MINIWIDTH >= 3 && coords.y % MINIWIDTH >= 3;
        }

        function getCommand(str: string): boolean | string {
            if (str.match(PREFIX)) {
                return str.replace(PREFIX, '').trim();
            }
            return false;
        }

        function doesCommandMatch(str, commands): boolean | string {
            for (const command of commands) {
                if (typeof command === 'string') {
                    if (str.startsWith(command)) {
                        let ret = str.substring(command.length, str.length).trim();
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

        function getForbiddenReason(player: Player, coords: CoordsXY): boolean | string {
            let claimNum = getClaimNum(coords);
            let currentClaim = PLAYERS[player.publicKeyHash];
            let owner = CLAIMS[claimNum];
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
                    return `Plot #${claimNum} belongs to another player`;
                }
            }
            else {
                return 'Not buildable area';
            }
        }

        function getPlayer(id: number | string): Player {
            let match: Player = null;
            network.players.every(
                typeof id === 'number' ?
                    (p => {
                        if (p.id === id) {
                            match = p;
                        }
                        return match == null;
                    }) : (p => {
                        if (p.name === id) {
                            match = p;
                        }
                        return match == null;
                    }));
            return match;
        }

        function isPlayerAdmin(player: Player) {
            let perms: string[] = network.getGroup(player.group).permissions;
            return perms.indexOf('kick_player') >= 0;
        }

        context.subscribe('action.query', e => {
            let player: Player = getPlayer(e.player);
            if (e.player !== -1 && ('x' in e.args || 'x1' in e.args)) {
                let coords1: CoordsXY = {
                    x: (e.args['x1'] || e.args['x']) / TILEWIDTH,
                    y: (e.args['y1'] || e.args['y']) / TILEWIDTH,
                }
                let coords2: CoordsXY = {
                    x: (e.args['x2'] || 0) / TILEWIDTH,
                    y: (e.args['y2'] || 0) / TILEWIDTH,
                }
                let claimNum = getClaimNum(coords1);
                let reason: boolean | string
                if (reason =
                    (getForbiddenReason(player, coords1)
                        || (
                            typeof e.args['x2'] === 'number'
                            && (
                                getForbiddenReason(player, coords2)
                                // return truthy if numbers are different
                                || (claimNum !== getClaimNum(coords2) && 'Build action spans multiple claims')
                            )
                        ))
                ) {
                    network.sendMessage(`{RED}ERROR: ${reason}`, [e.player]);
                    e.result = {
                        error: 1,
                        errorTitle: 'Land ownership issue',
                        errorMessage: reason as string
                    }
                }
                else {
                    if (CLAIMS[claimNum] === null) {
                        // register ownership
                        CLAIMS[claimNum] = player.publicKeyHash;
                        PLAYERS[player.publicKeyHash] = claimNum;
                        console.log(`Plot ${claimNum} was claimed by ${player.name} (${player.publicKeyHash})`);
                    }
                }
            }
            else if ('ride' in e.args) {
                let ride = map.getRide(e.args['ride'] as number);
                if (ride.stations && ride.stations.length) {
                    let reason: boolean | string;
                    let coords: CoordsXY = ride.stations[0].start;
                    if (coords) {
                        coords = {
                            x: coords.x / TILEWIDTH,
                            y: coords.y / TILEWIDTH,
                        };
                        if (reason = getForbiddenReason(player, coords)) {
                            network.sendMessage(`{RED}ERROR: ${reason}`, [e.player]);
                            e.result = {
                                error: 1,
                                errorTitle: 'Land ownership issue',
                                errorMessage: reason as string
                            }
                        }
                    }
                }
            }
        });

        context.subscribe('network.chat', e => {
            let msg = e.message;
            let outmsg: string, args: any, command = getCommand(msg);
            if (command !== false) {
                if ((args = doesCommandMatch(command, [CMDRELEASE])) !== false) {
                    let player: Player = getPlayer(e.player);
                    if (args) {
                        if (isPlayerAdmin(player)) {
                            let target: Player = getPlayer(args);
                            let claimNum: number;
                            if (args in PLAYERS) {
                                claimNum = PLAYERS[args];
                            }
                            else if (target) {
                                claimNum = PLAYERS[target.publicKeyHash];
                            }
                            if (typeof claimNum === 'number') {
                                CLAIMS[claimNum] = null;
                                delete PLAYERS[player.publicKeyHash];
                                outmsg = 'Claim was freed successfully.';
                            }
                            else {
                                outmsg = 'Claim could not be found.';
                            }
                        }
                        else {
                            outmsg = 'Must be admin to release another player\'s claim.'
                        }
                    }
                    else {
                        let claimNum = PLAYERS[player.publicKeyHash];
                        if (typeof claimNum === 'number') {
                            CLAIMS[claimNum] = null;
                            delete PLAYERS[player.publicKeyHash];
                            outmsg = 'Claim was freed successfully.';
                        }
                        else {
                            outmsg = 'You don\'t have a claim to release!';
                        }
                    }
                }
            }
            if (outmsg) {
                context.setTimeout(() => network.sendMessage(outmsg, [e.player]), 100);
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
    main
});