"""Regression evidence for comparing separate, potentially incompatible captures."""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from analyze import summarize
from compare import compare, render_comparison
from test_analyze import READER, synthetic_report


def contextual_report() -> dict[str, Any]:
    """Supply explicit synthetic endpoint evidence, not inferred device state."""
    map_report: dict[str, Any] = synthetic_report()
    map_setup: dict[str, Any] = {
        "engineBuild": "synthetic-build", "setUuid": "synthetic-set", "bpmX100": 12000,
        "activeTrack": 4, "keyboardMode": 1, "keyboardLayout": 3,
        "launchpadMode": 0, "launchpadActive": False, "trackHosting": 1,
        "setTrackHosting": 1, "nativeMicrophoneAvailable": True, "nativeMicrophoneListening": False,
    }
    map_report.update(engineBuild="synthetic-build", setupBefore=copy.deepcopy(map_setup), setupAfter=copy.deepcopy(map_setup))
    endpoint: str
    map_snapshot: dict[str, Any]
    for endpoint in ("queueBefore", "queueAfter"):
        for map_snapshot in map_report[endpoint]:
            map_snapshot["moduleVersion"] = "synthetic-HB"
    return map_report


class ComparisonTests(unittest.TestCase):
    """Test interpretation with unequal durations, missing data and reload evidence."""

    def test_equal_rates_with_different_exposure_are_not_a_regression(self) -> None:
        """Twice the events in twice the observation window retains the rate."""
        map_baseline: dict[str, Any] = contextual_report()
        map_experiment: dict[str, Any] = contextual_report()
        index: int
        for index in (1, 2, 22, 23, 29, 30, 35):
            map_experiment["captures"][0]["audio"][index] *= 2
        map_result: dict[str, Any] = compare(summarize(map_baseline), summarize(map_experiment))
        map_metric: dict[str, Any]
        for map_metric in map_result["metrics"][:4]:
            self.assertEqual(map_metric["change"], 0)
            self.assertEqual(map_metric["baseline"], map_metric["experiment"])
        self.assertAlmostEqual(map_result["metrics"][0]["baseline"], 700 / 11999)

    def test_zero_baseline_has_percentage_point_change_without_ratio(self) -> None:
        """A baseline with zero late events is a valid zero, not infinite growth."""
        map_baseline: dict[str, Any] = contextual_report()
        map_baseline["captures"][0]["audio"][23] = 0
        map_result: dict[str, Any] = compare(summarize(map_baseline), summarize(contextual_report()))
        map_metric: dict[str, Any] = map_result["metrics"][0]
        self.assertEqual(map_metric["baseline"], 0)
        self.assertAlmostEqual(map_metric["change"], 700 / 11999)
        self.assertIn("percentage points", render_comparison(map_result))

    def test_missing_or_zero_denominator_is_not_zero_rate(self) -> None:
        """Old layouts and empty interval exposure cannot imply clean timing."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["captures"][0]["audio"] = map_report["captures"][0]["audio"][:29]
        map_report["captures"][0]["audio"][22:24] = [0, 0]
        map_result: dict[str, Any] = compare(summarize(map_report), summarize(contextual_report()))
        self.assertIsNone(map_result["metrics"][0]["baseline"])
        self.assertIsNone(map_result["metrics"][0]["change"])
        self.assertIsNone(map_result["metrics"][3]["baseline"])
        self.assertTrue(all(metric["baseline"] is None for metric in map_result["metrics"][6:]))

    def test_peaks_and_cross_file_queue_totals_are_never_subtracted(self) -> None:
        """Different lifetimes can have identical within-capture queue changes."""
        map_experiment: dict[str, Any] = contextual_report()
        map_experiment["captures"][0]["audio"][24] = 18000
        endpoint: str
        map_snapshot: dict[str, Any]
        for endpoint in ("queueBefore", "queueAfter"):
            for map_snapshot in map_experiment[endpoint]:
                map_snapshot["diagnostics"]["activations"] += 10000
        map_result: dict[str, Any] = compare(summarize(contextual_report()), summarize(map_experiment))
        self.assertEqual(map_result["metrics"][4]["experiment"], 18000)
        self.assertIsNone(map_result["metrics"][4]["change"])
        self.assertEqual(map_result["metrics"][6]["baseline"], map_result["metrics"][6]["experiment"])
        self.assertIsNone(map_result["metrics"][6]["change"])
        self.assertIn("never across files", render_comparison(map_result))

    def test_changed_module_version_disables_queue_delta(self) -> None:
        """An observed reload must win even when every lifetime counter rises."""
        map_report: dict[str, Any] = contextual_report()
        map_report["queueAfter"][0]["moduleVersion"] = "another-build"
        map_summary: dict[str, Any] = summarize(map_report)
        self.assertEqual(map_summary["queue"]["comparison"], "module_version_changed")
        self.assertIsNone(map_summary["queue"]["counterChangesAssumingSameLifetime"])
        map_result: dict[str, Any] = compare(summarize(contextual_report()), map_summary)
        self.assertTrue(all(metric["experiment"] is None for metric in map_result["metrics"][6:]))

    def test_context_differences_and_within_capture_changes_are_visible(self) -> None:
        """Controller and microphone changes must not look like matched workload."""
        map_report: dict[str, Any] = contextual_report()
        map_report["setupBefore"]["launchpadMode"] = 2
        map_report["setupAfter"]["launchpadMode"] = 2
        map_report["setupAfter"]["nativeMicrophoneListening"] = True
        map_result: dict[str, Any] = compare(summarize(contextual_report()), summarize(map_report))
        map_field_to_context: dict[str, dict[str, Any]] = {entry["field"]: entry for entry in map_result["setupComparison"]}
        self.assertEqual(map_field_to_context["launchpadMode"]["status"], "different")
        self.assertEqual(map_field_to_context["nativeMicrophoneListening"]["status"], "changed_within_capture")
        self.assertEqual(map_field_to_context["bpmX100"]["status"], "same_observed_endpoints")
        self.assertIn("do not prove", render_comparison(map_result))

    def test_old_reports_do_not_inherit_context_from_the_other_file(self) -> None:
        """The current checkout or the experiment cannot identify an old build."""
        map_result: dict[str, Any] = compare(summarize(synthetic_report()), summarize(contextual_report()))
        self.assertEqual(map_result["baseline"]["engineBuild"], "unknown")
        self.assertTrue(all(entry["status"] == "unavailable" for entry in map_result["setupComparison"]))
        self.assertIn("Setup context is missing", render_comparison(map_result))

    def test_incomplete_capture_cannot_produce_rates(self) -> None:
        """Keep partial observations without comparing their timing or queue rate."""
        map_report: dict[str, Any] = contextual_report()
        map_report["complete"] = False
        map_result: dict[str, Any] = compare(summarize(map_report), summarize(contextual_report()))
        self.assertTrue(all(metric["baseline"] is None for metric in map_result["metrics"]))

    def test_invalid_context_and_impossible_counts_are_rejected(self) -> None:
        """Malformed added fields cannot silently become trustworthy evidence."""
        field: str
        value: Any
        for field, value in (("bpmX100", 0), ("bpmX100", True), ("activeTrack", 17),
                             ("launchpadActive", 1), ("nativeMicrophoneListening", "false"),
                             ("setUuid", {}), ("keyboardLayout", -1)):
            with self.subTest(field=field):
                map_report: dict[str, Any] = contextual_report()
                map_report["setupBefore"][field] = value
                with self.assertRaises(ValueError):
                    summarize(map_report)
        index: int
        for index in (2, 23, 29):
            map_report = contextual_report()
            map_report["captures"][0]["audio"][index] = 20000
            with self.assertRaises(ValueError):
                summarize(map_report)

    def test_cli_compares_without_modifying_either_file_and_rejects_bad_baseline(self) -> None:
        """Exercise the public text/JSON command with real paths containing spaces."""
        with tempfile.TemporaryDirectory(prefix="audio comparison ") as directory:
            baseline_path: Path = Path(directory) / "baseline capture.json"
            experiment_path: Path = Path(directory) / "experiment capture.json"
            contents: str = json.dumps(contextual_report())
            baseline_path.write_text(contents)
            experiment_path.write_text(contents)
            options: list[str]
            for options in ([], ["--json"]):
                result: subprocess.CompletedProcess[str] = subprocess.run(
                    [sys.executable, str(READER), str(experiment_path), "--baseline", str(baseline_path), *options],
                    capture_output=True, text=True, check=False)
                self.assertEqual(result.returncode, 0, result.stderr)
                if options:
                    self.assertEqual(json.loads(result.stdout)["format"], "movy-audio-check-comparison-v1")
                else:
                    self.assertIn("observations only", result.stdout)
                self.assertEqual(baseline_path.read_text(), contents)
                self.assertEqual(experiment_path.read_text(), contents)
            baseline_path.write_text("{broken")
            result = subprocess.run([sys.executable, str(READER), str(experiment_path), "--baseline", str(baseline_path)],
                                    capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stdout, "")
            self.assertNotIn("Traceback", result.stderr)


if __name__ == "__main__":
    unittest.main()
