#!/usr/bin/env python3
"""Read saved Movy quick audio checks without contacting or changing a device."""
from __future__ import annotations

import argparse
import json
import math
import sys
from pathlib import Path
from typing import Any

COUNTERS: tuple[str, ...] = (
    "services", "activations", "recoveries", "lateChanges", "clears", "rearms",
)
MAP_AUDIO_INDEX_TO_NAME: dict[int, str] = {
    1: "callbacks", 2: "callbacksOverBudget", 4: "peakCallbackWorkUs",
    5: "callbackBudgetUs", 22: "callbackIntervals", 23: "lateIntervals",
    24: "largestIntervalUs", 25: "idleAtLargestIntervalUs",
    26: "workAtLargestIntervalUs", 27: "requestWorkAtLargestIntervalUs",
    29: "shortIntervals", 30: "lateGroups", 31: "largestLateGroup",
    32: "largestLateGroupSpanUs", 33: "largestRequestAtGapUs", 35: "elapsedMs",
}
LIMITATIONS: tuple[str, ...] = (
    "Late callback intervals are timing observations, not audible crackle counts.",
    "PCM checks the internal test tone, not the host or DAC output.",
    "Queue reads bracket the capture but are sequential and not sample-synchronous.",
    "Queue lateness uses beat time; a stalled beat clock can conceal wall-time delay.",
    "Recovery counts do not identify why a live voice was lost.",
    "Independent peaks must not be added or subtracted to infer a cause.",
)


def number(value: Any) -> bool:
    """Accept finite JSON numbers while excluding booleans."""
    try:
        return type(value) in (int, float) and math.isfinite(value)
    except OverflowError:
        return False


def reject_constant(value: str) -> None:
    """Reject nonstandard JSON NaN/Infinity instead of treating them as data."""
    raise ValueError(f"non-finite JSON constant: {value}")


def optional_text(value: Any, field: str) -> str | None:
    """Keep absent text explicit and reject unexpected structured values."""
    if value is not None and not isinstance(value, str):
        raise ValueError(f"{field} must be text or null")
    return value


def snapshots(value: Any) -> dict[int, dict[str, Any]]:
    """Validate named queue evidence, retaining unavailable entries explicitly."""
    if not isinstance(value, list):
        raise ValueError("queue snapshots must be arrays")
    map_track_to_snapshot: dict[int, dict[str, Any]] = {}
    entry: Any
    for entry in value:
        if not isinstance(entry, dict) or type(entry.get("track")) is not int:
            raise ValueError("each queue snapshot requires an integer track")
        track: int = entry["track"]
        if not 1 <= track <= 16 or track in map_track_to_snapshot:
            raise ValueError("queue tracks must be unique and within 1–16")
        optional_text(entry.get("status"), "queue status")
        diagnostics: Any = entry.get("diagnostics")
        if diagnostics is not None:
            if not isinstance(diagnostics, dict):
                raise ValueError("queue diagnostics must be an object or null")
            field: str
            for field in COUNTERS:
                count: Any = diagnostics.get(field)
                if not number(count) or count < 0 or int(count) != count or count > 2**53 - 1:
                    raise ValueError(f"invalid or imprecise queue counter: {field}")
            for field in ("maxLateBeats", "lastDueBeat", "lastActualBeat", "owner"):
                if not number(diagnostics.get(field)):
                    raise ValueError(f"invalid queue diagnostic: {field}")
            if diagnostics["maxLateBeats"] < 0:
                raise ValueError("maxLateBeats cannot be negative")
        map_track_to_snapshot[track] = entry
    return map_track_to_snapshot


def summarize_queue(report: dict[str, Any]) -> dict[str, Any]:
    """Compare one shared-track read only; reject resets and incomplete captures."""
    map_before_track_to_snapshot: dict[int, dict[str, Any]] = snapshots(report.get("queueBefore", []))
    map_after_track_to_snapshot: dict[int, dict[str, Any]] = snapshots(report.get("queueAfter", []))
    tracks: list[int] = sorted(
        track for track in map_before_track_to_snapshot.keys() & map_after_track_to_snapshot.keys()
        if map_before_track_to_snapshot[track].get("diagnostics") is not None
        and map_after_track_to_snapshot[track].get("diagnostics") is not None
    )
    result: dict[str, Any] = {"comparison": "unavailable", "counterChangesAssumingSameLifetime": None,
                              "warnings": ["Shared queue totals are never summed across tracks."]}
    if not tracks:
        result["warnings"].append("No track has supported diagnostics at both endpoints; unknown is not zero.")
        return result
    track: int = tracks[0]
    before: dict[str, Any] = map_before_track_to_snapshot[track]["diagnostics"]
    after: dict[str, Any] = map_after_track_to_snapshot[track]["diagnostics"]
    result.update(track=track, before=before, after=after,
                  statusBefore=map_before_track_to_snapshot[track].get("status", ""),
                  statusAfter=map_after_track_to_snapshot[track].get("status", ""))
    if any(map_before_track_to_snapshot[other]["diagnostics"] != before
           or map_after_track_to_snapshot[other]["diagnostics"] != after for other in tracks[1:]):
        result["warnings"].append("Track reads differ; sequential reads or different module state may explain this. Only the selected track is compared.")
    if before["owner"] != after["owner"]:
        result["warnings"].append("Queue owner changed during the bracketed interval.")
    decreased: list[str] = [field for field in COUNTERS if after[field] < before[field]]
    if after["maxLateBeats"] < before["maxLateBeats"]:
        decreased.append("maxLateBeats")
    if not report.get("complete"):
        result["comparison"] = "incomplete_capture"
    elif decreased:
        result["comparison"] = "counter_reset_or_inconsistent_snapshots"
        result["warnings"].append("Decreased lifetime values: " + ", ".join(decreased))
    else:
        result["comparison"] = "conditional_on_same_module_lifetime"
        result["counterChangesAssumingSameLifetime"] = {field: after[field] - before[field] for field in COUNTERS}
        result["warnings"].append("v1 has no lifetime identifier. A reload can go undetected even when all counters increase.")
    result["warnings"].append("maxLateBeats and lastDueBeat/lastActualBeat are lifetime observations, not capture deltas.")
    return result


def summarize(report: Any) -> dict[str, Any]:
    """Name recorded metrics without inferring unmeasured hardware behavior."""
    if not isinstance(report, dict) or report.get("format") != "movy-audio-check-v1":
        raise ValueError("expected a movy-audio-check-v1 report")
    if type(report.get("complete")) is not bool:
        raise ValueError("complete must be true or false")
    captured_at: str | None = optional_text(report.get("capturedAt"), "capturedAt")
    engine_build: str | None = optional_text(report.get("engineBuild"), "engineBuild")
    captures: Any = report.get("captures")
    if not isinstance(captures, list) or (report["complete"] and len(captures) != 1):
        raise ValueError("a complete quick check must contain exactly one capture")
    summaries: list[dict[str, Any]] = []
    capture: Any
    for capture in captures:
        if not isinstance(capture, dict) or not isinstance(capture.get("audio"), list):
            raise ValueError("each capture requires an audio array")
        audio: list[Any] = capture["audio"]
        if len(audio) not in (29, 36):
            raise ValueError("unsupported audio metric count; expected 29 or 36")
        metrics: dict[str, Any] = {}
        index: int
        name: str
        for index, name in MAP_AUDIO_INDEX_TO_NAME.items():
            value: Any = audio[index] if index < len(audio) else None
            if value is not None and (not number(value) or value < 0 or int(value) != value or value > 2**53 - 1):
                raise ValueError(f"invalid audio metric: {name}")
            metrics[name] = value
        if not number(audio[0]) or audio[0] not in (0, 1):
            raise ValueError("invalid audio profiling state")
        if report["complete"] and (audio[0] != 0 or not metrics["callbacks"]):
            raise ValueError("complete capture must have callbacks and profiling stopped")
        tone: Any = capture.get("tone")
        pcm: str = "unavailable"
        if tone is not None:
            if not isinstance(tone, list) or len(tone) != 5 or any(not number(value) or value < 0 for value in tone):
                raise ValueError("invalid internal tone metrics")
            if tone[0] not in (0, 1, 2) or tone[2] > tone[1]:
                raise ValueError("inconsistent internal tone metrics")
            pcm = "incomplete" if tone[0] != 2 or tone[1] == 0 else "mismatch" if tone[2] else "matched"
        requests: Any = capture.get("requests")
        if requests is not None and (not isinstance(requests, list) or len(requests) != 9
                                     or any(not isinstance(value, str) for value in requests)):
            raise ValueError("request metrics must be a nine-field string array or null")
        summaries.append({"timing": metrics, "internalTone": pcm,
                          "toneMetrics": tone,
                          "requestAtLargestGap": optional_text(capture.get("gapRequest"), "gapRequest"),
                          "requestMetrics": requests})
    return {"format": "movy-audio-check-summary-v1", "complete": report["complete"],
            "capturedAt": captured_at, "engineBuild": engine_build or "unknown",
            "captures": summaries, "queue": summarize_queue(report), "limitations": list(LIMITATIONS)}


def render(summary: dict[str, Any]) -> str:
    """Render a compact readable summary; JSON retains every named value."""
    lines: list[str] = [f"Audio check: {'complete' if summary['complete'] else 'incomplete'}",
                        f"Build: {summary['engineBuild']} (not inferred from counters)",
                        f"Captured at: {summary['capturedAt'] or 'unavailable'}"]
    capture: dict[str, Any]
    for capture in summary["captures"]:
        lines.append("Internal tone: " + capture["internalTone"])
        tone: list[int | float] | None = capture["toneMetrics"]
        if tone is not None:
            lines.append(f"  Checked samples: {tone[1]}; mismatches: {tone[2]}; max error: {tone[3]}")
        name: str
        value: Any
        for name, value in capture["timing"].items():
            lines.append(f"  {name}: {value if value is not None else 'unavailable'}")
        lines.append(f"Request at largest gap: {capture['requestAtLargestGap'] or 'unavailable'}")
    queue: dict[str, Any] = summary["queue"]
    lines.append("Queue comparison: " + queue["comparison"])
    if "track" in queue:
        lines.append(f"Read through track {queue['track']} only; shared totals are not added.")
        lines.append(f"Lifetime maxLateBeats: {queue['before']['maxLateBeats']} -> {queue['after']['maxLateBeats']}")
    changes: Any = queue["counterChangesAssumingSameLifetime"]
    if changes is not None:
        lines.append("Counter changes, assuming the same loaded module lifetime:")
        lines.extend(f"  {name}: {value}" for name, value in changes.items())
    lines.extend("Note: " + note for note in queue["warnings"] + summary["limitations"])
    return "\n".join(lines)


def main() -> int:
    """Read one local file and write a summary to stdout; never modify the input."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--json", action="store_true", help="emit structured JSON")
    arguments: argparse.Namespace = parser.parse_args()
    try:
        report: Any = json.loads(arguments.report.read_text(encoding="utf-8"), parse_constant=reject_constant)
        summary: dict[str, Any] = summarize(report)
        output: str = json.dumps(summary, indent=2, allow_nan=False) if arguments.json else render(summary)
    except (OSError, UnicodeError, ValueError) as error:
        print(f"Cannot analyze capture: {error}", file=sys.stderr)
        return 2
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
