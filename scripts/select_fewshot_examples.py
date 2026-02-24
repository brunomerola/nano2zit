#!/usr/bin/env python3
"""Build a compact and structurally diverse few-shot set from prompts.csv."""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

BANNED_TERMS = [
    r"\b8k\b",
    r"\buhd\b",
    r"\bmasterpiece\b",
    r"\bbest\s+quality\b",
    r"\boctane\s+render\b",
    r"\bray[-\s]?traced\b",
]

DEFAULT_FORCE_KEYS = [
    "image_generation_prompt",
    "image_description",
    "prompt",
]


@dataclass
class RowSample:
    prompt_id: str
    tweet_id: str
    prompt_json: str
    prompt_zit: str
    parsed_json: dict[str, Any]
    signature: tuple[str, ...]


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def has_banned_term(text: str) -> bool:
    low = text.lower()
    return any(re.search(pattern, low) for pattern in BANNED_TERMS)


def sanitize_output(text: str, max_words: int = 120) -> str:
    cleaned = normalize_ws(text)
    for pattern in BANNED_TERMS:
        cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
    cleaned = normalize_ws(cleaned)
    words = cleaned.split()
    if len(words) > max_words:
        cleaned = " ".join(words[:max_words]).rstrip(" ,.;:") + "."
    return cleaned


def truncate_text(text: str, max_words: int = 22) -> str:
    text = normalize_ws(text)
    words = text.split()
    if len(words) <= max_words:
        return text
    return " ".join(words[:max_words]).rstrip(" ,.;:") + "..."


def compact_json(value: Any, depth: int = 0, max_depth: int = 4) -> Any:
    if depth >= max_depth:
        if isinstance(value, str):
            return truncate_text(value, 16)
        if isinstance(value, list):
            return [truncate_text(str(value[0]), 12)] if value else []
        if isinstance(value, dict):
            return {k: "..." for k in list(value.keys())[:2]}
        return value

    if isinstance(value, str):
        return truncate_text(value, 22)

    if isinstance(value, list):
        items = value[:2]
        return [compact_json(item, depth + 1, max_depth) for item in items]

    if isinstance(value, dict):
        # Keep deterministic key order while trimming excessive breadth.
        keys = list(value.keys())[:10]
        return {k: compact_json(value[k], depth + 1, max_depth) for k in keys}

    return value


def load_rows(csv_path: Path) -> list[RowSample]:
    rows: list[RowSample] = []
    with csv_path.open(newline="", encoding="latin-1") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_json = (row.get("prompt_json") or "").strip()
            raw_zit = (row.get("prompt_zit") or "").strip()
            if not raw_json or not raw_zit:
                continue
            try:
                parsed = json.loads(raw_json)
            except json.JSONDecodeError:
                continue
            if not isinstance(parsed, dict):
                continue
            signature = tuple(sorted(parsed.keys()))
            rows.append(
                RowSample(
                    prompt_id=str(row.get("prompt_id") or ""),
                    tweet_id=str(row.get("tweet_id") or ""),
                    prompt_json=raw_json,
                    prompt_zit=raw_zit,
                    parsed_json=parsed,
                    signature=signature,
                )
            )
    return rows


def select_samples(rows: list[RowSample], max_examples: int) -> list[RowSample]:
    filtered = [r for r in rows if not has_banned_term(r.prompt_zit)]
    filtered.sort(key=lambda r: len(r.prompt_json))

    selected: list[RowSample] = []
    used_signatures: set[tuple[str, ...]] = set()

    # Force include important schema families if available.
    for force_key in DEFAULT_FORCE_KEYS:
        for row in filtered:
            if force_key not in row.parsed_json:
                continue
            if row.signature in used_signatures:
                continue
            selected.append(row)
            used_signatures.add(row.signature)
            break

    # Fill with shortest remaining structurally unique examples.
    for row in filtered:
        if len(selected) >= max_examples:
            break
        if row.signature in used_signatures:
            continue
        selected.append(row)
        used_signatures.add(row.signature)

    return selected[:max_examples]


def to_record(row: RowSample) -> dict[str, Any]:
    compact = compact_json(row.parsed_json)
    compact_str = json.dumps(compact, ensure_ascii=False, separators=(",", ":"))
    output_excerpt = sanitize_output(row.prompt_zit)
    return {
        "source_prompt_id": row.prompt_id,
        "source_tweet_id": row.tweet_id,
        "signature": list(row.signature),
        "input_json_excerpt": compact_str,
        "sfw_output_excerpt": output_excerpt,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default="prompts.csv", help="Input prompts CSV path")
    parser.add_argument(
        "--output",
        default="config/fewshot-examples.json",
        help="Output JSON path",
    )
    parser.add_argument("--max-examples", type=int, default=4)
    args = parser.parse_args()

    csv_path = Path(args.csv)
    out_path = Path(args.output)

    rows = load_rows(csv_path)
    selected = select_samples(rows, args.max_examples)

    payload = {
        "source": str(csv_path),
        "total_rows": len(rows),
        "selected_examples": len(selected),
        "selection_note": "Shortest structurally unique rows, filtered to avoid quality-tag style leakage.",
        "examples": [to_record(r) for r in selected],
    }

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out_path} with {len(selected)} examples")


if __name__ == "__main__":
    main()
