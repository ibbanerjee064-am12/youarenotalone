/**
 * Fetch World Bank WDI suicide indicators + optional manual CSV; emit site/public/data/*.json
 * (Node 18+; no Python required.)
 */

import { mkdirSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "site", "public", "data");
const INPUT_DIR = join(ROOT, "scripts", "inputs");
const MANUAL_CSV = join(INPUT_DIR, "manual_prevalence_long.csv");

const WB_BASE = "https://api.worldbank.org/v2";

const WB_SUICIDE = [
  ["wb_suicide_mortality_total", "SH.STA.SUIC.P5"],
  ["wb_suicide_mortality_female", "SH.STA.SUIC.FE.P5"],
  ["wb_suicide_mortality_male", "SH.STA.SUIC.MA.P5"],
];

const WB_LIMITATIONS =
  "World Bank WDI compilation; underlying vital registration quality varies by country. " +
  "Not directly comparable to survey-based psychological distress.";

const MANUAL_INDICATORS = new Set([
  "ihme_depressive_disorders_prevalence",
  "ihme_anxiety_disorders_prevalence",
  "ihme_self_harm_non_fatal_prevalence",
]);

function utcNow() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function utcDate() {
  return new Date().toISOString().slice(0, 10);
}

async function fetchJson(url) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function fetchAllCountries() {
  const rows = [];
  let page = 1;
  while (true) {
    const url = `${WB_BASE}/country?format=json&per_page=500&page=${page}`;
    const body = await fetchJson(url);
    const chunk = body[1];
    if (!chunk?.length) break;
    rows.push(...chunk);
    const pages = Number(body[0]?.pages ?? page);
    if (page >= pages) break;
    page += 1;
  }
  return rows;
}

function countryGeoRecords(countries) {
  const iso3ToName = new Map();
  const geo = [];
  for (const c of countries) {
    if (c.region?.value === "Aggregates") continue;
    const iso3 = c.id;
    if (!iso3 || iso3.length !== 3) continue;
    iso3ToName.set(iso3, c.name ?? "");
    geo.push({
      iso3,
      name: c.name ?? "",
      region: c.region?.value ?? "",
      income_level: c.incomeLevel?.value ?? "",
    });
  }
  geo.sort((a, b) => a.name.localeCompare(b.name));
  return { iso3ToName, geo };
}

async function fetchIndicatorPages(wbId) {
  const out = [];
  let page = 1;
  while (true) {
    const url = new URL(`${WB_BASE}/country/all/indicator/${wbId}`);
    url.searchParams.set("format", "json");
    url.searchParams.set("date", "2000:2024");
    url.searchParams.set("per_page", "20000");
    url.searchParams.set("page", String(page));
    const body = await fetchJson(url.toString());
    const chunk = body[1];
    if (!chunk?.length) break;
    out.push(...chunk);
    const pages = Number(body[0]?.pages ?? page);
    if (page >= pages) break;
    page += 1;
  }
  return out;
}

/** Minimal RFC-style CSV parser (quoted fields); no external deps. */
function parseManualCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    if (cols.length !== header.length) continue;
    const row = {};
    header.forEach((h, j) => {
      row[h] = (cols[j] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function loadManualRows() {
  if (!existsSync(MANUAL_CSV)) return [];
  const raw = readFileSync(MANUAL_CSV, "utf8");
  if (!raw.trim()) return [];
  return parseManualCsv(raw);
}

function buildSources() {
  return [
    {
      indicator_id: "wb_suicide_mortality_total",
      label: "Suicide mortality (all)",
      definition:
        "Suicide mortality rate (per 100,000 population per year), both sexes.",
      method_summary: "WDI; compiled from WHO and other inputs per World Bank metadata.",
      tier: "A",
      primary_source_name: "World Bank World Development Indicators",
      primary_source_url: "https://data.worldbank.org/indicator/SH.STA.SUIC.P5",
      license_note: "World Bank data license — attribute the World Bank.",
      automation: "automated",
    },
    {
      indicator_id: "wb_suicide_mortality_female",
      label: "Suicide mortality (female)",
      definition: "Female suicide mortality rate (per 100,000 female population per year).",
      method_summary: "WDI; see indicator metadata.",
      tier: "A",
      primary_source_name: "World Bank World Development Indicators",
      primary_source_url: "https://data.worldbank.org/indicator/SH.STA.SUIC.FE.P5",
      license_note: "World Bank data license — attribute the World Bank.",
      automation: "automated",
    },
    {
      indicator_id: "wb_suicide_mortality_male",
      label: "Suicide mortality (male)",
      definition: "Male suicide mortality rate (per 100,000 male population per year).",
      method_summary: "WDI; see indicator metadata.",
      tier: "A",
      primary_source_name: "World Bank World Development Indicators",
      primary_source_url: "https://data.worldbank.org/indicator/SH.STA.SUIC.MA.P5",
      license_note: "World Bank data license — attribute the World Bank.",
      automation: "automated",
    },
    {
      indicator_id: "ihme_depressive_disorders_prevalence",
      label: "Depressive disorders prevalence",
      definition:
        "Population prevalence of depressive disorders (exact age standardization per your export).",
      method_summary: "IHME GBD modeled prevalence; import via manual CSV.",
      tier: "A",
      primary_source_name: "IHME Global Burden of Disease",
      primary_source_url: "https://www.healthdata.org/gbd",
      license_note: "Follow IHME Data Use Agreement for the export you merge.",
      automation: "manual_file",
    },
    {
      indicator_id: "ihme_anxiety_disorders_prevalence",
      label: "Anxiety disorders prevalence",
      definition: "Population prevalence of anxiety disorders per merged export.",
      method_summary: "IHME GBD modeled prevalence; import via manual CSV.",
      tier: "A",
      primary_source_name: "IHME Global Burden of Disease",
      primary_source_url: "https://www.healthdata.org/gbd",
      license_note: "Follow IHME Data Use Agreement for the export you merge.",
      automation: "manual_file",
    },
    {
      indicator_id: "ihme_self_harm_non_fatal_prevalence",
      label: "Non-fatal self-harm prevalence",
      definition:
        "Non-fatal self-harm cases or prevalence per merged export definition.",
      method_summary: "IHME GBD; import via manual CSV with explicit unit and age band.",
      tier: "A",
      primary_source_name: "IHME Global Burden of Disease",
      primary_source_url: "https://www.healthdata.org/gbd",
      license_note: "Follow IHME Data Use Agreement for the export you merge.",
      automation: "manual_file",
    },
  ];
}

function pickSuicideYear(series) {
  const ind = "wb_suicide_mortality_total";
  const byYear = new Map();
  for (const s of series) {
    if (s.indicator_id !== ind) continue;
    if (!byYear.has(s.year)) byYear.set(s.year, []);
    byYear.get(s.year).push(s);
  }
  if (!byYear.size) return { chosen: null, rows: [] };
  const years = [...byYear.keys()].sort((a, b) => b - a);
  const chosen = years.find((y) => byYear.get(y).length >= 80) ?? years[0];
  return { chosen, rows: byYear.get(chosen) };
}

function computeInsights(series, iso3ToName) {
  const ind = "wb_suicide_mortality_total";
  const { chosen, rows } = pickSuicideYear(series);
  if (!chosen || !rows.length) return [];
  const top = rows.reduce((a, b) => (a.value >= b.value ? a : b));
  const url = "https://data.worldbank.org/indicator/SH.STA.SUIC.P5";
  const name = iso3ToName.get(top.iso3) ?? top.iso3;
  return [
    {
      id: "wb_suicide_high_latest_coverage_year",
      text:
        `In ${chosen}, ${name} (${top.iso3}) had the highest value in this dataset build for ` +
        `suicide mortality (${top.value.toFixed(1)} per 100,000 per year). ` +
        "Interpret with registration coverage and WDI caveats.",
      indicator_id: ind,
      year: chosen,
      citations: [url],
    },
  ];
}

function buildExploreSnapshot(series, iso3ToName) {
  const ind = "wb_suicide_mortality_total";
  const { chosen, rows } = pickSuicideYear(series);
  if (!chosen) return null;
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  return {
    indicator_id: ind,
    year: chosen,
    rows: sorted.map((r) => ({
      iso3: r.iso3,
      name: iso3ToName.get(r.iso3) ?? r.iso3,
      value: r.value,
    })),
  };
}

function writeByCountryShards(series) {
  const dir = join(OUT, "by_country");
  mkdirSync(dir, { recursive: true });
  const byC = new Map();
  for (const r of series) {
    if (!byC.has(r.iso3)) byC.set(r.iso3, []);
    byC.get(r.iso3).push(r);
  }
  for (const [iso, rows] of byC) {
    rows.sort((a, b) => {
      if (a.indicator_id !== b.indicator_id) return a.indicator_id.localeCompare(b.indicator_id);
      return a.year - b.year;
    });
    writeFileSync(join(dir, `${iso}.json`), JSON.stringify(rows, null, 2) + "\n", "utf8");
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  mkdirSync(INPUT_DIR, { recursive: true });

  const retrieval = utcDate();
  const countries = await fetchAllCountries();
  const { iso3ToName, geo } = countryGeoRecords(countries);
  const iso3Allowed = new Set(iso3ToName.keys());

  const series = [];

  for (const [indId, wbId] of WB_SUICIDE) {
    const sourceUrl = `https://data.worldbank.org/indicator/${wbId}`;
    const rows = await fetchIndicatorPages(wbId);
    for (const row of rows) {
      const iso3 = row.countryiso3code ?? "";
      if (!iso3Allowed.has(iso3)) continue;
      if (row.value === null || row.value === "") continue;
      const year = Number(row.date);
      const value = Number(row.value);
      if (!Number.isFinite(year) || !Number.isFinite(value)) continue;
      series.push({
        indicator_id: indId,
        iso3,
        year,
        value,
        tier: "A",
        unit: "per 100,000 population per year",
        source_url: sourceUrl,
        retrieval_date: retrieval,
        limitations: WB_LIMITATIONS,
      });
    }
  }

  for (const row of loadManualRows()) {
    const ind = (row.indicator_id ?? "").trim();
    if (!MANUAL_INDICATORS.has(ind)) {
      console.warn(`Skipping unknown manual indicator_id: ${ind}`);
      continue;
    }
    const iso3 = (row.iso3 ?? "").trim().toUpperCase();
    if (!iso3Allowed.has(iso3)) {
      console.warn(`Skipping manual row: unknown iso3 ${iso3}`);
      continue;
    }
    const year = Number(row.year);
    const value = Number(row.value);
    if (!Number.isFinite(year) || !Number.isFinite(value)) {
      console.warn(`Skipping malformed manual row`, row);
      continue;
    }
    const unit = (row.unit ?? "% of population").trim();
    const lim =
      (row.limitations ?? "").trim() ||
      "Manually merged from IHME/WHO export; confirm measure (age-standardized vs crude) in source.";
    const src = (row.source_url ?? "").trim();
    if (!src) {
      console.warn(`Skipping manual row without source_url`, row);
      continue;
    }
    series.push({
      indicator_id: ind,
      iso3,
      year,
      value,
      tier: "A",
      unit,
      source_url: src,
      retrieval_date: retrieval,
      limitations: lim,
    });
  }

  series.sort((a, b) => {
    if (a.indicator_id !== b.indicator_id) return a.indicator_id.localeCompare(b.indicator_id);
    if (a.iso3 !== b.iso3) return a.iso3.localeCompare(b.iso3);
    return a.year - b.year;
  });

  const sources = buildSources();
  const insights = computeInsights(series, iso3ToName);

  const metadata = {
    schema_version: "1.0",
    built_at: utcNow(),
    coverage_note:
      "Automated build includes World Bank suicide mortality (2000–2024) for non-aggregate " +
      "economies. Optional IHME/WHO prevalence rows come from scripts/inputs/manual_prevalence_long.csv when present.",
    changelog: [
      {
        at: utcNow(),
        notes: "Automated rebuild from World Bank API + optional manual CSV (Node build).",
      },
    ],
  };

  writeFileSync(join(OUT, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n", "utf8");
  writeFileSync(join(OUT, "geo.json"), JSON.stringify(geo, null, 2) + "\n", "utf8");
  writeFileSync(join(OUT, "series.json"), JSON.stringify(series, null, 2) + "\n", "utf8");
  writeFileSync(join(OUT, "sources.json"), JSON.stringify(sources, null, 2) + "\n", "utf8");
  writeFileSync(join(OUT, "insights.json"), JSON.stringify(insights, null, 2) + "\n", "utf8");

  const snap = buildExploreSnapshot(series, iso3ToName);
  if (snap) {
    writeFileSync(join(OUT, "explore_snapshot.json"), JSON.stringify(snap, null, 2) + "\n", "utf8");
  }
  writeByCountryShards(series);

  console.log(`Wrote package to ${OUT} (${series.length} series rows, ${geo.length} geographies).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
