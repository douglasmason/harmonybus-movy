"""Synthetic report and CLI regressions; these are not physical-device measurements."""
from __future__ import annotations

import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

from analyze import render, summarize

READER: Path = Path(__file__).with_name("analyze.py")


def synthetic_report() -> dict[str, Any]:
    """Model preview-test.ts serialization with distinct audio_profile.rs fields."""
    map_before: dict[str, Any] = {
        "services": 100, "activations": 8, "recoveries": 2, "lateChanges": 3,
        "clears": 1, "rearms": 2, "maxLateBeats": 5.0,
        "lastDueBeat": 40.0, "lastActualBeat": 40.5, "owner": 1,
    }
    map_after: dict[str, Any] = {
        "services": 200, "activations": 16, "recoveries": 3, "lateChanges": 5,
        "clears": 1, "rearms": 3, "maxLateBeats": 5.0,
        "lastDueBeat": 72.0, "lastActualBeat": 72.25, "owner": 1,
    }
    return {
        "format": "movy-audio-check-v1", "complete": True,
        "capturedAt": "2026-11-01T00:00:00.000Z",
        "captures": [{
            # Enabled, counts, work/budget; worst stages; independent maxima;
            # worst track; interval fields; late-group fields; request; elapsed.
            "audio": [0, 12000, 2, 7, 4000, 2902,
                      204, 50, 229, 305, 184, 0, 3028,
                      250, 60, 300, 400, 200, 0, 3200,
                      4, 176, 11999, 7, 9000, 8100, 900, 400, 123,
                      3, 2, 4, 50000, 200, None, 35005],
            "requests": ["0", "1500", "6", "1200", "unrelated_read",
                         "500", "unrelated_write", "300", "note_on"],
            "tone": [2, 200000, 0, 0, 132300], "seconds": 35.005,
            # JS Number(request name) becomes NaN, serialized as null at audio[34].
            "gapRequest": "ch1:midi_fx1:hb_chord_queue_status",
        }],
        "queueBefore": [{"track": track, "status": "loop-before", "diagnostics": copy.deepcopy(map_before)}
                        for track in range(1, 17)],
        "queueAfter": [{"track": track, "status": "loop-after", "diagnostics": copy.deepcopy(map_after)}
                       for track in range(1, 17)],
    }


class ReportTests(unittest.TestCase):
    """Exercise interpretation independently of formatting or device execution."""

    def test_shared_queue_is_compared_once_and_conditionally(self) -> None:
        """Sixteen repeated conductor reads must not multiply counter changes."""
        map_queue: dict[str, Any] = summarize(synthetic_report())["queue"]
        self.assertEqual(map_queue["track"], 1)
        self.assertEqual(map_queue["comparison"], "conditional_on_same_module_lifetime")
        self.assertEqual(map_queue["counterChangesAssumingSameLifetime"], {
            "services": 100, "activations": 8, "recoveries": 1,
            "lateChanges": 2, "clears": 0, "rearms": 1,
        })
        self.assertIn("reload can go undetected", " ".join(map_queue["warnings"]))

    def test_sequential_disagreement_uses_first_common_supported_track(self) -> None:
        """Unavailable early tracks cannot hide differences in later reads."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["queueBefore"][0]["diagnostics"] = None
        map_report["queueAfter"][2]["diagnostics"]["activations"] = 17
        map_report["queueAfter"].reverse()
        map_queue: dict[str, Any] = summarize(map_report)["queue"]
        self.assertEqual(map_queue["track"], 2)
        self.assertEqual(map_queue["counterChangesAssumingSameLifetime"]["activations"], 8)
        self.assertIn("Track reads differ", " ".join(map_queue["warnings"]))

    def test_missing_queue_evidence_is_unknown_not_zero(self) -> None:
        """Absent, unsupported, and disjoint endpoints cannot establish changes."""
        variant: str
        for variant in ("missing", "unsupported", "disjoint"):
            with self.subTest(variant=variant):
                map_report: dict[str, Any] = synthetic_report()
                if variant == "missing":
                    del map_report["queueAfter"]
                elif variant == "unsupported":
                    map_report["queueAfter"] = [{"track": 1, "diagnostics": None}]
                else:
                    map_report["queueBefore"] = map_report["queueBefore"][:1]
                    map_report["queueAfter"] = map_report["queueAfter"][1:]
                map_queue: dict[str, Any] = summarize(map_report)["queue"]
                self.assertEqual(map_queue["comparison"], "unavailable")
                self.assertIsNone(map_queue["counterChangesAssumingSameLifetime"])

    def test_counter_or_peak_decrease_prevents_subtraction(self) -> None:
        """Every lifetime counter and the maximum can expose a reset."""
        field: str
        for field in ("services", "activations", "recoveries", "lateChanges", "clears", "rearms", "maxLateBeats"):
            with self.subTest(field=field):
                map_report: dict[str, Any] = synthetic_report()
                map_report["queueAfter"][0]["diagnostics"][field] = 0
                map_queue: dict[str, Any] = summarize(map_report)["queue"]
                self.assertEqual(map_queue["comparison"], "counter_reset_or_inconsistent_snapshots")
                self.assertIsNone(map_queue["counterChangesAssumingSameLifetime"])

    def test_peaks_are_retained_without_attributing_old_lateness(self) -> None:
        """An old maximum persists while the most recent beat may move backwards."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["queueAfter"][0]["diagnostics"]["lastDueBeat"] = 4
        map_report["queueAfter"][0]["diagnostics"]["lastActualBeat"] = 4
        map_queue: dict[str, Any] = summarize(map_report)["queue"]
        self.assertEqual(map_queue["before"]["maxLateBeats"], 5)
        self.assertEqual(map_queue["after"]["maxLateBeats"], 5)
        self.assertNotIn("maxLateBeats", map_queue["counterChangesAssumingSameLifetime"])
        self.assertNotIn("lastDueBeat", map_queue["counterChangesAssumingSameLifetime"])

    def test_owner_change_is_visible(self) -> None:
        """Ownership changes must survive summarization even with rising counters."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["queueAfter"][0]["diagnostics"]["owner"] = 3
        self.assertIn("owner changed", " ".join(summarize(map_report)["queue"]["warnings"]))

    def test_incomplete_capture_never_has_queue_deltas(self) -> None:
        """A running or cancelled check cannot produce a completed comparison."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["complete"] = False
        map_report["captures"][0]["audio"][0] = 1
        map_queue: dict[str, Any] = summarize(map_report)["queue"]
        self.assertEqual(map_queue["comparison"], "incomplete_capture")
        self.assertIsNone(map_queue["counterChangesAssumingSameLifetime"])
        map_report["captures"] = []
        self.assertFalse(summarize(map_report)["complete"])

    def test_audio_fields_and_coincident_request_are_named_correctly(self) -> None:
        """Do not confuse the request at the largest gap with unrelated peaks."""
        map_capture: dict[str, Any] = summarize(synthetic_report())["captures"][0]
        self.assertEqual(map_capture["timing"], {
            "callbacks": 12000, "callbacksOverBudget": 2, "peakCallbackWorkUs": 4000,
            "callbackBudgetUs": 2902, "callbackIntervals": 11999, "lateIntervals": 7,
            "largestIntervalUs": 9000, "idleAtLargestIntervalUs": 8100,
            "workAtLargestIntervalUs": 900, "requestWorkAtLargestIntervalUs": 400,
            "shortIntervals": 3, "lateGroups": 2, "largestLateGroup": 4,
            "largestLateGroupSpanUs": 50000, "largestRequestAtGapUs": 200, "elapsedMs": 35005,
        })
        self.assertEqual(map_capture["requestAtLargestGap"], "ch1:midi_fx1:hb_chord_queue_status")
        self.assertEqual(map_capture["requestMetrics"][4], "unrelated_read")

    def test_older_metrics_do_not_invent_missing_values(self) -> None:
        """The shorter audio layout has no clustering or engine-duration evidence."""
        map_report: dict[str, Any] = synthetic_report()
        map_report["captures"][0]["audio"] = map_report["captures"][0]["audio"][:29]
        map_report["captures"][0]["audio"][23] = None
        del map_report["captures"][0]["gapRequest"]
        map_capture: dict[str, Any] = summarize(map_report)["captures"][0]
        self.assertIsNone(map_capture["timing"]["lateIntervals"])
        self.assertIsNone(map_capture["timing"]["lateGroups"])
        self.assertIsNone(map_capture["timing"]["elapsedMs"])
        self.assertIsNone(map_capture["requestAtLargestGap"])

    def test_internal_tone_has_distinct_missing_incomplete_and_mismatch_results(self) -> None:
        """No checked samples or an unfinished tone must never read as matched."""
        tone: list[int] | None
        expected: str
        for tone, expected in ((None, "unavailable"), ([1, 20, 0, 0, 50], "incomplete"),
                               ([2, 0, 0, 0, 50], "incomplete"), ([2, 20, 1, 3, 50], "mismatch"),
                               ([2, 20, 0, 0, 50], "matched")):
            with self.subTest(tone=tone):
                map_report: dict[str, Any] = synthetic_report()
                map_report["captures"][0]["tone"] = tone
                self.assertEqual(summarize(map_report)["captures"][0]["internalTone"], expected)

    def test_build_is_never_guessed_from_counters(self) -> None:
        """Only a build explicitly stored in the report may be displayed."""
        map_report: dict[str, Any] = synthetic_report()
        self.assertEqual(summarize(map_report)["engineBuild"], "unknown")
        map_report["engineBuild"] = "synthetic-build"
        self.assertEqual(summarize(map_report)["engineBuild"], "synthetic-build")

    def test_text_exposes_limits_and_lifetime_peak(self) -> None:
        """Human-readable output must retain the same caveats as JSON."""
        output: str = render(summarize(synthetic_report()))
        self.assertIn("Build: unknown", output)
        self.assertIn("Internal tone: matched", output)
        self.assertIn("Lifetime maxLateBeats: 5.0 -> 5.0", output)
        self.assertIn("assuming the same loaded module lifetime", output)
        self.assertIn("not audible crackle counts", output)
        self.assertIn("not the host or DAC", output)

    def test_invalid_counter_values_are_rejected(self) -> None:
        """Corrupt, non-finite, boolean, or rounded counters cannot yield deltas."""
        value: Any
        for value in (-1, 1.5, True, None, "8", float("nan"), float("inf"), 2**53, 10**400):
            with self.subTest(value=value):
                map_report: dict[str, Any] = synthetic_report()
                map_report["queueBefore"][0]["diagnostics"]["activations"] = value
                with self.assertRaises(ValueError):
                    summarize(map_report)

    def test_duplicate_invalid_and_malformed_tracks_are_rejected(self) -> None:
        """A repeated track must not silently replace the first snapshot."""
        entries: Any
        for entries in ([{"track": 1}, {"track": 1}], [{"track": 0}], [{"track": 17}],
                        [{"track": True}], [{"track": 1, "diagnostics": []}], "missing"):
            with self.subTest(entries=entries):
                map_report: dict[str, Any] = synthetic_report()
                map_report["queueBefore"] = entries
                with self.assertRaises(ValueError):
                    summarize(map_report)

    def test_invalid_complete_capture_cannot_look_successful(self) -> None:
        """Bad schema, empty/active capture, and invalid metrics fail explicitly."""
        variant: str
        for variant in ("format", "complete", "empty", "multiple", "audio-length", "active", "no-callbacks",
                        "negative", "nonfinite", "boolean", "tone", "tone-state", "tone-count", "requests", "build"):
            with self.subTest(variant=variant):
                map_report: dict[str, Any] = synthetic_report()
                map_capture: dict[str, Any] = map_report["captures"][0]
                if variant == "format":
                    map_report["format"] = "movy-worker-check-v1"
                elif variant == "complete":
                    map_report["complete"] = "true"
                elif variant == "empty":
                    map_report["captures"] = []
                elif variant == "multiple":
                    map_report["captures"] *= 2
                elif variant == "audio-length":
                    map_capture["audio"].pop()
                elif variant == "active":
                    map_capture["audio"][0] = 1
                elif variant == "no-callbacks":
                    map_capture["audio"][1] = 0
                elif variant in ("negative", "nonfinite", "boolean"):
                    map_capture["audio"][23] = {"negative": -1, "nonfinite": float("nan"), "boolean": True}[variant]
                elif variant == "tone":
                    map_capture["tone"] = [2, 20]
                elif variant == "tone-state":
                    map_capture["tone"][0] = 3
                elif variant == "tone-count":
                    map_capture["tone"][2] = 300000
                elif variant == "requests":
                    map_capture["requests"] = "not an array"
                else:
                    map_report["engineBuild"] = {"unexpected": "object"}
                with self.assertRaises(ValueError):
                    summarize(map_report)


class CliTests(unittest.TestCase):
    """Run the supported command with real file paths and stdout/stderr."""

    def run_reader(self, report_path: Path, *arguments: str) -> subprocess.CompletedProcess[str]:
        """Invoke the actual entry point without a shell."""
        return subprocess.run([sys.executable, str(READER), str(report_path), *arguments],
                              capture_output=True, text=True, check=False)

    def test_text_and_json_leave_input_unchanged(self) -> None:
        """Paths with spaces work and neither output mode modifies the capture."""
        with tempfile.TemporaryDirectory(prefix="audio check ") as temporary_directory:
            report_path: Path = Path(temporary_directory) / "saved capture.json"
            contents: str = json.dumps(synthetic_report(), indent=2)
            report_path.write_text(contents, encoding="utf-8")
            argument_list: tuple[str, ...]
            for argument_list in ((), ("--json",)):
                result: subprocess.CompletedProcess[str] = self.run_reader(report_path, *argument_list)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(result.stderr, "")
                self.assertEqual(report_path.read_text(encoding="utf-8"), contents)
                if argument_list:
                    self.assertEqual(json.loads(result.stdout)["format"], "movy-audio-check-summary-v1")
                else:
                    self.assertIn("Audio check: complete", result.stdout)

    def test_invalid_json_and_unreadable_input_fail_cleanly(self) -> None:
        """Input errors have status 2 and no misleading partial summary."""
        with tempfile.TemporaryDirectory() as temporary_directory:
            report_path: Path = Path(temporary_directory) / "capture.json"
            contents: str
            for contents in ("{", "null", '{"format": NaN}', '{"format": Infinity}'):
                report_path.write_text(contents, encoding="utf-8")
                result: subprocess.CompletedProcess[str] = self.run_reader(report_path, "--json")
                self.assertEqual(result.returncode, 2)
                self.assertEqual(result.stdout, "")
                self.assertIn("Cannot analyze capture:", result.stderr)
                self.assertNotIn("Traceback", result.stderr)
            report_path.unlink()
            self.assertEqual(self.run_reader(report_path).returncode, 2)


if __name__ == "__main__":
    unittest.main()
