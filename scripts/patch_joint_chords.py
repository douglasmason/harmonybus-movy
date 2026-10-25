"""Compose chord-bank input with Joint Play and the existing clip step recorder."""
from pathlib import Path
import subprocess


def patch_joint_chords(root: Path) -> None:
    """Apply shared-controller/recorder changes after the common actor map."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/joint-chords'
    patch: Path = assets / 'joint-chords.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
    for name in ('hb-joint-chords.mjs','hb-conductor-content.mjs'):
        (root / 'browser-test' / name).write_text((assets / name).read_text())
