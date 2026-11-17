# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Krwanz/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Krwanz/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Radar — model radar-3: a ranked board of pre-token protocols by implied launch value, with a farm plan for each.

Entry for make.fun `token-radar-01`: build the best token launch radar.
$1,325 total, 1st place $1,000. Deadline 2026-12-14T10:00:00Z.

## What it does

`main.ts` (Node 22, standard library only) reads the sealed snapshot at
`/input/snapshot.json`, scores every rankable pre-token protocol, and writes:

- `board.json` — 226 ranked rows (40 watchlist + 186 early below the floor)
- `data.js` — the dashboard's dataset, plus 24 live-token protocols set aside
- `dashboard/` — a static, offline page (sortable, filterable, detail view)
- `screenshots/` — board, detail, filtered views
- `dossier.json` — built with the vendored `vendor/makefun-board.ts`

## Model (radar-3)

```
implied = round( TVL x market-rate
  x (1 + clamp(change_7d, -50, 100) / 100 x 0.60)
  x (0.60 + min(age_days, 1095) / 1095 x 0.40)
  x (1 + 0.04 per extra chain, capped at 5)
  x category_factor )
```

- The market rate is the median market cap per dollar of TVL among the
  comparable live-token protocols in this same snapshot: TVL at or above
  the $50M floor, no exchange, no versioned pool, no derivative product.
  In this snapshot 29 such protocols trade at a median of $0.082 of market
  cap per $1 of TVL, so a pre-token protocol of the same size is priced at
  the rate the market already pays, not at launch hype. The rate scales
  every row alike, so no rank depends on it; the ranking is decided by
  growth, age, breadth and category alone.
- `category_factor` is 0.60 for bridges, liquid-staking and other derivative
  products (a token of a token that already trades), 0.90 for curators and
  allocators, 1.00 otherwise. It is read from the snapshot's `category`
  field, never from a protocol's name.
- Age is days since first listed; unknown age uses 365 days.
- A protocol is pre-token when it records no market cap, no CoinGecko id
  and no symbol. Centralised exchanges and versioned pools are not ranked.

Each row carries a 7-step farm plan derived from its category, chains, TVL
and age, with a cost and a time per step.

## Run locally

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
```

Run it twice and compare the outputs: both runs must write identical bytes.

## Status

Built for make.fun `token-radar-01`, entered as @mszwanz27 from the public
repository Krwanz/token-radar-01.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a15ed58m&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
