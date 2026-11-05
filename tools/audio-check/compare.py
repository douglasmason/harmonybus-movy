"""Compare validated quick-check observations without scoring audible quality."""
from __future__ import annotations

from typing import Any


def timing(map_summary: dict[str, Any]) -> dict[str, Any]:
    """Use metrics only from a completed single capture."""
    return map_summary["captures"][0]["timing"] if map_summary["complete"] and len(map_summary["captures"]) == 1 else {}


def rate(numerator: int | float | None, denominator: int | float | None, scale: float) -> float | None:
    """Keep a missing or zero exposure unavailable, including for zero events."""
    return scale * numerator / denominator if numerator is not None and denominator is not None and denominator > 0 else None


def observations(map_summary: dict[str, Any]) -> dict[str, tuple[Any, Any]]:
    """Retain both endpoints; their equality does not prove constant workload."""
    map_before: dict[str, Any] = map_summary["setupBefore"] or {}
    map_after: dict[str, Any] = map_summary["setupAfter"] or {}
    map_field_to_endpoints: dict[str, tuple[Any, Any]] = {
        field: (map_before.get(field), map_after.get(field)) for field in sorted(map_before.keys() | map_after.keys())
    }
    map_field_to_endpoints["harmonyBusVersion"] = (
        map_summary["queue"].get("moduleVersionBefore"), map_summary["queue"].get("moduleVersionAfter"))
    return map_field_to_endpoints


def compare(map_baseline: dict[str, Any], map_experiment: dict[str, Any]) -> dict[str, Any]:
    """Show exposure-normalized rates, separate peaks and observed setup differences."""
    map_baseline_timing: dict[str, Any] = timing(map_baseline)
    map_experiment_timing: dict[str, Any] = timing(map_experiment)
    metrics: list[dict[str, Any]] = []
    numerator: str
    denominator: str
    label: str
    unit: str
    scale: float
    for numerator, denominator, label, unit, scale in (
        ("lateIntervals", "callbackIntervals", "Late callback intervals", "% of intervals", 100.0),
        ("shortIntervals", "callbackIntervals", "Short callback intervals", "% of intervals", 100.0),
        ("callbacksOverBudget", "callbacks", "Callbacks over budget", "% of callbacks", 100.0),
        ("lateGroups", "elapsedMs", "Late interval groups", "per minute", 60000.0),
    ):
        baseline_rate: float | None = rate(map_baseline_timing.get(numerator), map_baseline_timing.get(denominator), scale)
        experiment_rate: float | None = rate(map_experiment_timing.get(numerator), map_experiment_timing.get(denominator), scale)
        metrics.append({"name": label, "unit": unit, "baseline": baseline_rate, "experiment": experiment_rate,
                        "change": experiment_rate - baseline_rate if baseline_rate is not None and experiment_rate is not None else None})
    field: str
    for field, label in (("largestIntervalUs", "Largest callback interval"), ("peakCallbackWorkUs", "Peak callback work")):
        metrics.append({"name": label, "unit": "microseconds; independent peaks", "baseline": map_baseline_timing.get(field),
                        "experiment": map_experiment_timing.get(field), "change": None})
    map_baseline_changes: dict[str, Any] = map_baseline["queue"]["counterChangesAssumingSameLifetime"] or {}
    map_experiment_changes: dict[str, Any] = map_experiment["queue"]["counterChangesAssumingSameLifetime"] or {}
    for field in ("activations", "recoveries", "lateChanges", "clears", "rearms"):
        # These reads bracket the audio window and have no measured duration of
        # their own. Do not divide their counts by the narrower engine timer.
        metrics.append({"name": "Queue " + field, "unit": "bracketed count; conditional on each capture's module lifetime",
                        "baseline": map_baseline_changes.get(field),
                        "experiment": map_experiment_changes.get(field),
                        "change": None})
    map_baseline_context: dict[str, tuple[Any, Any]] = observations(map_baseline)
    map_experiment_context: dict[str, tuple[Any, Any]] = observations(map_experiment)
    context: list[dict[str, Any]] = []
    warnings: list[str] = []
    for field in sorted(map_baseline_context.keys() | map_experiment_context.keys()):
        baseline_endpoints: tuple[Any, Any] = map_baseline_context.get(field, (None, None))
        experiment_endpoints: tuple[Any, Any] = map_experiment_context.get(field, (None, None))
        state: str
        if any(value is None for value in baseline_endpoints + experiment_endpoints):
            state = "unavailable"
        elif baseline_endpoints[0] != baseline_endpoints[1] or experiment_endpoints[0] != experiment_endpoints[1]:
            state = "changed_within_capture"
        elif baseline_endpoints != experiment_endpoints:
            state = "different"
        else:
            state = "same_observed_endpoints"
        context.append({"field": field, "baseline": baseline_endpoints, "experiment": experiment_endpoints, "status": state})
        if state != "same_observed_endpoints":
            warnings.append(f"{field}: {state}")
    if map_baseline["engineBuild"] != map_experiment["engineBuild"]:
        warnings.append("Reported engine builds differ.")
    if not map_baseline["setupBefore"] or not map_experiment["setupBefore"]:
        warnings.append("Setup context is missing; older reports remain readable but cannot establish matching workloads.")
    if map_baseline_timing.get("callbackBudgetUs") != map_experiment_timing.get("callbackBudgetUs"):
        warnings.append("Callback budgets differ; timing exposures are not identical.")
    if not map_baseline["complete"] or not map_experiment["complete"]:
        warnings.append("An incomplete capture has no comparable timing rates.")
    warnings.extend([
        "Changes are experiment minus baseline; percentage changes are percentage points, not relative percentages.",
        "Timing counts are normalized by recorded exposure; no ratio is invented for a zero baseline.",
        "Queue differences are calculated only within each capture, conditionally on that capture's module lifetime; never across files.",
        "Queue snapshot duration is unmeasured; bracketed counts are not normalized by the engine's narrower timing window.",
        "A successful handoff intentionally clears the live queue; a clear alone does not establish a fault.",
        "No score, audible-crackle count, causal conclusion or claim of a fix is inferred.",
    ])
    return {"format": "movy-audio-check-comparison-v1", "baseline": map_baseline, "experiment": map_experiment,
            "metrics": metrics, "setupComparison": context, "warnings": warnings,
            "limitations": map_baseline["limitations"]}


def render_comparison(map_comparison: dict[str, Any]) -> str:
    """Render both conditions and units, keeping unknown values visibly distinct."""
    def display(value: Any) -> str:
        """Format a measured value without substituting zero for missing evidence."""
        return "unavailable" if value is None else f"{value:.6g}" if isinstance(value, (int, float)) else str(value)

    lines: list[str] = ["Audio comparison: baseline -> experiment (observations only)"]
    warnings: list[str] = []
    role: str
    for role in ("baseline", "experiment"):
        map_summary: dict[str, Any] = map_comparison[role]
        lines.append(f"{role}: build={map_summary['engineBuild']}; captured={map_summary['capturedAt'] or 'unavailable'}; complete={map_summary['complete']}")
        lines.append(f"  Queue comparison: {map_summary['queue']['comparison']}")
        map_timing: dict[str, Any] = timing(map_summary)
        lines.append("  Timing exposure: " + "; ".join(f"{field}={display(map_timing.get(field))}"
                     for field in ("elapsedMs", "callbacks", "callbackIntervals", "callbackBudgetUs")))
        map_capture: dict[str, Any]
        for map_capture in map_summary["captures"]:
            lines.append(f"  Internal tone: {map_capture['internalTone']}; request at largest gap: {map_capture['requestAtLargestGap'] or 'unavailable'}")
        warnings.extend(map_summary["queue"]["warnings"])
    map_metric: dict[str, Any]
    for map_metric in map_comparison["metrics"]:
        change: str = f"; change {display(map_metric['change'])}" if map_metric["change"] is not None else ""
        lines.append(f"{map_metric['name']} ({map_metric['unit']}): {display(map_metric['baseline'])} -> {display(map_metric['experiment'])}{change}")
    map_context: dict[str, Any]
    matching_fields: list[str] = []
    for map_context in map_comparison["setupComparison"]:
        if map_context["status"] == "same_observed_endpoints":
            matching_fields.append(map_context["field"])
        else:
            lines.append(f"Setup {map_context['field']}: {map_context['baseline']} -> {map_context['experiment']} ({map_context['status']})")
    if matching_fields:
        lines.append("Matching recorded endpoints: " + ", ".join(matching_fields))
    warnings.extend(map_comparison["warnings"] + map_comparison["limitations"])
    lines.extend("Note: " + warning for warning in dict.fromkeys(warnings))
    return "\n".join(lines)
