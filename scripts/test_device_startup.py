"""Evaluate the packaged device bundle in Schwung's actual QuickJS runtime."""
import argparse
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    """Check module evaluation and callbacks, with and without optional UI libs."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('movy', type=Path)
    parser.add_argument('schwung', type=Path)
    arguments = parser.parse_args()
    runtime = arguments.schwung.resolve() / 'libs/quickjs/quickjs-2025-04-26/qjs'
    shared = arguments.schwung.resolve() / 'src/shared'
    bundle = (arguments.movy / 'ui.js').read_text()
    # Only relocate host module paths. Preserve the release code and its
    # evaluation order: browser entry points did not expose this cycle.
    relocated = bundle.replace('/data/UserData/schwung/shared/', str(shared) + '/')
    with tempfile.TemporaryDirectory(prefix='movy-device-startup-') as directory:
        root = Path(directory)
        for optional in (True, False):
            source = relocated if optional else relocated.replace(str(shared / 'param_pages') + '/', str(root / 'missing') + '/')
            (root / 'ui.mjs').write_text(source)
            (root / 'check.mjs').write_text("await import('./ui.mjs');\nfor(const key of ['init','tick','onMidiMessageInternal']) {if(typeof globalThis[key]!=='function')throw Error('Missing '+key);}\nprint('DEVICE_BUNDLE_LOAD_OK');\n")
            result = subprocess.run([str(runtime), '-m', str(root / 'check.mjs')], text=True, capture_output=True, timeout=30)
            if result.returncode or 'DEVICE_BUNDLE_LOAD_OK' not in result.stdout:
                raise SystemExit(f'Device bundle load failed (optional UI={optional})\n{result.stdout}{result.stderr}')
            print(f'QuickJS device bundle: callbacks registered (optional UI={optional})')


if __name__ == '__main__':
    main()
