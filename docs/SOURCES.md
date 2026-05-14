# v1 indicator shortlist (Tier A — direct mortality / harm)

The ETL also emits **derived delivery files** (not separate indicators): `explore_snapshot.json` (one ranked table for the snapshot year) and `by_country/{ISO3}.json` shards for faster country pages.

---


This release prioritizes **suicide mortality** from the World Bank World Development Indicators (WDI), aligned with WHO/UN SDG 3.4.2 definitions in spirit, with WDI’s own compilation and modeling notes. Additional **disorder prevalence** slots are reserved for IHME GBD or WHO Mental Health Atlas hand-offs (see manual input template).

| `indicator_id` | Definition | Unit | Method | Primary source | License / use |
|----------------|------------|------|--------|------------------|---------------|
| `wb_suicide_mortality_total` | Suicide mortality rate (all ages, both sexes combined) | deaths per 100,000 population per year | WDI compilation from WHO Vital Registration and verbal autopsy; see WDI metadata | World Bank WDI `SH.STA.SUIC.P5` | [World Bank Terms of Use](https://www.worldbank.org/en/about/legal/terms-of-use-for-datasets) — open data with attribution |
| `wb_suicide_mortality_female` | Suicide mortality rate (female) | same | same | `SH.STA.SUIC.FE.P5` | same |
| `wb_suicide_mortality_male` | Suicide mortality rate (male) | same | same | `SH.STA.SUIC.MA.P5` | same |
| `ihme_depressive_disorders_prevalence` | Prevalence of depressive disorders (age-standardized or reported measure per file) | % population | **Manual / curated file** from IHME GBD Results export | IHME GBD (download via [GBD Results](https://vizhub.healthdata.org/gbd-results/)) | [IHME Free-of-Charge Data Terms](https://www.healthdata.org/data-tools-practices/data-use-agreement) — register and follow redistribution rules |
| `ihme_anxiety_disorders_prevalence` | Prevalence of anxiety disorders | % | Manual GBD export | IHME GBD | same |
| `ihme_self_harm_non_fatal_prevalence` | Non-fatal self-harm prevalence (if exported as distinct measure) | cases per 100k or % per export | Manual GBD export | IHME GBD | same |

## Planned expansions (not in automated v1 build)

- **WHO Mental Health Atlas** tables (PDF/XLSX) — manual quarterly ingest with citation row per observation.
- **OECD** mental health care indicators — automate once a stable SDMX series is locked and tested.
- **WHO GHO OData** — candidate for automated ingest after we pin a filtered `seriesCode` that returns bounded payloads (full-table pulls are too large for CI).

## Attribution (display on site)

- “World Bank, World Development Indicators” with link to `https://data.worldbank.org/` and retrieval date from `metadata.json`.
- IHME: “Institute for Health Metrics and Evaluation (IHME). Global Burden of Disease Study YYYY.” with link to the exact GHDx or results citation you used for the manual merge.

## Data policy (summary)

- **No web scraping of personal disclosures** (apps, forums, social posts).
- **No headline “wellbeing index”** from social determinants alone; poverty/education may appear later only as labeled **Tier B context**, separate tabs.
