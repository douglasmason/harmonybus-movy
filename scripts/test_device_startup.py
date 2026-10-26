"""Evaluate the packaged device bundle in Schwung's actual QuickJS runtime."""
import argparse
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    """Check callbacks and the packaged shared UI with either host-library state."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('movy', type=Path)
    parser.add_argument('schwung', type=Path)
    arguments: argparse.Namespace = parser.parse_args()
    runtime: Path = arguments.schwung.resolve() / 'libs/quickjs/quickjs-2025-04-26/qjs'
    shared: Path = arguments.schwung.resolve() / 'src/shared'
    bundle: str = (arguments.movy / 'ui.js').read_text()
    # Only relocate host module paths. Preserve the release code and its
    # evaluation order: browser entry points did not expose this cycle.
    relocated: str = bundle.replace('/data/UserData/schwung/shared/', str(shared) + '/')
    with tempfile.TemporaryDirectory(prefix='movy-device-startup-') as directory:
        root: Path = Path(directory)
        optional: bool
        for optional in (True, False):
            source: str = relocated if optional else relocated.replace(str(shared / 'param_pages') + '/', str(root / 'missing') + '/')
            (root / 'ui.mjs').write_text(source)
            (root / 'check.mjs').write_text("const ui=await import('./ui.mjs');\nfor(const key of ['init','tick','onMidiMessageInternal']) {if(typeof globalThis[key]!=='function')throw Error('Missing '+key);}\nif(!ui.schwungLibAvailable())throw Error('Shared UI unavailable: '+ui.schwungLibError());\nprint('DEVICE_BUNDLE_LOAD_OK');\n")
            result: subprocess.CompletedProcess[str] = subprocess.run([str(runtime), '-m', str(root / 'check.mjs')], text=True, capture_output=True, timeout=30)
            if result.returncode or 'DEVICE_BUNDLE_LOAD_OK' not in result.stdout:
                raise SystemExit(f'Device bundle load failed (optional UI={optional})\n{result.stdout}{result.stderr}')
            print(f'QuickJS device bundle: callbacks and shared UI ready (host UI={optional})')


if __name__ == '__main__':
    main()
