"""Add saved Energy/Space overlays to production Song Sections."""
from pathlib import Path
import subprocess


def patch_section_shaping(root: Path) -> None:
    """Apply the audited delta after Song Sections, including its UI/DSP identity."""
    patch: Path = Path(__file__).resolve().parents[1] / "integration/section-shaping/section-shaping.patch"
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ["git", "apply", "--reverse", "--check", str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(["git", "apply", str(patch)], cwd=root, check=True)
