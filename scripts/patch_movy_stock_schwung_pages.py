#!/usr/bin/env python3
"""Force the dedicated HarmonyBus Movy build to use Schwung's own param-page controller."""
from __future__ import annotations

import argparse
from pathlib import Path


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
    if after in source:
        return
    count: int = source.count(before)
    if count != 1:
        raise RuntimeError(f"schwung-grid seam drifted: expected 1 match, found {count}")
    path.write_text(source.replace(before, after, 1))


def main() -> int:
    """Patch a clean or already-patched upstream Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    root: Path = args.movy_root.resolve()
    patch_schwung_grid(root / "src/renderer/schwung-grid.ts")
    print("HarmonyBus Movy: stock Schwung PAGE renderer forced")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
