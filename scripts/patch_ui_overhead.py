"""Apply measured Chord Play/UI work reductions after the shared UI patches."""
from pathlib import Path
import shutil
import subprocess


def patch_ui_overhead(root: Path) -> None:
    """Patch pinned sources strictly and install behavioral/call-count regressions."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/ui-overhead'
    subprocess.run(['git', '-C', str(root), 'apply', '--check', str(assets / 'ui-overhead.patch')], check=True)
    subprocess.run(['git', '-C', str(root), 'apply', str(assets / 'ui-overhead.patch')], check=True)
    filename: str
    for filename in ('hb-ui-overhead.mjs', 'hb-ui-tick-overhead.mjs'):
        shutil.copy2(assets / filename, root / 'browser-test' / filename)
    print('Chord Play: unchanged-bank reuse, focused status polling and complete UI timing')
