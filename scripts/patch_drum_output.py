"""Add explicit channel-1 clip destinations after the current clip/library UI."""
from pathlib import Path
import subprocess


def patch_drum_output(root: Path) -> None:
    """Apply the tested sequencer, host routing and shared controller patch."""
    patch: Path = Path(__file__).resolve().parents[1] / 'integration/drum-output/drum-output.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
