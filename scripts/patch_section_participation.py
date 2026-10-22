"""Add follower clip participation without stopping source playback."""
from pathlib import Path
import subprocess


def patch_section_participation(root: Path) -> None:
    """Apply the audited delta after Song Sections, including its UI/DSP identity."""
    patch: Path = Path(__file__).resolve().parents[1] / "integration/section-participation/section-participation.patch"
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ["git", "apply", "--reverse", "--check", str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(["git", "apply", str(patch)], cwd=root, check=True)
