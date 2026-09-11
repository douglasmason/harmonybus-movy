#!/usr/bin/env python3
"""Force the dedicated HarmonyBus Movy build to use Schwung's own param-page controller."""
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
    """Keep Schwung's enum peek synchronized and guarantee it closes on release."""
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
        "             * matching the stock Schwung host more closely. Passing one identical\n"
        "             * timestamp for a whole flick can leave enum peek/write state looking\n"
        "             * one step behind while the write throttle coalesces the burst. */\n"
        "            const started = Date.now();\n"
        "            for (let i = 0; i < n; i++) ctl.onKnobTurn(slot, dir, started + i);\n"
        "        },\n"
        "        knobTouch: (slot: number, down: boolean) => {\n"
        "            ctl.onKnobTouch(slot, down);\n"
        "            /* A hardware release must be terminal for Schwung's transient enum\n"
        "             * TURNING peek. The normal controller clears this from touch state,\n"
        "             * but Movy's routing can occasionally lose the lifecycle edge and\n"
        "             * leave the full-screen peek latched. Make release idempotently clear\n"
        "             * it here as well. */\n"
        "            if (!down && typeof ctl.dismissPeek === 'function') ctl.dismissPeek();\n"
        "        },"
    )
    source = replace_once(source, before_turn, after_turn, "knob replay and release")

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


def main() -> int:
    """Patch a clean or already-patched upstream Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()
    patch_schwung_grid(root / "src/renderer/schwung-grid.ts")
    patch_schwung_page(root / "src/renderer/schwung-page.ts")
    print("HarmonyBus Movy: stock Schwung PAGE renderer forced; enum peek lifecycle patched")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
