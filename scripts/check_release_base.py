"""Accept concurrent browser-only commits without publishing changed device inputs."""
from pathlib import Path
import subprocess
import sys


def check_release_base(root: Path, tested: str, current: str) -> None:
    """Require a descendant with identical device inputs and installer metadata."""
    ancestor = subprocess.run(
        ['git', 'merge-base', '--is-ancestor', tested, current], cwd=root,
        check=False,
    )
    if ancestor.returncode:
        raise ValueError('Main no longer descends from the tested commit; installer unchanged')
    changed = subprocess.check_output(
        ['git', 'diff', '--no-renames', '--name-only', '-z', tested, current], cwd=root,
    ).decode().split('\0')
    # These are repository-only browser assets, absent from the Move package.
    # Everything else, including this guard and release.json, must be identical.
    blocked = [name for name in changed if name and not (
        name.startswith(('dev/local/', 'dev/wasm/')) or
        name == '.github/workflows/local-processor.yml'
    )]
    if blocked:
        raise ValueError('Device/release inputs changed concurrently; installer unchanged: ' + ', '.join(blocked))


if __name__ == '__main__':
    try:
        check_release_base(Path.cwd(), sys.argv[1], sys.argv[2])
    except ValueError as error:
        raise SystemExit(str(error)) from error
