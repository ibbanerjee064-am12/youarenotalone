"""
Fetch public Tier A indicators, merge optional manual prevalence rows, emit website JSON
(core tables plus ``by_country/*.json`` and ``explore_snapshot.json``).
"""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "site" / "public" / "data"
INPUT_DIR = ROOT / "scripts" / "inputs"
MANUAL_CSV = INPUT_DIR / "manual_prevalence_long.csv"

WB_BASE = "https://api.worldbank.org/v2"

WB_SUICIDE = [
    ("wb_suicide_mortality_total", "SH.STA.SUIC.P5"),
    ("wb_suicide_mortality_female", "SH.STA.SUIC.FE.P5"),
    ("wb_suicide_mortality_male", "SH.STA.SUIC.MA.P5"),
]

WB_LIMITATIONS = (
    "World Bank WDI compilation; underlying vital registration quality varies by country. "
    "Not directly comparable to survey-based psychological distress."
)

MANUAL_INDICATORS = {
    "ihme_depressive_disorders_prevalence",
    "ihme_anxiety_disorders_prevalence",
    "ihme_self_harm_non_fatal_prevalence",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def utc_date() -> str:
    return datetime.now(timezone.utc).date().isoformat()


def fetch_wb_countries() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    page = 1
    while True:
        r = requests.get(
            f"{WB_BASE}/country",
            params={"format": "json", "per_page": 500, "page": page},
            timeout=120,
        )
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list) or len(body) < 2:
            break
        chunk = body[1]
        if not chunk:
            break
        rows.extend(chunk)
        meta = body[0]
        if page >= int(meta.get("pages", page)):
            break
        page += 1
    return rows


def country_geo_records(countries: list[dict[str, Any]]) -> tuple[dict[str, str], list[dict[str, Any]]]:
    """Return iso3->name map and geo.json records for non-aggregate economies."""
    iso3_to_name: dict[str, str] = {}
    geo: list[dict[str, Any]] = []
    for c in countries:
        if c.get("region", {}).get("value") == "Aggregates":
            continue
        iso3 = c.get("id")
        if not iso3 or len(iso3) != 3:
            continue
        name = c.get("name", "")
        region = (c.get("region") or {}).get("value", "")
        inc = (c.get("incomeLevel") or {}).get("value", "")
        iso3_to_name[iso3] = name
        geo.append({"iso3": iso3, "name": name, "region": region, "income_level": inc})
    geo.sort(key=lambda x: x["name"])
    return iso3_to_name, geo


def fetch_indicator_all_pages(wb_id: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    page = 1
    while True:
        r = requests.get(
            f"{WB_BASE}/country/all/indicator/{wb_id}",
            params={
                "format": "json",
                "date": "2000:2024",
                "per_page": 20000,
                "page": page,
            },
            timeout=180,
        )
        r.raise_for_status()
        body = r.json()
        if not isinstance(body, list) or len(body) < 2:
            break
        chunk = body[1]
        if not chunk:
            break
        out.extend(chunk)
        meta = body[0]
        if page >= int(meta.get("pages", page)):
            break
        page += 1
    return out


def load_manual_rows() -> list[dict[str, Any]]:
    if not MANUAL_CSV.is_file():
        return []
    rows: list[dict[str, Any]] = []
    with open(MANUAL_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if not row.get("indicator_id"):
                continue
            rows.append(row)
    return rows


def build_series(
    iso3_allowed: set[str],
    retrieval_date: str,
) -> list[dict[str, Any]]:
    series: list[dict[str, Any]] = []
    for ind_id, wb_id in WB_SUICIDE:
        source_url = f"https://data.worldbank.org/indicator/{wb_id}"
        for row in fetch_indicator_all_pages(wb_id):
            iso3 = row.get("countryiso3code") or ""
            if iso3 not in iso3_allowed:
                continue
            val = row.get("value")
            if val in (None, ""):
                continue
            try:
                year = int(row["date"])
                value = float(val)
            except (TypeError, ValueError):
                continue
            series.append(
                {
                    "indicator_id": ind_id,
                    "iso3": iso3,
                    "year": year,
                    "value": value,
                    "tier": "A",
                    "unit": "per 100,000 population per year",
                    "source_url": source_url,
                    "retrieval_date": retrieval_date,
                    "limitations": WB_LIMITATIONS,
                }
            )

    for row in load_manual_rows():
        ind = (row.get("indicator_id") or "").strip()
        if ind not in MANUAL_INDICATORS:
            print(f"Skipping unknown manual indicator_id: {ind}", file=sys.stderr)
            continue
        iso3 = (row.get("iso3") or "").strip().upper()
        if iso3 not in iso3_allowed:
            print(f"Skipping manual row: unknown iso3 {iso3}", file=sys.stderr)
            continue
        try:
            year = int(row["year"])
            value = float(row["value"])
        except (KeyError, TypeError, ValueError):
            print(f"Skipping malformed manual row: {row}", file=sys.stderr)
            continue
        unit = (row.get("unit") or "% of population").strip()
        lim = (row.get("limitations") or "").strip() or (
            "Manually merged from IHME/WHO export; confirm measure (age-standardized vs crude) in source."
        )
        src = (row.get("source_url") or "").strip()
        if not src:
            print(f"Skipping manual row without source_url: {row}", file=sys.stderr)
            continue
        series.append(
            {
                "indicator_id": ind,
                "iso3": iso3,
                "year": year,
                "value": value,
                "tier": "A",
                "unit": unit,
                "source_url": src,
                "retrieval_date": retrieval_date,
                "limitations": lim,
            }
        )
    series.sort(key=lambda x: (x["indicator_id"], x["iso3"], x["year"]))
    return series


def build_sources() -> list[dict[str, Any]]:
    return [
        {
            "indicator_id": "wb_suicide_mortality_total",
            "label": "Suicide mortality (all)",
            "definition": "Suicide mortality rate (per 100,000 population per year), both sexes.",
            "method_summary": "WDI; compiled from WHO and other inputs per World Bank metadata.",
            "tier": "A",
            "primary_source_name": "World Bank World Development Indicators",
            "primary_source_url": "https://data.worldbank.org/indicator/SH.STA.SUIC.P5",
            "license_note": "World Bank data license — attribute the World Bank.",
            "automation": "automated",
        },
        {
            "indicator_id": "wb_suicide_mortality_female",
            "label": "Suicide mortality (female)",
            "definition": "Female suicide mortality rate (per 100,000 female population per year).",
            "method_summary": "WDI; see indicator metadata.",
            "tier": "A",
            "primary_source_name": "World Bank World Development Indicators",
            "primary_source_url": "https://data.worldbank.org/indicator/SH.STA.SUIC.FE.P5",
            "license_note": "World Bank data license — attribute the World Bank.",
            "automation": "automated",
        },
        {
            "indicator_id": "wb_suicide_mortality_male",
            "label": "Suicide mortality (male)",
            "definition": "Male suicide mortality rate (per 100,000 male population per year).",
            "method_summary": "WDI; see indicator metadata.",
            "tier": "A",
            "primary_source_name": "World Bank World Development Indicators",
            "primary_source_url": "https://data.worldbank.org/indicator/SH.STA.SUIC.MA.P5",
            "license_note": "World Bank data license — attribute the World Bank.",
            "automation": "automated",
        },
        {
            "indicator_id": "ihme_depressive_disorders_prevalence",
            "label": "Depressive disorders prevalence",
            "definition": "Population prevalence of depressive disorders (exact age standardization per your export).",
            "method_summary": "IHME GBD modeled prevalence; import via manual CSV.",
            "tier": "A",
            "primary_source_name": "IHME Global Burden of Disease",
            "primary_source_url": "https://www.healthdata.org/gbd",
            "license_note": "Follow IHME Data Use Agreement for the export you merge.",
            "automation": "manual_file",
        },
        {
            "indicator_id": "ihme_anxiety_disorders_prevalence",
            "label": "Anxiety disorders prevalence",
            "definition": "Population prevalence of anxiety disorders per merged export.",
            "method_summary": "IHME GBD modeled prevalence; import via manual CSV.",
            "tier": "A",
            "primary_source_name": "IHME Global Burden of Disease",
            "primary_source_url": "https://www.healthdata.org/gbd",
            "license_note": "Follow IHME Data Use Agreement for the export you merge.",
            "automation": "manual_file",
        },
        {
            "indicator_id": "ihme_self_harm_non_fatal_prevalence",
            "label": "Non-fatal self-harm prevalence",
            "definition": "Non-fatal self-harm cases or prevalence per merged export definition.",
            "method_summary": "IHME GBD; import via manual CSV with explicit unit and age band.",
            "tier": "A",
            "primary_source_name": "IHME Global Burden of Disease",
            "primary_source_url": "https://www.healthdata.org/gbd",
            "license_note": "Follow IHME Data Use Agreement for the export you merge.",
            "automation": "manual_file",
        },
    ]


def pick_suicide_year(
    series: list[dict[str, Any]],
) -> tuple[int | None, list[dict[str, Any]]]:
    ind = "wb_suicide_mortality_total"
    by_year: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for s in series:
        if s["indicator_id"] == ind:
            by_year[s["year"]].append(s)
    if not by_year:
        return None, []
    years = sorted(by_year.keys(), reverse=True)
    chosen = None
    for y in years:
        if len(by_year[y]) >= 80:
            chosen = y
            break
    if chosen is None:
        chosen = years[0]
    return chosen, by_year[chosen]


def build_explore_snapshot(
    chosen: int,
    rows: list[dict[str, Any]],
    iso3_to_name: dict[str, str],
) -> dict[str, Any]:
    rows_sorted = sorted(rows, key=lambda r: r["value"], reverse=True)
    return {
        "indicator_id": "wb_suicide_mortality_total",
        "year": chosen,
        "rows": [
            {
                "iso3": r["iso3"],
                "name": iso3_to_name.get(r["iso3"], r["iso3"]),
                "value": r["value"],
            }
            for r in rows_sorted
        ],
    }


def write_by_country_shards(series: list[dict[str, Any]]) -> None:
    by_c: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for r in series:
        by_c[r["iso3"]].append(r)
    d = OUT / "by_country"
    d.mkdir(parents=True, exist_ok=True)
    for iso in sorted(by_c.keys()):
        rows = sorted(by_c[iso], key=lambda x: (x["indicator_id"], x["year"]))
        with open(d / f"{iso}.json", "w", encoding="utf-8") as f:
            json.dump(rows, f, indent=2)
            f.write("\n")


def compute_insights(
    series: list[dict[str, Any]], iso3_to_name: dict[str, str]
) -> list[dict[str, Any]]:
    """Single rule-based insight for latest year with sufficient coverage."""
    chosen, rows = pick_suicide_year(series)
    if chosen is None or not rows:
        return []
    top = max(rows, key=lambda r: r["value"])
    url = "https://data.worldbank.org/indicator/SH.STA.SUIC.P5"
    name = iso3_to_name.get(top["iso3"], top["iso3"])
    text = (
        f"In {chosen}, {name} ({top['iso3']}) had the highest value in this dataset build for "
        f"suicide mortality ({top['value']:.1f} per 100,000 per year). "
        "Interpret with registration coverage and WDI caveats."
    )
    return [
        {
            "id": "wb_suicide_high_latest_coverage_year",
            "text": text,
            "indicator_id": "wb_suicide_mortality_total",
            "year": chosen,
            "citations": [url],
        }
    ]


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    INPUT_DIR.mkdir(parents=True, exist_ok=True)

    retrieval = utc_date()
    countries = fetch_wb_countries()
    iso3_to_name, geo = country_geo_records(countries)
    iso3_allowed = set(iso3_to_name.keys())

    series = build_series(iso3_allowed, retrieval)
    sources = build_sources()
    insights = compute_insights(series, iso3_to_name)

    metadata = {
        "schema_version": "1.0",
        "built_at": utc_now(),
        "coverage_note": (
            "Automated build includes World Bank suicide mortality (2000–2024) for non-aggregate "
            "economies. Optional IHME/WHO prevalence rows come from scripts/inputs/manual_prevalence_long.csv when present."
        ),
        "changelog": [
            {
                "at": utc_now(),
                "notes": "Automated rebuild from World Bank API + optional manual CSV.",
            }
        ],
    }

    with open(OUT / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
        f.write("\n")
    with open(OUT / "geo.json", "w", encoding="utf-8") as f:
        json.dump(geo, f, indent=2)
        f.write("\n")
    with open(OUT / "series.json", "w", encoding="utf-8") as f:
        json.dump(series, f, indent=2)
        f.write("\n")
    with open(OUT / "sources.json", "w", encoding="utf-8") as f:
        json.dump(sources, f, indent=2)
        f.write("\n")
    with open(OUT / "insights.json", "w", encoding="utf-8") as f:
        json.dump(insights, f, indent=2)
        f.write("\n")

    chosen, rows_wb = pick_suicide_year(series)
    if chosen is not None and rows_wb:
        snap = build_explore_snapshot(chosen, rows_wb, iso3_to_name)
        with open(OUT / "explore_snapshot.json", "w", encoding="utf-8") as f:
            json.dump(snap, f, indent=2)
            f.write("\n")
    write_by_country_shards(series)

    print(f"Wrote package to {OUT} ({len(series)} series rows, {len(geo)} geographies).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
