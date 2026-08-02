/**
 * Tests for tbc-logic.js — run with:  node tbc-logic.test.js
 * Zero dependencies (Node's built-in assert) so it works offline anywhere.
 */
var assert = require('assert');
var TBC = require('./tbc-logic');

var passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ✓ ' + name);
  } catch (e) {
    console.error('  ✗ ' + name + '\n      ' + e.message);
    process.exitCode = 1;
  }
}

// Build a passenger with explicit guesses (bypasses random id concerns).
function player(id, name, gt, gb) {
  return { id: id, name: name, colour: '#000', guessTractors: gt, guessBikes: gb };
}

console.log('TBC logic tests\n');

test('colourForIndex wraps past the palette and handles junk', function () {
  assert.strictEqual(TBC.colourForIndex(0), TBC.PLAYER_COLOURS[0]);
  assert.strictEqual(TBC.colourForIndex(TBC.PLAYER_COLOURS.length), TBC.PLAYER_COLOURS[0]);
  assert.strictEqual(TBC.colourForIndex(undefined), TBC.PLAYER_COLOURS[0]);
});

test('toCount floors, rejects negatives, NaN and junk', function () {
  assert.strictEqual(TBC.toCount(3), 3);
  assert.strictEqual(TBC.toCount(3.9), 3);
  assert.strictEqual(TBC.toCount(-5), 0);
  assert.strictEqual(TBC.toCount('7'), 7);
  assert.strictEqual(TBC.toCount('banana'), 0);
  assert.strictEqual(TBC.toCount(undefined), 0);
});

test('createPlayer trims the name and assigns a palette colour', function () {
  var p = TBC.createPlayer('  Evie  ', 1);
  assert.strictEqual(p.name, 'Evie');
  assert.strictEqual(p.colour, TBC.PLAYER_COLOURS[1]);
  assert.strictEqual(p.guessTractors, 0);
  assert.strictEqual(p.guessBikes, 0);
  assert.ok(p.id && p.id.length > 1);
});

test('tapCount increments the right tally and logs history', function () {
  var counts = { tractors: 0, bikes: 0 };
  var history = [];
  TBC.tapCount(counts, history, 'tractors');
  TBC.tapCount(counts, history, 'tractors');
  TBC.tapCount(counts, history, 'bikes');
  assert.strictEqual(counts.tractors, 2);
  assert.strictEqual(counts.bikes, 1);
  assert.deepStrictEqual(history, ['tractors', 'tractors', 'bikes']);
});

test('tapCount ignores unknown types (cannot corrupt the tally)', function () {
  var counts = { tractors: 0, bikes: 0 };
  var history = [];
  TBC.tapCount(counts, history, 'spaceships');
  assert.strictEqual(counts.tractors, 0);
  assert.strictEqual(counts.bikes, 0);
  assert.strictEqual(history.length, 0);
});

test('undoCount reverses the last tap and reports what it undid', function () {
  var counts = { tractors: 2, bikes: 1 };
  var history = ['tractors', 'tractors', 'bikes'];
  var r = TBC.undoCount(counts, history);
  assert.strictEqual(r.undone, 'bikes');
  assert.strictEqual(counts.bikes, 0);
  assert.deepStrictEqual(history, ['tractors', 'tractors']);
});

test('undoCount is a safe no-op on empty history and never goes negative', function () {
  var counts = { tractors: 0, bikes: 0 };
  var history = [];
  var r = TBC.undoCount(counts, history);
  assert.strictEqual(r.undone, null);
  assert.strictEqual(counts.tractors, 0);
  assert.strictEqual(counts.bikes, 0);
});

test('score: clear single winner across both categories', function () {
  var players = [
    player('a', 'Ann', 10, 5),  // tDiff 0, bDiff 0, total 0
    player('b', 'Bob', 20, 9)   // tDiff 10, bDiff 4, total 14
  ];
  var r = TBC.score(players, { tractors: 10, bikes: 5 });
  assert.deepStrictEqual(r.overallChamps, ['a']);
  assert.deepStrictEqual(r.tractorChamps, ['a']);
  assert.deepStrictEqual(r.bikeChamps, ['a']);
  assert.strictEqual(r.ranked[0].id, 'a');
  assert.strictEqual(r.ranked[0].total, 0);
});

test('score: tractor champ and bike champ can be different people', function () {
  var players = [
    player('t', 'Tess', 17, 0),  // great on tractors, terrible on bikes
    player('m', 'Mo', 0, 9)      // terrible on tractors, great on bikes
  ];
  var r = TBC.score(players, { tractors: 17, bikes: 9 });
  assert.deepStrictEqual(r.tractorChamps, ['t']);
  assert.deepStrictEqual(r.bikeChamps, ['m']);
});

test('score: ties share every relevant title', function () {
  var players = [
    player('a', 'Ann', 12, 8),  // tDiff 2, bDiff 1, total 3
    player('b', 'Bob', 8, 10)   // tDiff 2, bDiff 1, total 3
  ];
  var r = TBC.score(players, { tractors: 10, bikes: 9 });
  assert.deepStrictEqual(r.overallChamps.sort(), ['a', 'b']);
  assert.deepStrictEqual(r.tractorChamps.sort(), ['a', 'b']);
  assert.deepStrictEqual(r.bikeChamps.sort(), ['a', 'b']);
});

test('score: ranked sorts by total, breaking ties by name', function () {
  var players = [
    player('z', 'Zoe', 10, 10), // total 0
    player('a', 'Ann', 9, 9),   // total 2
    player('b', 'Bob', 11, 11)  // total 2 -> tie with Ann, Ann first by name
  ];
  var r = TBC.score(players, { tractors: 10, bikes: 10 });
  assert.deepStrictEqual(r.ranked.map(function (x) { return x.id; }), ['z', 'a', 'b']);
});

test('score: single passenger wins everything', function () {
  var r = TBC.score([player('solo', 'Sam', 3, 4)], { tractors: 99, bikes: 1 });
  assert.deepStrictEqual(r.overallChamps, ['solo']);
  assert.strictEqual(r.ranked.length, 1);
});

test('score: empty roster returns empty results, not a crash', function () {
  var r = TBC.score([], { tractors: 5, bikes: 5 });
  assert.deepStrictEqual(r.ranked, []);
  assert.deepStrictEqual(r.overallChamps, []);
  assert.deepStrictEqual(r.tractorChamps, []);
  assert.deepStrictEqual(r.bikeChamps, []);
});

test('score: tolerates missing/garbage guesses and actual', function () {
  var players = [{ id: 'x', name: 'X', colour: '#000' }]; // no guesses at all
  var r = TBC.score(players, undefined);
  assert.strictEqual(r.ranked[0].guessTractors, 0);
  assert.strictEqual(r.ranked[0].total, 0);
  assert.deepStrictEqual(r.actual, { tractors: 0, bikes: 0 });
});

// ---- Trip history / 30-day scoreboard ---------------------------------------

var DAY = 86400000;

// A finished trip, ready to be fed to pruneTrips / summariseTrips.
function trip(agoDays, tractors, bikes, players, overall, tChamps, bChamps) {
  return {
    at: Date.now() - agoDays * DAY,
    tractors: tractors,
    bikes: bikes,
    players: players,
    overall: overall,
    tractorChamps: tChamps || overall,
    bikeChamps: bChamps || overall
  };
}
function entry(name, total) {
  return { name: name, guessTractors: 0, guessBikes: 0, tractorDiff: 0, bikeDiff: 0, total: total };
}

test('makeTripRecord agrees with score() and stores champs as names', function () {
  var players = [
    player('a', 'Ann', 10, 5),  // exact on both
    player('b', 'Bob', 20, 9)
  ];
  var r = TBC.makeTripRecord(players, { tractors: 10, bikes: 5 }, 1700000000000);
  assert.strictEqual(r.at, 1700000000000);
  assert.strictEqual(r.tractors, 10);
  assert.strictEqual(r.bikes, 5);
  assert.deepStrictEqual(r.overall, ['Ann']);
  assert.deepStrictEqual(r.tractorChamps, ['Ann']);
  assert.deepStrictEqual(r.bikeChamps, ['Ann']);
  assert.strictEqual(r.players.length, 2);
  assert.strictEqual(r.players[0].name, 'Ann');
  assert.strictEqual(r.players[0].total, 0);
  assert.strictEqual(r.players[1].total, 14);
});

test('makeTripRecord falls back to now on a junk timestamp', function () {
  var before = Date.now();
  var r = TBC.makeTripRecord([player('a', 'Ann', 1, 1)], { tractors: 1, bikes: 1 }, 'not a time');
  assert.ok(r.at >= before && r.at <= Date.now());
});

test('pruneTrips drops trips past the window and keeps ones inside it', function () {
  var kept = trip(29, 5, 5, [entry('Ann', 0)], ['Ann']);
  var gone = trip(31, 5, 5, [entry('Bob', 0)], ['Bob']);
  var out = TBC.pruneTrips([gone, kept], Date.now());
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].players[0].name, 'Ann');
});

test('pruneTrips: the 30-day boundary itself is exactly 30 days', function () {
  // Pins the headline requirement: a constant or comparison drifting to 29 or
  // 31 days must fail here rather than pass silently.
  assert.strictEqual(TBC.RETENTION_DAYS, 30);
  var now = Date.now();
  var onTheLine = { at: now - 30 * DAY, players: [], overall: [] };
  var justInside = { at: now - 30 * DAY + 1, players: [], overall: [] };
  assert.strictEqual(TBC.pruneTrips([onTheLine], now).length, 0);
  assert.strictEqual(TBC.pruneTrips([justInside], now).length, 1);
});

test('pruneTrips drops future-dated trips so a wrong clock cannot pin one', function () {
  var now = Date.now();
  var fromTheFuture = { at: now + 365 * DAY, players: [], overall: [] };
  var soon = { at: now + 2 * DAY, players: [], overall: [] };
  assert.strictEqual(TBC.pruneTrips([fromTheFuture], now).length, 0);
  assert.strictEqual(TBC.pruneTrips([soon], now).length, 0);
});

test('pruneTrips and summariseTrips tolerate a non-array', function () {
  assert.deepStrictEqual(TBC.pruneTrips('nonsense', Date.now()), []);
  assert.deepStrictEqual(TBC.pruneTrips(null, Date.now()), []);
  assert.strictEqual(TBC.summariseTrips('nonsense').tripCount, 0);
  assert.strictEqual(TBC.summariseTrips(undefined).tripCount, 0);
});

test('summariseTrips counts one trip once when two passengers share a name', function () {
  var trips = [trip(1, 4, 4, [entry('Joe', 2), entry('joe', 6)], ['Joe'])];
  var s = TBC.summariseTrips(trips);
  assert.strictEqual(s.leaderboard.length, 1);
  assert.strictEqual(s.leaderboard[0].trips, 1); // not 2
  assert.strictEqual(s.leaderboard[0].wins, 1);  // not 2
});

test('colourForName is stable per person and ignores case and whitespace', function () {
  var c = TBC.colourForName('Evie');
  assert.strictEqual(TBC.colourForName('  evie '), c);
  assert.strictEqual(TBC.colourForName('Evie'), c); // repeatable
  assert.ok(TBC.PLAYER_COLOURS.indexOf(c) !== -1);
  assert.ok(TBC.PLAYER_COLOURS.indexOf(TBC.colourForName('')) !== -1);
});

test('pruneTrips honours a custom window and never mutates the input', function () {
  var input = [trip(3, 1, 1, [entry('Ann', 0)], ['Ann']), trip(10, 1, 1, [entry('Bob', 0)], ['Bob'])];
  var out = TBC.pruneTrips(input, Date.now(), 7);
  assert.strictEqual(out.length, 1);
  assert.strictEqual(input.length, 2); // original array untouched
});

test('pruneTrips discards malformed entries instead of crashing', function () {
  var good = trip(1, 2, 2, [entry('Ann', 0)], ['Ann']);
  var out = TBC.pruneTrips([null, undefined, 'nope', {}, { at: 'soon' }, { at: NaN }, good], Date.now());
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0], good);
});

test('pruneTrips returns newest first and caps the list length', function () {
  var many = [];
  for (var i = 0; i < TBC.MAX_TRIPS + 25; i++) many.push(trip(i * 0.01, i, 0, [], []));
  var out = TBC.pruneTrips(many, Date.now());
  assert.strictEqual(out.length, TBC.MAX_TRIPS);
  assert.ok(out[0].at > out[1].at); // newest first
});

test('summariseTrips totals counts and tallies wins per person', function () {
  var trips = [
    trip(1, 10, 4, [entry('Ann', 2), entry('Bob', 6)], ['Ann']),
    trip(2, 5, 3, [entry('Ann', 8), entry('Bob', 1)], ['Bob'])
  ];
  var s = TBC.summariseTrips(trips);
  assert.strictEqual(s.tripCount, 2);
  assert.deepStrictEqual(s.totals, { tractors: 15, bikes: 7 });
  assert.strictEqual(s.leaderboard.length, 2);
  var ann = s.leaderboard.filter(function (e) { return e.name === 'Ann'; })[0];
  assert.strictEqual(ann.trips, 2);
  assert.strictEqual(ann.wins, 1);
  assert.strictEqual(ann.avgMiss, 5);   // (2 + 8) / 2
  assert.strictEqual(ann.bestMiss, 2);
});

test('summariseTrips matches names case- and whitespace-insensitively', function () {
  var trips = [
    trip(1, 1, 1, [entry('Joe', 3)], ['Joe']),
    trip(2, 1, 1, [entry('  joe  ', 1)], ['  joe  '])
  ];
  var s = TBC.summariseTrips(trips);
  assert.strictEqual(s.leaderboard.length, 1);
  assert.strictEqual(s.leaderboard[0].name, 'Joe'); // first-seen casing kept
  assert.strictEqual(s.leaderboard[0].trips, 2);
  assert.strictEqual(s.leaderboard[0].wins, 2);
});

test('summariseTrips counts tractor and bike titles separately', function () {
  var trips = [trip(1, 9, 9, [entry('Tess', 4), entry('Mo', 4)], ['Tess', 'Mo'], ['Tess'], ['Mo'])];
  var s = TBC.summariseTrips(trips);
  var tess = s.leaderboard.filter(function (e) { return e.name === 'Tess'; })[0];
  var mo = s.leaderboard.filter(function (e) { return e.name === 'Mo'; })[0];
  assert.strictEqual(tess.tractorWins, 1);
  assert.strictEqual(tess.bikeWins, 0);
  assert.strictEqual(mo.tractorWins, 0);
  assert.strictEqual(mo.bikeWins, 1);
  assert.strictEqual(tess.wins, 1); // shared overall title
  assert.strictEqual(mo.wins, 1);
});

test('summariseTrips sorts by wins, then average miss, then name', function () {
  var trips = [
    trip(1, 1, 1, [entry('Ann', 1), entry('Bob', 9), entry('Cat', 5)], ['Ann']),
    trip(2, 1, 1, [entry('Ann', 1), entry('Bob', 3), entry('Cat', 5)], ['Ann'])
  ];
  var s = TBC.summariseTrips(trips);
  // Ann: 2 wins. Bob avg 6, Cat avg 5 -> Cat ahead of Bob on accuracy.
  assert.deepStrictEqual(s.leaderboard.map(function (e) { return e.name; }), ['Ann', 'Cat', 'Bob']);
});

test('summariseTrips ignores blank names and junk entries', function () {
  var trips = [trip(1, 2, 2, [entry('', 3), null, entry('   ', 1), entry('Ann', 0)], ['Ann'])];
  var s = TBC.summariseTrips(trips);
  assert.strictEqual(s.leaderboard.length, 1);
  assert.strictEqual(s.leaderboard[0].name, 'Ann');
});

test('summariseTrips returns zeros, not NaN, on an empty history', function () {
  var s = TBC.summariseTrips([]);
  assert.strictEqual(s.tripCount, 0);
  assert.deepStrictEqual(s.totals, { tractors: 0, bikes: 0 });
  assert.deepStrictEqual(s.leaderboard, []);
  assert.deepStrictEqual(s.recent, []);
});

test('a record made by makeTripRecord summarises correctly end to end', function () {
  var players = [player('a', 'Ann', 12, 8), player('b', 'Bob', 3, 3)];
  var record = TBC.makeTripRecord(players, { tractors: 10, bikes: 9 }, Date.now());
  var s = TBC.summariseTrips(TBC.pruneTrips([record], Date.now()));
  assert.strictEqual(s.tripCount, 1);
  assert.deepStrictEqual(s.totals, { tractors: 10, bikes: 9 });
  assert.strictEqual(s.leaderboard[0].name, 'Ann'); // Ann is off by 3, Bob by 13
  assert.strictEqual(s.leaderboard[0].wins, 1);
});

console.log('\n' + passed + ' passed');
