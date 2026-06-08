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

console.log('\n' + passed + ' passed');
