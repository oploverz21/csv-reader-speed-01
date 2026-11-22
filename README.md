# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/oploverz21/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/oploverz21/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for csv-reader 1.0.0 — reads broken CSV files exactly as the reference does, with an indexOf/slice parser and a whole-line fast path.

## How it works

`solve.js` answers `{columns, rows, errors}` for each `{text, header}` input with exactly csv-reader 1.0.0's broken-row policy (BOM, stray CR, unterminated quotes, quote junk, short/long rows, multi-line quoted fields). Two gears:

- **Whole-line fast path** — a clean record (no quotes, no stray CR) is taken with one `split(',')`.
- **indexOf/slice parser** — every other record is parsed with jumps to the next delimiter, quote or line break, so no field is ever built one character at a time.

`main.ts` is the harness driver: it reads every case from `cases.json` in the input directory, answers each with `run()` from `solve.js`, and writes `answers.json` to the output directory.

## Run it

```sh
MAKEFUN_INPUT_DIR=./input MAKEFUN_OUTPUT_DIR=./output node main.ts
```

Requires Node 22 or later, nothing to install.

---

<sub>Entered on [make.fun](https://make.fun/?ref=1wb47vye&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
