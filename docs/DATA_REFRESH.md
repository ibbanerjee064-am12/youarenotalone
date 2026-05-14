# Hybrid data refresh

## Automated (monthly)

1. From the repository root, install Node deps once: `npm install`.
2. Run `npm run data:build` (Node 18+). This re-fetches World Bank WDI suicide indicators for all member economies (non-aggregate rows only) and rewrites `site/public/data/*.json`.
3. **Optional Python path:** `pip install -r scripts/requirements.txt && python scripts/build_data.py` performs the same merge logic if you prefer Python in CI.
4. Commit updated JSON when values move, or attach artifacts in your release pipeline.

## Manual / quarterly

1. Download IHME GBD (or WHO Atlas) exports you are licensed to redistribute or to summarize without redistribution (follow each provider’s terms).
2. Normalize into `scripts/inputs/manual_prevalence_long.csv` (see `scripts/inputs/manual_prevalence_long.example.csv`).
3. Re-run `build_data.py` and record notes in `metadata.changelog`.

## Changelog

The build embeds `metadata.changelog` with an entry `{ "at": "<ISO8601>", "notes": "..." }`. Edit `scripts/build_data.py` or extend the script to append release notes from `CHANGELOG_DATA.md` if you adopt that workflow.

## Validation

After each build:

```bash
npm install
npm run data:validate
```

**Python (optional):** `pip install -r scripts/requirements.txt && python scripts/validate_package.py`

CI runs `npm run data:build && npm run data:validate` (see `.github/workflows/data.yml`).
