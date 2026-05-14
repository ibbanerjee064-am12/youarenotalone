/**
 * Validate site/public/data/*.json (structural checks aligned with schemas/).
 * Zero dependencies — runs with Node 18+ only.
 */

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DATA = join(ROOT, "site", "public", "data");

function load(p) {
  return JSON.parse(readFileSync(p, "utf8"));
}

function must(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isIso3(s) {
  return typeof s === "string" && /^[A-Z]{3}$/.test(s);
}

function isUri(s) {
  return typeof s === "string" && /^https?:\/\//.test(s);
}

function validateMetadata(m) {
  must(m && typeof m === "object", "metadata must be object");
  must(/^1\./.test(m.schema_version), "metadata.schema_version must match ^1.");
  must(typeof m.built_at === "string" && m.built_at.includes("T"), "metadata.built_at");
  must(typeof m.coverage_note === "string" && m.coverage_note.length, "metadata.coverage_note");
  must(Array.isArray(m.changelog), "metadata.changelog array");
  for (const e of m.changelog) {
    must(e && typeof e.at === "string", "changelog entry .at");
    must(typeof e.notes === "string", "changelog entry .notes");
  }
}

function validateGeo(g) {
  must(Array.isArray(g), "geo must be array");
  for (const row of g) {
    must(isIso3(row.iso3), `geo bad iso3: ${row.iso3}`);
    must(typeof row.name === "string" && row.name.length, "geo.name");
    must(typeof row.region === "string", "geo.region");
  }
}

function validateSeries(s) {
  must(Array.isArray(s), "series must be array");
  must(s.length > 0, "series must be non-empty for v1 site");
  for (const row of s) {
    must(typeof row.indicator_id === "string" && /^[a-z0-9_]+$/.test(row.indicator_id), "series.indicator_id");
    must(isIso3(row.iso3), `series bad iso3 ${row.iso3}`);
    must(Number.isInteger(row.year) && row.year >= 1960 && row.year <= 2100, "series.year");
    must(typeof row.value === "number" && Number.isFinite(row.value), "series.value");
    must(row.tier === "A" || row.tier === "B", "series.tier");
    must(typeof row.unit === "string" && row.unit.length, "series.unit");
    must(isUri(row.source_url), "series.source_url");
    must(/^\d{4}-\d{2}-\d{2}$/.test(row.retrieval_date), "series.retrieval_date");
    must(typeof row.limitations === "string", "series.limitations");
  }
}

function validateSources(src) {
  must(Array.isArray(src), "sources must be array");
  must(src.length > 0, "sources non-empty");
  for (const row of src) {
    must(typeof row.indicator_id === "string", "sources.indicator_id");
    must(typeof row.label === "string", "sources.label");
    must(typeof row.definition === "string", "sources.definition");
    must(typeof row.method_summary === "string", "sources.method_summary");
    must(row.tier === "A" || row.tier === "B", "sources.tier");
    must(typeof row.primary_source_name === "string", "sources.primary_source_name");
    must(isUri(row.primary_source_url), "sources.primary_source_url");
    must(typeof row.license_note === "string", "sources.license_note");
    must(["automated", "manual_file", "planned"].includes(row.automation), "sources.automation");
  }
}

function validateInsights(ins) {
  must(Array.isArray(ins), "insights must be array");
  for (const row of ins) {
    must(typeof row.id === "string", "insights.id");
    must(typeof row.text === "string" && row.text.length, "insights.text");
    must(typeof row.indicator_id === "string", "insights.indicator_id");
    must(Number.isInteger(row.year), "insights.year");
    must(Array.isArray(row.citations) && row.citations.length && row.citations.every(isUri), "insights.citations");
  }
}

function main() {
  const metaPath = join(DATA, "metadata.json");
  const geoPath = join(DATA, "geo.json");
  const seriesPath = join(DATA, "series.json");
  const sourcesPath = join(DATA, "sources.json");
  for (const p of [metaPath, geoPath, seriesPath, sourcesPath]) {
    must(existsSync(p), `Missing ${p}`);
  }
  validateMetadata(load(metaPath));
  validateGeo(load(geoPath));
  validateSeries(load(seriesPath));
  validateSources(load(sourcesPath));
  const insPath = join(DATA, "insights.json");
  if (existsSync(insPath)) {
    validateInsights(load(insPath));
  }
  console.log("OK: structural validation passed.");
}

main();
