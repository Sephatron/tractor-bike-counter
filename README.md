# TBC — TractorBikeCounter 🚜🏍️

A tiny **offline** road-trip game. Everyone in the car guesses how many tractors
and motorbikes you'll see; the spotter taps them as they pass; closest guesser
wins. Runs 100% on the phone once installed — no accounts, no internet at
runtime, nothing leaves the device.

## How to play

1. **Setup** — add everyone in the car. Each person enters a guess for tractors
   and a guess for motorbikes (for the whole trip). Tap **Start trip**.
2. **Count** — tap the **top half** for a tractor, the **bottom half** for a
   motorbike. **Undo** fixes a mis-tap on a pothole. The running totals show, but
   who's actually winning stays secret.
3. **Finish** — plays a little fanfare and reveals the results: the **overall
   champ** (smallest combined miss), plus separate **Tractor Champ** and **Bike
   Champ**. Ties share the title. **Play again** keeps the same crew and resets
   for the next leg.

Closest guess wins by absolute difference — no "bust" for over-guessing, so
everyone stays in it to the end.

## The third counter (🐄, or whatever you like)

Any trip can carry **one extra thing to count**. On the setup screen, tap
**＋ Add a third thing to count**, give it a name ("Cows", "Red cars",
"Caravans") and tap the symbol button to pick an emoji — either from the grid or
by typing/pasting your own.

- Every passenger gets a third guess, and the counting screen splits into
  **three** tap zones instead of two.
- It earns its own champ title on the reveal, and its miss counts towards the
  overall winner.
- **Play again** keeps it, so the next leg counts the same thing. The **✕** on
  the card removes it and the app goes back to two counters everywhere.
- Add the counter but leave the **name blank**, and it is quietly dropped when
  the trip starts — the same rule that drops a blank passenger.

Trips with a third counter show up on the scoreboard under **Other spots**,
grouped by name: "Cows" spotted on three separate drives is one line, not three.

Note that a trip with three counters produces bigger "off by" numbers than a
trip with two, so the scoreboard's **avg off by** and **best** figures mix the
two scales. Who wins a given trip is unaffected, because every passenger on that
trip is scored against the same counters. The leaderboard, though, breaks ties
on average miss — so between two people level on wins, whoever sat out the
three-counter trips carries the smaller average and ranks higher. Left as-is
deliberately: it only bites on a tie, and wins are the ranking that matters.

## The scoreboard (📊)

Every finished trip is logged, and the **📊** button — on the setup screen, and
under "Play again" on the results screen — shows the **last 30 days**:

- **Totals** for the window: trips played, tractors spotted, bikes spotted.
- **Other spots**: one row per custom counter used in the window, with its
  emoji, its total and how many trips it ran on. Hidden when there are none.
- **Leaderboard** ranked by wins, then by average miss. Each row shows trips
  played, average miss and best single-trip miss.
- **Recent trips**: date, the counts, and who took the trophy.

Anything older than 30 days is deleted automatically the next time the app
opens — no timer needed, and nothing to tidy up. **Clear the record** wipes it
all immediately.

People are matched **by name**, so clearing the crew and retyping the same names
keeps their history. Two different people sharing a name will share a row.

## Get it onto your Pixel

**Recommended — one time over wifi, then offline forever:**

1. Create a new GitHub repo and upload the contents of this folder
   (drag-and-drop in the GitHub web UI is easiest — no git needed).
   *If you push from the Mac and it hangs at "writing objects", use
   `git push --no-thin` — Apple Git struggles with the pack upload.*
2. Repo **Settings → Pages → Deploy from branch → main / root**. Wait for the
   green tick, copy the `https://<you>.github.io/<repo>/` URL.
3. On the Pixel, open that URL in **Chrome** → menu **⋮** → **Add to Home
   screen / Install app**.
4. Launch from the new icon: fullscreen, portrait, fully offline. Drop signal in
   the middle of nowhere and it doesn't care.

**Zero-hosting fallback (never touches the internet):** copy the folder to the
phone, open `index.html` in Chrome from Files. It still works offline (there are
no network calls) and saves state locally. "Add to Home screen" makes a shortcut,
though the fullscreen/standalone polish needs the served route above.

## Settings (⚙️)

- **Tap sounds** — off by default; flip on for the tractor "brrr" / bike "vroom".
- **Finish fanfare** — on by default; the short victory melody when a trip ends.
  Separate from tap sounds, because it only fires once a trip.
- **Theme** — Auto (follows the phone, dims at night), Light, or Dark.
- A **haptic buzz** fires on every tap (Android).

## Files

| File | What it is |
|------|------------|
| `index.html` | The whole app — UI + glue (inline CSS/JS) |
| `tbc-logic.js` | Pure game logic: scoring, undo, state, trip history. No DOM, no storage. |
| `tbc-logic.test.js` | Unit tests for the logic above |
| `manifest.webmanifest` / `sw.js` | PWA install + offline service worker |
| `icon-192.png` / `icon-512.png` | App icons |
| `make-icons.py` | Regenerates the icons (needs Pillow) |

## Dev notes

```bash
# Run the logic tests (no dependencies)
node tbc-logic.test.js

# Preview locally
python3 -m http.server 8190 --directory .
# then open http://localhost:8190

# Rebuild the icons
python3 make-icons.py
```

Live game state lives in `localStorage` under `tbc.game.v1`, so an accidental
app/phone close mid-trip never loses the count. The 30-day trip history is a
separate key, `tbc.stats.v1` — keeping them apart means a corrupt or oversized
scoreboard can never take a live trip down with it.

The third counter is one nullable field, `custom: {label, emoji}` or `null`, in
both keys. No storage version was bumped when it was added: `null` is exactly
what state written before the feature loads as, so a phone mid-trip when the
update lands keeps counting and old stored trips still render.

If you change any cached file, **bump `CACHE` in `sw.js`**. The service worker
is cache-first, so without a new cache name an installed phone keeps serving the
old `index.html` and your change never appears.
