#!/usr/bin/env python3
"""Replace Movy's disabled Schwung enum editor renderer with a true no-op."""
from __future__ import annotations

import argparse
from pathlib import Path


def main() -> int:
    """Patch the generated Movy checkout in place."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser()
    parser.add_argument("movy_root", type=Path)
    args: argparse.Namespace = parser.parse_args()
    path: Path = args.movy_root.resolve() / "src/renderer/schwung-editor.ts"
    source: str = path.read_text()

    start_token: str = "export function renderSchwungEditor(): void {"
    start: int = source.find(start_token)
    if start < 0:
        raise RuntimeError("renderSchwungEditor seam not found")

    # renderSchwungEditor is the final function in the upstream file. Replacing
    # it wholesale avoids leaving unreachable state-dependent code that TS still
    # type-checks after the PAGE-build hard-disable return.
    replacement: str = (
        "export function renderSchwungEditor(): void {\n"
        "    /* HarmonyBus PAGE build: Movy's separate enum editor is disabled.\n"
        "     * Schwung's embedded parameter page remains authoritative. */\n"
        "    state = null;\n"
        "}\n"
    )
    source = source[:start] + replacement
    path.write_text(source)
    print(f"HarmonyBus Movy editor renderer replaced with no-op: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
