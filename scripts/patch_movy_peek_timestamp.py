#!/usr/bin/env python3
"""Patch Movy's Schwung-page knob path to pass real timestamps to enum peeks."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace one exact upstream seam, accepting an already-applied transform."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Movy peek seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def transform(source: str) -> str:
    """Give every replayed knob detent a valid, monotonic timestamp."""
    before = """            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir);\n"""
    after = """            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n            /* page_controller uses nowMs both for enum-peek expiry and its\n             * transient write/turn bookkeeping. Passing undefined produced a\n             * NaN peek deadline, so enum overlays could persist forever and\n             * display a stale option while the underlying parameter moved.\n             * Keep one real timestamp per physical encoder event and advance\n             * replayed detents by 1 ms so the controller sees monotonic input. */\n            const nowMs = Date.now();\n            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir, nowMs + i);\n"""
    return replace_once(source, before, after, "Schwung knob timestamp")


def main() -> int:
    """Patch a clean or already-patched Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    path: Path = args.movy_root.resolve() / "src/renderer/schwung-page.ts"
    original: str = path.read_text()
    updated: str = transform(original)
    path.write_text(updated)
    print(f"HarmonyBus Movy peek timestamp fix applied: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
