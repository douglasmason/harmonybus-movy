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
    """Prevent router-level attempts to open Movy's separate Schwung list editor."""
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
        "                /* PAGE mode delegates enum feedback to Schwung's own transient\n"
        "                 * peek. Movy's separate editor is not part of this build's UI. */\n"
        "                if (intent && intent.action === 'open' && schwungGridMode() !== 'page'\n"
        "                    && !openSchwungEditor(intent, spc)) {\n"
        "                    mlog('schwung-open unhandled ' + (intent.key || '?')\n"
        "                       + ' kind=' + (intent.meta ? intent.meta.kind : '?'));\n"
        "                }"
    )
    source = replace_once(source, before_open, after_open, "disable router editor under PAGE mode")
    path.write_text(source)


def patch_schwung_editor(path: Path) -> None:
    """Make Movy's separate Schwung list editor inert in the dedicated PAGE build.

    hb.9 guarded the known router open site, but hardware showed the editor could
    still become foreground state. This build never needs that editor because PAGE
    mode is forced globally and Schwung's controller already supplies the useful
    TURNING peek. Make the editor incapable of becoming active at all.
    """
    source: str = path.read_text()

    source = replace_once(
        source,
        "export function schwungEditorActive(): boolean { return state !== null; }",
        "export function schwungEditorActive(): boolean { return false; }",
        "editor active hard-off",
    )

    open_start: str = "export function openSchwungEditor(intent: SchwungIntent | null, page: SchwungPage): boolean {"
    open_end: str = "\n}\n\n/** Move the cursor. Clamped, not wrapped — the same as every other list here. */"
    if "/* HarmonyBus PAGE build: Movy's separate list editor is disabled. */" not in source:
        start: int = source.find(open_start)
        if start < 0:
            raise RuntimeError("schwung-editor open function seam drifted: start not found")
        end: int = source.find(open_end, start)
        if end < 0:
            raise RuntimeError("schwung-editor open function seam drifted: end not found")
        replacement: str = (
            "export function openSchwungEditor(_intent: SchwungIntent | null, _page: SchwungPage): boolean {\n"
            "    /* HarmonyBus PAGE build: Movy's separate list editor is disabled. */\n"
            "    state = null;\n"
            "    return false;\n"
            "}"
        )
        source = source[:start] + replacement + source[end + 2:]

    before_render: str = "export function renderSchwungEditor(): void {\n    if (!state) return;"
    after_render: str = (
        "export function renderSchwungEditor(): void {\n"
        "    /* Defensive: the dedicated HarmonyBus PAGE build must never draw Movy's\n"
        "     * separate enum editor over Schwung's own parameter page/peek. */\n"
        "    state = null;\n"
        "    return;\n"
        "    if (!state) return;"
    )
    source = replace_once(source, before_render, after_render, "editor render hard-off")
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
    patch_schwung_editor(root / "src/renderer/schwung-editor.ts")
    print("HarmonyBus Movy: Schwung PAGE + stock enum peek; Movy enum editor hard-disabled")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
