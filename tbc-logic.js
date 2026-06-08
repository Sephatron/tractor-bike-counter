/**
 * TBC (TractorBikeCounter) — pure game logic.
 *
 * No DOM and no storage live in here on purpose: every function below is a
 * plain input -> output transform, so it can be unit-tested in Node AND reused
 * unchanged in the browser. The UI layer (index.html) is the only thing that
 * touches the DOM, localStorage, haptics or sound.
 */
(function (root) {
  'use strict';

  // Playful palette, assigned to passengers in roster order then wrapping.
  // Order roughly matches the "grass / sun / tractor-orange" brief.
  var PLAYER_COLOURS = [
    '#e8612c', // tractor orange
    '#2e9e4f', // grass green
    '#f5b916', // sun yellow
    '#3a8dde', // sky blue
    '#9b59b6', // grape
    '#e84393', // pink
    '#16a085', // teal
    '#d63031'  // poppy red
  ];

  /**
   * Colour for a passenger at a given roster position (wraps past the palette).
   * @param {number} index Zero-based roster position.
   * @returns {string} Hex colour.
   */
  function colourForIndex(index) {
    var i = Number(index) || 0;
    return PLAYER_COLOURS[((i % PLAYER_COLOURS.length) + PLAYER_COLOURS.length) % PLAYER_COLOURS.length];
  }

  /**
   * Generate a collision-resistant id for a passenger.
   * @returns {string}
   */
  function makeId() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  /**
   * Create a passenger with sensible defaults.
   * @param {string} name Passenger name (trimmed).
   * @param {number} index Roster position, drives the colour.
   * @returns {{id:string,name:string,colour:string,guessTractors:number,guessBikes:number}}
   */
  function createPlayer(name, index) {
    return {
      id: makeId(),
      name: String(name == null ? '' : name).trim(),
      colour: colourForIndex(index),
      guessTractors: 0,
      guessBikes: 0
    };
  }

  /**
   * Clamp a value to a non-negative integer (guesses and counts can never go
   * below zero, and we never want a stray float or NaN in the state).
   * @param {*} value
   * @returns {number}
   */
  function toCount(value) {
    var n = Math.floor(Number(value));
    if (!isFinite(n) || n < 0) return 0;
    return n;
  }

  /**
   * Register one tap of a given type. Mutates counts/history in place (the UI
   * holds a single live state object) and returns them for convenience.
   * Unknown types are ignored so a bad call can never corrupt the tally.
   * @param {{tractors:number,bikes:number}} counts
   * @param {string[]} history Ordered log of taps, used by undo.
   * @param {string} type 'tractors' | 'bikes'
   * @returns {{counts:object,history:string[]}}
   */
  function tapCount(counts, history, type) {
    if (type !== 'tractors' && type !== 'bikes') {
      return { counts: counts, history: history };
    }
    counts[type] = toCount(counts[type]) + 1;
    history.push(type);
    return { counts: counts, history: history };
  }

  /**
   * Undo the most recent tap, if there is one. Never drops a count below zero.
   * @param {{tractors:number,bikes:number}} counts
   * @param {string[]} history
   * @returns {{counts:object,history:string[],undone:(string|null)}}
   */
  function undoCount(counts, history) {
    if (!history.length) {
      return { counts: counts, history: history, undone: null };
    }
    var last = history.pop();
    counts[last] = Math.max(0, toCount(counts[last]) - 1);
    return { counts: counts, history: history, undone: last };
  }

  /**
   * Score every passenger against the real counts.
   *
   * Rules (locked with Joe): closest guess wins by absolute difference.
   * Three independent titles — tractor, bike, and overall (lowest combined
   * error). Ties share the title, so every champ field is an array of ids.
   *
   * @param {Array} players Roster with guessTractors / guessBikes.
   * @param {{tractors:number,bikes:number}} actual Real counted totals.
   * @returns {{ranked:Array,tractorChamps:string[],bikeChamps:string[],overallChamps:string[]}}
   */
  function score(players, actual) {
    var safeActual = {
      tractors: toCount(actual && actual.tractors),
      bikes: toCount(actual && actual.bikes)
    };

    var rows = (players || []).map(function (p) {
      var tractorDiff = Math.abs(toCount(p.guessTractors) - safeActual.tractors);
      var bikeDiff = Math.abs(toCount(p.guessBikes) - safeActual.bikes);
      return {
        id: p.id,
        name: p.name,
        colour: p.colour,
        guessTractors: toCount(p.guessTractors),
        guessBikes: toCount(p.guessBikes),
        tractorDiff: tractorDiff,
        bikeDiff: bikeDiff,
        total: tractorDiff + bikeDiff
      };
    });

    // All passengers sharing the smallest value for a given key are champs.
    function championsBy(key) {
      if (!rows.length) return [];
      var best = rows.reduce(function (lo, r) { return r[key] < lo ? r[key] : lo; }, rows[0][key]);
      return rows.filter(function (r) { return r[key] === best; }).map(function (r) { return r.id; });
    }

    var ranked = rows.slice().sort(function (x, y) {
      if (x.total !== y.total) return x.total - y.total;
      return String(x.name).localeCompare(String(y.name)); // friendly, stable tie-break
    });

    return {
      ranked: ranked,
      actual: safeActual,
      tractorChamps: championsBy('tractorDiff'),
      bikeChamps: championsBy('bikeDiff'),
      overallChamps: championsBy('total')
    };
  }

  var TBC = {
    PLAYER_COLOURS: PLAYER_COLOURS,
    colourForIndex: colourForIndex,
    makeId: makeId,
    createPlayer: createPlayer,
    toCount: toCount,
    tapCount: tapCount,
    undoCount: undoCount,
    score: score
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TBC;
  } else {
    root.TBC = TBC;
  }
})(typeof window !== 'undefined' ? window : this);
