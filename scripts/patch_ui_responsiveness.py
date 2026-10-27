"""Bound feedback IPC and remove polling owned by hidden performance controls."""
from pathlib import Path
import shutil
import subprocess


def patch_ui_responsiveness(root: Path) -> None:
    """Apply the strict source patch and install production-path regressions."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/ui-responsiveness'
    subprocess.run(['git', '-C', str(root), 'apply', '--check', str(assets / 'ui-responsiveness.patch')], check=True)
    subprocess.run(['git', '-C', str(root), 'apply', str(assets / 'ui-responsiveness.patch')], check=True)
    filename: str
    for filename in ('hb-feedback-polling.mjs', 'hb-ui-responsiveness.mjs'):
        shutil.copy2(assets / filename, root / 'browser-test' / filename)
    print('UI responsiveness: bounded feedback retries, batched approach status and visible-only value polling')
