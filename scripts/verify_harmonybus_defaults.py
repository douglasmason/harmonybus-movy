#!/usr/bin/env python3
"""Verify the patched Movy presets against HarmonyBus's actual native loader."""

from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import tempfile


def main() -> int:
    """Compile the native API check and feed it Movy's four shipped presets."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("movy_root", type=Path)
    parser.add_argument("harmonybus_root", type=Path)
    arguments: argparse.Namespace = parser.parse_args()
    movy_root: Path = arguments.movy_root.resolve()
    harmonybus_root: Path = arguments.harmonybus_root.resolve()
    repository_root: Path = Path(__file__).resolve().parents[1]
    ui_source: str = (movy_root / "src/seq/ui-state.ts").read_text()
    preset_strings: list[str] = re.findall(r"'(hb(?:15|16),[-0-9,]+(?:;[a-z0-9,\-]+)*)'", ui_source)
    if len(preset_strings) != 8:
        raise ValueError(f"Expected eight shipped presets, found {len(preset_strings)}")
    temporary_directory: str
    with tempfile.TemporaryDirectory(prefix="hb-default-check-") as temporary_directory:
        executable: Path = Path(temporary_directory) / "check-hb-defaults"
        compile_command: list[str] = [
            "cc", "-std=c11", "-D_POSIX_C_SOURCE=200809L", "-O1",
            "-I", str(harmonybus_root / "modules/harmonybus/dsp"),
            str(repository_root / "tests/harmonybus_defaults.c"),
            str(harmonybus_root / "src/harmony_core.c"),
            "-lm", "-o", str(executable),
        ]
        subprocess.run(compile_command, check=True)
        subprocess.run([str(executable), *preset_strings], check=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
