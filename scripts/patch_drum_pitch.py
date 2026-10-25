"""Preserve drum sample addresses at the sequencer emission boundary."""
from pathlib import Path
import subprocess


def patch_drum_pitch(root: Path) -> None:
    """Apply sample-pitch isolation after the published Drum Fill patch."""
    patch: Path = Path(__file__).resolve().parents[1] / 'integration/drum-pitch/drum-pitch.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
