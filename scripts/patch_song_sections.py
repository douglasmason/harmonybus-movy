"""Extend pinned Movy's existing Song scheduler and shared production panel."""
from pathlib import Path
import re
import subprocess


def patch_song_sections(root: Path) -> None:
    """Apply the section patch once and give matching UI/DSP builds an identity."""
    patch: Path = Path(__file__).resolve().parents[1] / "integration/song-sections/song-sections.patch"
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ["git", "apply", "--reverse", "--check", str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(["git", "apply", str(patch)], cwd=root, check=True)
    for relative in ("src/seq/constants.ts", "engine/crates/movy-dsp/src/lib.rs"):
        path: Path = root / relative
        source: str = path.read_text()
        updated: str
        count: int
        updated, count = re.subn(
            r"(ENGINE_VERSION[^\n]*?['\"])0\.71\.0-[^'\"\n]+(['\"])",
            r"\g<1>0.71.0-song-sections1\2", source)
        if count != 1:
            raise RuntimeError(f"{relative}: expected one engine identity, found {count}")
        path.write_text(updated)
