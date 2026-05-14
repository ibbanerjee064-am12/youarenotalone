# Global wellbeing data product

Static Astro site plus a reproducible data package under `site/public/data/`.

## Prerequisites

- Node 18+ (includes `fetch`). On Windows, if `npm` is not on your PATH, install Node LTS from [nodejs.org](https://nodejs.org/).

## Build data (no npm required)

```bash
node scripts/build_data.mjs
node scripts/validate_data.mjs
```

Optional Python equivalent: `pip install -r scripts/requirements.txt` then `python scripts/build_data.py` and `python scripts/validate_package.py`.

## Build the site

```bash
npm install --prefix site
npm run build --prefix site
```

Preview locally:

```bash
npm run dev --prefix site
```

## Repository layout

| Path | Role |
|------|------|
| `docs/SOURCES.md` | v1 indicator dictionary and licenses |
| `docs/DATA_REFRESH.md` | Hybrid refresh workflow |
| `docs/QA_SPOTCHECK.md` | Spot-check notes vs primaries |
| `schemas/` | JSON Schemas (contract reference) |
| `scripts/build_data.mjs` | ETL (World Bank + optional manual CSV) |
| `scripts/validate_data.mjs` | Structural validation |
| `site/` | Astro frontend |

## CI

GitHub Actions workflow `.github/workflows/data.yml` rebuilds data from APIs, validates, installs Astro dependencies, and runs `astro build`.
