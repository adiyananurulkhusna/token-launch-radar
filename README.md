# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/adiyananurulkhusna/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/adiyananurulkhusna/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar: pre-token protocols ranked by **implied value**, with a
concrete farm plan for each one. Built for the make.fun bounty
`token-radar-01` (snapshot: DefiLlama protocol index, 2026-11-14).

## Run it

```sh
node main.ts --input /path/to/snapshot.json --output /path/to/out
```

With no arguments it reads `/input/snapshot.json` (then
`input/snapshot.json`) and writes to `$MAKEFUN_OUTPUT_DIR` (then `/output`,
then `./out`). The program is deterministic: the same snapshot always
produces the same bytes. It writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json`, and refuses to write a board that fails
the gate (100–4,000 rows, ranks 1..N, implied values positive and
non-increasing, 3–12 farm steps per row, every watchlist slug present).

## The model — radar-2

```
implied = TVL × category multiple × growth × maturity × reach
```

* **Category multiple** — the median market-cap / TVL of live-token
  protocols in the same category, computed from this snapshot. A category
  with fewer than three live comparables falls back to the global median.
  Clamped to [0.03, 1.5].
* **Growth** — the 7-day TVL change, clamped to [-60%, +120%], worth at
  most ±30%.
* **Maturity** — 0.70 for a protocol listed yesterday, up to 1.00 after
  three years; unknown listing date counts as one year.
* **Reach** — +4% per extra chain, up to +20%.

The board ranks every rankable pre-token protocol: all 40 watchlist rows
plus every other pre-token protocol below the $50M floor — 226 rows in
this snapshot. Live-token protocols are set aside in their own tab; they
are the comparables the multiples come from, not the radar's targets.
Protocols above the floor that the watchlist does not name are left out:
at that size they are overwhelmingly wrapped, bridged or exchange
products, not standalone protocols about to launch a token.

## The dashboard

`dashboard/` is a single-page app (no network, no build step) with search,
category / chain / TVL filters, a watchlist toggle, five sort orders, a
detail drawer per protocol (model breakdown + 6-step farm plan), and a
model sandbox: two sliders re-rank the board live so you can see how
sensitive the ranking is to the growth weight and the maturity floor.

## Layout

```
main.ts                  entrypoint (Node 22, stdlib only)
lib/model.ts             the model, farm plans, board builder, gate mirror
vendor/makefun-board.ts  dossier builder, vendored byte-for-byte from the kit
dashboard/               index.html, app.css, app.js
screenshots/             board, detail and filtered views of the dashboard
```

The dashboard's `app.js` carries its own copy of the model rules and
regenerates the farm plans, so the page and the board always agree.

## Caveats

* "Records no token" is a fact about the snapshot, not a promise that no
  token exists or that one will launch.
* Implied value is this entry's model, not a price or a prediction.
* Farm plans cost real gas on real chains; the costs shown are
  per-transaction estimates for the protocol's main chain.

---

<sub>Entered on [make.fun](https://make.fun/?ref=0sc1f0wn&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
