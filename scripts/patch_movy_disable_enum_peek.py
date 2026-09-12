#!/usr/bin/env python3
"""Suppress unreliable hosted Schwung enum peeks while preserving enum writes."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace one exact upstream seam, accepting an already-applied transform."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Movy no-peek seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def transform(source: str) -> str:
    """Keep the successful enum write path but immediately dismiss its stale peek."""
    before_turn: str = (
        "            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n"
        "            /* Replay accumulated encoder motion as distinct detents in time,\n"
        "             * but leave Schwung's own enum-peek lifecycle untouched. */\n"
        "            const started = Date.now();\n"
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir, started + i);\n"
        "        },\n"
        "        knobTouch: (slot: number, down: boolean) => { ctl.onKnobTouch(slot, down); },"
    )
    after_turn: str = (
        "            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n"
        "            /* Keep the same enum write path used by hb.8, but suppress the\n"
        "             * hosted TURNING overlay: on device its cursor can be stale or\n"
        "             * unresponsive even while the underlying parameter changes. */\n"
        "            const started = Date.now();\n"
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir, started + i);\n"
        "            if (typeof ctl.dismissPeek === 'function') ctl.dismissPeek();\n"
        "        },\n"
        "        knobTouch: (slot: number, down: boolean) => {\n"
        "            ctl.onKnobTouch(slot, down);\n"
        "            if (typeof ctl.dismissPeek === 'function') ctl.dismissPeek();\n"
        "        },"
    )
    return replace_once(source, before_turn, after_turn, "enum peek suppression")


def main() -> int:
    """Patch a clean HarmonyBus-Movy build checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    path: Path = args.movy_root.resolve() / "src/renderer/schwung-page.ts"
    source: str = path.read_text()
    path.write_text(transform(source))
    print(f"HarmonyBus Movy no-peek enum patch applied: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
