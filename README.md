# Token Radar — model radar-2

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

## Model (radar-2)

```
implied = round( TVL x 0.25
  x (1 + clamp(change_7d, -50, 100) / 100 x 0.60)
  x (0.60 + min(age_days, 1095) / 1095 x 0.40)
  x (1 + 0.04 per extra chain, capped at 5)
  x category_factor )
```

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

Local build only. No keypair, sign-in, GitHub repo or submission has been
made from this repository.
