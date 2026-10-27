"""Share settings-page control ownership across performance modes."""
from pathlib import Path
import shutil
import subprocess


def patch_parameter_ownership(root: Path) -> None:
    """Apply the strict ownership patch and install its real app-loop regression."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/parameter-ownership'
    patch: Path = assets / 'parameter-ownership.patch'
    subprocess.run(['git', '-C', str(root), 'apply', '--check', str(patch)], check=True)
    subprocess.run(['git', '-C', str(root), 'apply', str(patch)], check=True)
    shutil.copy2(assets / 'hb-parameter-ownership.mjs', root / 'browser-test/hb-parameter-ownership.mjs')
    print('Parameter pages: shared input/display/LED ownership, onset releases and bounded LED retries')
