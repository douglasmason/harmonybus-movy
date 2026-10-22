"""Add selected drum-lane fills to the existing clip editor."""
from pathlib import Path
import subprocess


def patch_drum_fill(root: Path) -> None:
    """Apply the audited delta after Clip Participation and Source Weaving."""
    patch: Path = Path(__file__).resolve().parents[1] / "integration/drum-fill/drum-fill.patch"
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ["git", "apply", "--reverse", "--check", str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(["git", "apply", str(patch)], cwd=root, check=True)
