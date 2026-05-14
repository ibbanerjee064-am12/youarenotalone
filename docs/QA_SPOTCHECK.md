# QA spot-check (v1)

Manual reconciliation steps after each data rebuild. Automated pulls can change back series when upstream sources revise estimates.

## United States (USA)

1. Open [World Bank SH.STA.SUIC.P5](https://data.worldbank.org/indicator/SH.STA.SUIC.P5?locations=US) and note the value for a recent year (for example 2020).
2. Open the local country page `/country/USA` and confirm the **total** series matches that year in the chart within rounding implied by the API payload.
3. If a mismatch appears, check whether WDI updated the back series (metadata `changelog` in `metadata.json`).

## United Kingdom (GBR)

1. Compare a mid-series year (for example 2015) against the same World Bank indicator page for the UK.
2. Confirm female and male splits move in a plausible direction relative to the total (not identical, not systematically inverted).

## India (IND)

1. Repeat for India for the earliest and latest years shown in the chart to catch ISO or merge errors (India should remain under `IND` in `geo.json`).
2. Note that low vital-registration coverage in some years can produce missing points; gaps are expected, not bugs.

## Known limitations (publish on Methods page if expanded)

- **Registration quality** drives cross-country comparability for suicide metrics; high rates may reflect better detection in some contexts.
- **World Bank aggregates** are excluded; subnational patterns are not represented.
- **IHME / WHO prevalence** rows are only present when `scripts/inputs/manual_prevalence_long.csv` is populated under license.
