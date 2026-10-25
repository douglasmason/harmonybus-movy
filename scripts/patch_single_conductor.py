"""Add the single-conductor template after existing clip and library integration."""
from pathlib import Path
import subprocess


def patch_single_conductor(root: Path) -> None:
    """Apply the shared actor map, migration, native fan-out and regressions."""
    patch: Path = Path(__file__).resolve().parents[1] / 'integration/single-conductor/single-conductor.patch'
    applied: subprocess.CompletedProcess[bytes] = subprocess.run(
        ['git', 'apply', '--reverse', '--check', str(patch)], cwd=root, capture_output=True)
    if applied.returncode != 0:
        subprocess.run(['git', 'apply', str(patch)], cwd=root, check=True)
