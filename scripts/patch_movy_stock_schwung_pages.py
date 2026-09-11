#!/usr/bin/env python3
"""Make dedicated HarmonyBus Movy parameter pages behave like stock Schwung."""
from __future__ import annotations

import argparse
from pathlib import Path


def replace_once(source: str, before: str, after: str, seam: str) -> str:
    """Replace exactly one upstream block, or accept an already-applied block."""
    if after in source:
        return source
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"Schwung page seam {seam!r} drifted: expected 1 match, found {count}")
    return source.replace(before, after, 1)


def patch_schwung_grid(path: Path) -> None:
    """Pin Movy's embedded Schwung parameter-page renderer to PAGE mode."""
    source: str = path.read_text()
    before: str = "let override: SchwungGridMode | null = null;"
    after: str = (
        "/* HarmonyBus Movy intentionally uses stock Schwung's own parameter-page\n"
        " * controller so module enums, read-only telemetry, pagination and other\n"
        " * module-declared UI semantics match the host HarmonyBus was built for. */\n"
        "let override: SchwungGridMode | null = 'page';"
    )
    if after not in source:
        count: int = source.count(before)
        if count != 1:
            raise RuntimeError(f"schwung-grid seam drifted: expected 1 match, found {count}")
        source = source.replace(before, after, 1)
    path.write_text(source)


def patch_schwung_page(path: Path) -> None:
    """Preserve stock Schwung enum peeks while replaying accumulated encoder detents."""
    source: str = path.read_text()

    before_turn: str = (
        "            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n"
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir);\n"
        "        },\n"
        "        knobTouch: (slot: number, down: boolean) => { ctl.onKnobTouch(slot, down); },"
    )
    after_turn: str = (
        "            const n = Math.min(Math.abs(delta) | 0, 63) || 1;\n"
        "            /* Replay accumulated encoder motion as distinct detents in time,\n"
        "             * but leave Schwung's own enum-peek lifecycle untouched. */\n"
        "            const started = Date.now();\n"
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir, started + i);\n"
        "        },\n"
        "        knobTouch: (slot: number, down: boolean) => { ctl.onKnobTouch(slot, down); },"
    )
    source = replace_once(source, before_turn, after_turn, "timestamped knob replay")

    before_change: str = "        changePage(delta: number) { ctl.onJog(delta > 0 ? 1 : -1); },\n        goToPage(i: number) { ctl.goToPage(i); },"
    after_change: str = (
        "        changePage(delta: number) {\n"
        "            if (typeof ctl.dismissPeek === 'function') ctl.dismissPeek();\n"
        "            ctl.onJog(delta > 0 ? 1 : -1);\n"
        "        },\n"
        "        goToPage(i: number) {\n"
        "            if (typeof ctl.dismissPeek === 'function') ctl.dismissPeek();\n"
        "            ctl.goToPage(i);\n"
        "        },"
    )
    source = replace_once(source, before_change, after_change, "page navigation clears peek")
    path.write_text(source)


def patch_midi_router(path: Path) -> None:
    """Prevent Movy's list editor from competing with Schwung PAGE-mode enum peeks."""
    source: str = path.read_text()

    before_import: str = (
        "import { schwungChangePage, schwungActiveFor } from '../renderer/schwung-grid.js';"
    )
    after_import: str = (
        "import { schwungChangePage, schwungActiveFor, schwungGridMode } from '../renderer/schwung-grid.js';"
    )
    source = replace_once(source, before_import, after_import, "router PAGE-mode import")

    before_open: str = (
        "                if (intent && intent.action === 'open' && !openSchwungEditor(intent, spc)) {\n"
        "                    mlog('schwung-open unhandled ' + (intent.key || '?')\n"
        "                       + ' kind=' + (intent.meta ? intent.meta.kind : '?'));\n"
        "                }"
    )
    after_open: str = (
        "                /* In PAGE mode the Schwung controller owns the complete enum UI,\n"
        "                 * including its useful transient peek. Do not layer Movy's separate\n"
        "                 * list editor over it; that editor has an independent selection\n"
        "                 * state and can display a stale/default cursor. */\n"
        "                if (intent && intent.action === 'open' && schwungGridMode() !== 'page'\n"
        "                    && !openSchwungEditor(intent, spc)) {\n"
        "                    mlog('schwung-open unhandled ' + (intent.key || '?')\n"
        "                       + ' kind=' + (intent.meta ? intent.meta.kind : '?'));\n"
        "                }"
    )
    source = replace_once(source, before_open, after_open, "disable Movy editor under PAGE mode")
    path.write_text(source)


def main() -> int:
    """Patch a clean or already-patched upstream Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()
    patch_schwung_grid(root / "src/renderer/schwung-grid.ts")
    patch_schwung_page(root / "src/renderer/schwung-page.ts")
    patch_midi_router(root / "src/midi/router.ts")
    print("HarmonyBus Movy: Schwung PAGE + stock enum peek; Movy PAGE editor disabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
