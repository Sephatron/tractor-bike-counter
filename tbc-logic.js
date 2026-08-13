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
   * @returns {{id:string,name:string,colour:string,guessTractors:number,guessBikes:number,guessCustom:number}}
   */
  function createPlayer(name, index) {
    return {
      id: makeId(),
      name: String(name == null ? '' : name).trim(),
      colour: colourForIndex(index),
      guessTractors: 0,
      guessBikes: 0,
      guessCustom: 0
    };
  }

  // ---- The optional third counter -------------------------------------------

  // Matches the passenger name cap, so the two fields wrap the same way.
  var MAX_LABEL = 18;
  // Used when a counter is named but no symbol was chosen.
  var DEFAULT_CUSTOM_EMOJI = '🎯';

  /**
   * First grapheme cluster of a string, so one *visible* emoji is stored.
   *
   * Slicing by string index would cut a surrogate pair in half and a length
   * check would count 👨‍👩‍👧 as seven. Intl.Segmenter does this properly
   * wherever it exists; emojiClusterFallback() covers the engines that lack it.
   *
   * @param {*} value
   * @returns {string} A single grapheme, or '' when there is nothing usable.
   */
  function firstGrapheme(value) {
    var str = String(value == null ? '' : value).trim();
    if (!str) return '';
    try {
      if (typeof Intl !== 'undefined' && Intl.Segmenter) {
        var first = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
          .segment(str)[Symbol.iterator]().next();
        if (!first.done) return first.value.segment;
      }
    } catch (e) { /* fall through to the manual walk */ }
    return emojiClusterFallback(str);
  }

  /**
   * First emoji cluster, walked by hand for engines without Intl.Segmenter.
   *
   * Taking only the first code point is not good enough: it turns 🏍️ into a
   * bare 🏍 by dropping the variation selector, 🇬🇧 into 🇬, and 👍🏽 into a
   * default-toned 👍. The first two matter beyond looks, because the picker
   * highlights a grid button by comparing strings — a silently re-encoded
   * emoji never matches the button it came from.
   *
   * @param {string} str Non-empty, already trimmed.
   * @returns {string}
   */
  function emojiClusterFallback(str) {
    var cps = Array.from ? Array.from(str) : str.split('');
    if (!cps.length) return '';

    var REGIONAL_LO = 0x1F1E6, REGIONAL_HI = 0x1F1FF;
    var out = cps[0];
    var i = 1;
    var code = out.codePointAt(0);

    // A flag is exactly two regional indicators and never takes a suffix.
    if (code >= REGIONAL_LO && code <= REGIONAL_HI) {
      if (i < cps.length) {
        var next = cps[i].codePointAt(0);
        if (next >= REGIONAL_LO && next <= REGIONAL_HI) out += cps[i];
      }
      return out;
    }

    while (i < cps.length) {
      var c = cps[i].codePointAt(0);
      // Variation selectors, keycap, and skin-tone modifiers attach backwards.
      if (c === 0xFE0E || c === 0xFE0F || c === 0x20E3 || (c >= 0x1F3FB && c <= 0x1F3FF)) {
        out += cps[i++];
        continue;
      }
      // A zero-width joiner always binds the code point that follows it.
      if (c === 0x200D && i + 1 < cps.length) {
        out += cps[i] + cps[i + 1];
        i += 2;
        continue;
      }
      break;
    }
    return out;
  }

  /**
   * Turn raw setup input into a usable third counter, or nothing at all.
   *
   * A blank name returns null on purpose: that IS the "no third counter" state,
   * and it mirrors how a blank passenger is dropped when the trip starts, so
   * there is only one rule in the app for "you left it empty, so it is gone".
   *
   * @param {*} custom Anything shaped like { label, emoji }.
   * @returns {{label:string,emoji:string}|null}
   */
  function normaliseCustom(custom) {
    if (!custom || typeof custom !== 'object') return null;
    var label = String(custom.label == null ? '' : custom.label).trim().slice(0, MAX_LABEL);
    if (label === '') return null;
    return { label: label, emoji: firstGrapheme(custom.emoji) || DEFAULT_CUSTOM_EMOJI };
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

  // Every tallyable key, in the order the counting screen stacks them.
  // 'custom' is only ever tapped when a third counter is configured, but it is
  // always a legal key so a half-updated cache can never desync tap from undo.
  var COUNT_KEYS = ['tractors', 'bikes', 'custom'];

  /**
   * Is this one of the keys the tally understands?
   * @param {*} type
   * @returns {boolean}
   */
  function isCountKey(type) {
    return COUNT_KEYS.indexOf(type) !== -1;
  }

  /**
   * Register one tap of a given type. Mutates counts/history in place (the UI
   * holds a single live state object) and returns them for convenience.
   * Unknown types are ignored so a bad call can never corrupt the tally.
   * @param {{tractors:number,bikes:number,custom:number}} counts
   * @param {string[]} history Ordered log of taps, used by undo.
   * @param {string} type 'tractors' | 'bikes' | 'custom'
   * @returns {{counts:object,history:string[]}}
   */
  function tapCount(counts, history, type) {
    if (!isCountKey(type)) {
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
   * Independent titles for each counter, plus overall (lowest combined error).
   * Ties share the title, so every champ field is an array of ids.
   *
   * When no third counter is configured, every custom field reads as zero and
   * customChamps comes back empty, so a two-arg call behaves exactly as it did
   * before the third counter existed.
   *
   * @param {Array} players Roster with guessTractors / guessBikes / guessCustom.
   * @param {{tractors:number,bikes:number,custom:number}} actual Real counted totals.
   * @param {{label:string,emoji:string}} [custom] The third counter, if any.
   * @returns {{ranked:Array,actual:object,tractorChamps:string[],bikeChamps:string[],customChamps:string[],overallChamps:string[]}}
   */
  function score(players, actual, custom) {
    var active = normaliseCustom(custom);

    var safeActual = {
      tractors: toCount(actual && actual.tractors),
      bikes: toCount(actual && actual.bikes),
      // A count banked before the counter was removed must not leak into the
      // score, so an inactive counter reads as zero rather than as its tally.
      custom: active ? toCount(actual && actual.custom) : 0
    };

    var rows = (players || []).map(function (p) {
      var tractorDiff = Math.abs(toCount(p.guessTractors) - safeActual.tractors);
      var bikeDiff = Math.abs(toCount(p.guessBikes) - safeActual.bikes);
      var customDiff = active ? Math.abs(toCount(p.guessCustom) - safeActual.custom) : 0;
      return {
        id: p.id,
        name: p.name,
        colour: p.colour,
        guessTractors: toCount(p.guessTractors),
        guessBikes: toCount(p.guessBikes),
        guessCustom: toCount(p.guessCustom),
        tractorDiff: tractorDiff,
        bikeDiff: bikeDiff,
        customDiff: customDiff,
        total: tractorDiff + bikeDiff + customDiff
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
      custom: active,
      tractorChamps: championsBy('tractorDiff'),
      bikeChamps: championsBy('bikeDiff'),
      // No third counter means no third title, rather than a title everyone
      // ties for on a diff of zero.
      customChamps: active ? championsBy('customDiff') : [],
      overallChamps: championsBy('total')
    };
  }

  // ---- Trip history (the rolling 30-day scoreboard) -------------------------

  var DAY_MS = 86400000;
  var RETENTION_DAYS = 30;
  // Belt-and-braces cap so a pathological run of trips can never grow the
  // stored blob past the localStorage quota.
  var MAX_TRIPS = 200;

  /**
   * Normalise a passenger name into a key for matching across trips.
   *
   * Stats aggregate by name, not by id, on purpose: ids are regenerated every
   * time a passenger is re-added, so id matching would split one person into
   * several rows the first time the crew is cleared and retyped. The trade-off
   * is that two different people with the same name merge into one row.
   *
   * @param {*} name
   * @returns {string} Lower-cased, trimmed key ('' when there is no name).
   */
  function nameKey(name) {
    return String(name == null ? '' : name).trim().toLowerCase();
  }

  /**
   * Palette colour for a person, derived from their name.
   *
   * Stored trips carry no colour, and colouring the scoreboard by standing
   * would move a player's colour every time the ranking changed — in a game
   * where a child identifies with "the orange one", the dot is an identity
   * token, so it has to be stable. Hashing the name keeps it fixed for good.
   *
   * @param {string} name
   * @returns {string} Hex colour from PLAYER_COLOURS.
   */
  function colourForName(name) {
    var key = nameKey(name);
    var hash = 0;
    for (var i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return colourForIndex(Math.abs(hash));
  }

  /**
   * Freeze a finished trip into a storable record.
   *
   * Built on top of score() so the scoreboard can never disagree with the
   * reveal screen the player just looked at. Champions are stored as names
   * rather than ids for the reason given on nameKey().
   *
   * @param {Array} players Roster at the moment the trip finished.
   * @param {{tractors:number,bikes:number,custom:number}} counts Final counted totals.
   * @param {number} atMs Timestamp for the trip (falls back to now if junk).
   * @param {{label:string,emoji:string}} [custom] The third counter, if any.
   * @returns {object} Plain, JSON-safe trip record.
   */
  function makeTripRecord(players, counts, atMs, custom) {
    var r = score(players, counts, custom);

    var nameById = {};
    (players || []).forEach(function (p) {
      if (p && p.id != null) nameById[p.id] = String(p.name == null ? '' : p.name).trim();
    });
    function namesFor(ids) {
      return (ids || []).map(function (id) {
        return nameById[id] || '';
      }).filter(function (n) { return n !== ''; });
    }

    var at = Number(atMs);
    if (!isFinite(at)) at = Date.now();

    return {
      at: at,
      tractors: r.actual.tractors,
      bikes: r.actual.bikes,
      // Null rather than absent, so a stored trip always answers "was there a
      // third counter" without the reader having to know about old shapes.
      custom: r.custom
        ? { label: r.custom.label, emoji: r.custom.emoji, count: r.actual.custom }
        : null,
      players: r.ranked.map(function (row) {
        return {
          name: String(row.name == null ? '' : row.name).trim(),
          guessTractors: row.guessTractors,
          guessBikes: row.guessBikes,
          guessCustom: row.guessCustom,
          tractorDiff: row.tractorDiff,
          bikeDiff: row.bikeDiff,
          customDiff: row.customDiff,
          total: row.total
        };
      }),
      overall: namesFor(r.overallChamps),
      tractorChamps: namesFor(r.tractorChamps),
      bikeChamps: namesFor(r.bikeChamps),
      customChamps: namesFor(r.customChamps)
    };
  }

  /**
   * Drop everything outside the retention window, plus any malformed entry.
   *
   * This IS the 30-day wipe: it runs on read and on write rather than on a
   * timer, so old trips disappear on the next app launch whether or not the
   * app was running when they aged out. Returns newest first.
   *
   * @param {Array} trips
   * @param {number} nowMs Current time (falls back to Date.now() if junk).
   * @param {number} [days] Retention window, defaults to 30.
   * @returns {Array} A new array — the input is never mutated.
   */
  function pruneTrips(trips, nowMs, days) {
    var now = Number(nowMs);
    if (!isFinite(now)) now = Date.now();

    var keepDays = (days == null) ? RETENTION_DAYS : Number(days);
    if (!isFinite(keepDays) || keepDays < 0) keepDays = RETENTION_DAYS;

    var cutoff = now - keepDays * DAY_MS;
    // A trip dated in the future can never age out of a backwards-only window,
    // so a wrong phone clock would pin one to the top of the list forever.
    var horizon = now + DAY_MS;

    return (Array.isArray(trips) ? trips : []).filter(function (t) {
      if (!t || typeof t !== 'object') return false;
      var at = Number(t.at);
      return isFinite(at) && at > cutoff && at < horizon;
    }).sort(function (a, b) {
      return Number(b.at) - Number(a.at);
    }).slice(0, MAX_TRIPS);
  }

  /**
   * Roll a window of trips up into what the scoreboard screen renders.
   *
   * Expects an already-pruned list (newest first). An empty list summarises to
   * zeros rather than NaN so the screen can render without special-casing.
   *
   * @param {Array} trips
   * @returns {{tripCount:number,totals:object,customTotals:Array,leaderboard:Array,recent:Array}}
   */
  function summariseTrips(trips) {
    var list = (Array.isArray(trips) ? trips : []).filter(function (t) { return t && typeof t === 'object'; });
    var totals = { tractors: 0, bikes: 0 };
    var byKey = {};
    var order = [];
    // Custom counters roll up by name, not per trip: "Cows" spotted on three
    // separate drives is one line on the scoreboard, the same way one person
    // is one leaderboard row across three trips.
    var customByKey = {};
    var customOrder = [];

    list.forEach(function (trip) {
      totals.tractors += toCount(trip.tractors);
      totals.bikes += toCount(trip.bikes);

      var tripCustom = normaliseCustom(trip.custom);
      if (tripCustom) {
        var ckey = nameKey(tripCustom.label);
        var ce = customByKey[ckey];
        if (!ce) {
          // First-seen label casing and emoji win, matching the name rule.
          ce = customByKey[ckey] = { label: tripCustom.label, emoji: tripCustom.emoji, count: 0, trips: 0 };
          customOrder.push(ckey);
        }
        // Read the count off the raw record: normaliseCustom returns a fresh
        // {label, emoji} pair and deliberately carries no tally.
        ce.count += toCount(trip.custom && trip.custom.count);
        ce.trips += 1;
      }

      // Champion lists are names; turn each into a key set for O(1) lookups.
      var wonOverall = {}, wonTractor = {}, wonBike = {}, wonCustom = {};
      (trip.overall || []).forEach(function (n) { wonOverall[nameKey(n)] = true; });
      (trip.tractorChamps || []).forEach(function (n) { wonTractor[nameKey(n)] = true; });
      (trip.bikeChamps || []).forEach(function (n) { wonBike[nameKey(n)] = true; });
      (trip.customChamps || []).forEach(function (n) { wonCustom[nameKey(n)] = true; });

      // Two passengers can share a name within one trip. Without this, that
      // single trip would count twice against them and hand them two wins.
      var seenThisTrip = {};

      (trip.players || []).forEach(function (p) {
        if (!p) return;
        var key = nameKey(p.name);
        if (key === '') return; // a blank name can never win anything
        if (seenThisTrip[key]) return;
        seenThisTrip[key] = true;

        var e = byKey[key];
        if (!e) {
          e = byKey[key] = {
            name: String(p.name).trim(), // first-seen casing wins the display
            trips: 0,
            wins: 0,
            tractorWins: 0,
            bikeWins: 0,
            customWins: 0,
            totalMiss: 0,
            bestMiss: null,
            avgMiss: 0
          };
          order.push(key);
        }

        var miss = toCount(p.total);
        e.trips += 1;
        e.totalMiss += miss;
        e.bestMiss = (e.bestMiss === null) ? miss : Math.min(e.bestMiss, miss);
        if (wonOverall[key]) e.wins += 1;
        if (wonTractor[key]) e.tractorWins += 1;
        if (wonBike[key]) e.bikeWins += 1;
        if (wonCustom[key]) e.customWins += 1;
      });
    });

    var leaderboard = order.map(function (key) {
      var e = byKey[key];
      e.avgMiss = e.trips ? e.totalMiss / e.trips : 0;
      if (e.bestMiss === null) e.bestMiss = 0;
      return e;
    }).sort(function (a, b) {
      if (a.wins !== b.wins) return b.wins - a.wins;           // most wins first
      // Deliberate wart: a three-counter trip inflates avgMiss, so on a tie the
      // player who sat those trips out edges ahead. Normalising per counter
      // would make this number stop matching the "off by" on the reveal screen,
      // which is the number people actually argue about in the car.
      if (a.avgMiss !== b.avgMiss) return a.avgMiss - b.avgMiss; // then sharpest
      return String(a.name).localeCompare(String(b.name));       // then stable
    });

    var customTotals = customOrder.map(function (key) {
      return customByKey[key];
    }).sort(function (a, b) {
      if (a.count !== b.count) return b.count - a.count;      // biggest haul first
      return String(a.label).localeCompare(String(b.label));  // then stable
    });

    return {
      tripCount: list.length,
      totals: totals,
      customTotals: customTotals,
      leaderboard: leaderboard,
      recent: list
    };
  }

  var TBC = {
    PLAYER_COLOURS: PLAYER_COLOURS,
    RETENTION_DAYS: RETENTION_DAYS,
    MAX_TRIPS: MAX_TRIPS,
    MAX_LABEL: MAX_LABEL,
    COUNT_KEYS: COUNT_KEYS,
    DEFAULT_CUSTOM_EMOJI: DEFAULT_CUSTOM_EMOJI,
    colourForIndex: colourForIndex,
    colourForName: colourForName,
    makeId: makeId,
    createPlayer: createPlayer,
    toCount: toCount,
    isCountKey: isCountKey,
    firstGrapheme: firstGrapheme,
    emojiClusterFallback: emojiClusterFallback,
    normaliseCustom: normaliseCustom,
    tapCount: tapCount,
    undoCount: undoCount,
    score: score,
    nameKey: nameKey,
    makeTripRecord: makeTripRecord,
    pruneTrips: pruneTrips,
    summariseTrips: summariseTrips
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TBC;
  } else {
    root.TBC = TBC;
  }
})(typeof window !== 'undefined' ? window : this);
