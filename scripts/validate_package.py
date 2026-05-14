"""
Validate generated JSON under site/public/data/ against local JSON Schemas.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import jsonschema

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "site" / "public" / "data"
SCHEMAS = ROOT / "schemas"


def load_schema(name: str) -> dict:
    with open(SCHEMAS / name, encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    meta_schema = load_schema("metadata.schema.json")
    geo_schema = load_schema("geo.schema.json")
    series_schema = load_schema("series.schema.json")
    sources_schema = load_schema("sources.schema.json")
    insights_schema = load_schema("insights.schema.json")

    for rel in ("metadata.json", "geo.json", "series.json", "sources.json"):
        p = DATA / rel
        if not p.exists():
            print(f"Missing: {p}", file=sys.stderr)
            return 1

    with open(DATA / "metadata.json", encoding="utf-8") as f:
        jsonschema.validate(json.load(f), meta_schema)
    with open(DATA / "geo.json", encoding="utf-8") as f:
        jsonschema.validate(json.load(f), geo_schema)
    with open(DATA / "series.json", encoding="utf-8") as f:
        jsonschema.validate(json.load(f), series_schema)
    with open(DATA / "sources.json", encoding="utf-8") as f:
        jsonschema.validate(json.load(f), sources_schema)

    ins = DATA / "insights.json"
    if ins.exists():
        with open(ins, encoding="utf-8") as f:
            jsonschema.validate(json.load(f), insights_schema)

    print("OK: all present packages validate against schemas.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
