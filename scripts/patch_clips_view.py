"""Add the Clips performance/setup pages before the existing Master pipeline."""
from pathlib import Path
import subprocess


def patch_clips_view(root: Path) -> None:
    """Apply the tested UI integration after Chord Play and panel navigation."""
    patch: Path = Path(__file__).resolve().parents[1] / 'integration/clips-view/clips-view.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
