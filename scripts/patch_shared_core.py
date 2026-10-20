"""Bind the pinned HarmonyBus core without maintaining a second source copy."""
from pathlib import Path
import base64
import hashlib
import json
import os


def patch_shared_core(root: Path) -> None:
    """Install canonical transport sources and the stock FM1 adapter after other patches."""
    integration: Path = Path(__file__).resolve().parents[1]
    default_root: Path = integration / 'harmonybus'
    if not default_root.is_dir():
        default_root = integration.parent / 'harmonybus'
    core_root: Path = Path(os.environ.get('HARMONYBUS_ROOT', str(default_root)))
    core_source: Path = core_root / 'core/surfaces/input.ts'
    if not core_source.is_file():
        raise RuntimeError('HARMONYBUS_ROOT must point at the pinned shared-core checkout')
    destination: Path = root / 'src/surfaces'
    destination.mkdir(parents=True, exist_ok=True)
    for filename in ('input.ts', 'fm1.ts', 'claims.ts'):
        (destination / filename).write_text((integration / 'integration/shared' / filename).read_text())
    (destination / 'core-input.ts').write_bytes(core_source.read_bytes())
    provenance: dict[str, str] = {'path': 'core/surfaces/input.ts',
        'sha256': hashlib.sha256(core_source.read_bytes()).hexdigest()}
    (root / 'harmonybus-core-source.json').write_text(json.dumps(provenance, indent=2) + '\n')
    path: Path = root / 'src/app/globals.ts'
    source: str = path.read_text().replace("import { onMidiMessageExternal } from '../surfaces/launchpad.js';",
        "import { onMidiMessageExternal as onLaunchpadMidi } from '../surfaces/launchpad.js';\nimport { onFm1Midi } from '../surfaces/fm1.js';\nfunction onMidiMessageExternal(data: number[]): void { if (!onFm1Midi(data)) onLaunchpadMidi(data); }")
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = "import { tickFm1 } from '../surfaces/fm1.js';\n" + source
    source = source.replace('    tickLaunchpad();', '    tickFm1();\n    tickLaunchpad();')
    path.write_text(source)
    path = root / 'src/app/unload.ts'
    source = "import { unloadFm1 } from '../surfaces/fm1.js';\n" + path.read_text()
    source = source.replace('    unloadLaunchpad();', '    unloadFm1();\n    unloadLaunchpad();')
    path.write_text(source)
    path = root / 'src/app/input-reset.ts'
    source = "import { releaseFm1 } from '../surfaces/fm1.js';\n" + path.read_text()
    source = source.replace('export function resetHeldInput(notifyEngine: boolean): void {',
        'export function resetHeldInput(notifyEngine: boolean): void {\n    if (notifyEngine) releaseFm1();')
    path.write_text(source)
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text()
    position: int = source.index('\n];', source.index('export const FLAGS:'))
    source = source[:position] + """
    { key: 'hbfm1channel', name: 'FM1 MIDI channel', min: 0, max: 16, def: 0,
      labels: ['OFF', ...Array.from({length:16}, (_, index) => String(index+1))],
      release: true, uiOnly: true, hint: 'USB notes; Launchpad uses ch 1.' },
""" + source[position:]
    path.write_text(source)
    path = root / 'build/browser.mjs'
    source = path.read_text().replace('    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/surfaces/fm1.ts'),\n        resolve(root, 'src/surfaces/input.ts'),\n        resolve(root, 'src/surfaces/core-input.ts'),")
    path.write_text(source)

    path = root / 'browser-test/logic/flags.mjs'
    path.write_text(path.read_text().replace("'chtracks,chtrackset,hblaunchpad'", "'chtracks,chtrackset,hblaunchpad,hbfm1channel'"))
    (root / 'browser-test/hb-fm1.mjs').write_text((integration / 'integration/shared/hb-fm1.mjs').read_text())
    path = root / 'browser-test/hb-launchpad.mjs'
    path.write_text(path.read_text().replace("nativeWrites.at(-1)[0],'surface_release'", "nativeWrites.at(-1)[0],'surface_release_source'"))

    # The opt-in FM1 row changes only the two existing settings-page captures.
    for image_name in ('flags-release', 'flags-scrolled'):
        image_path: Path = integration / 'integration/shared' / (image_name + '.png.b64')
        (root / 'browser-test/screenshots/baseline' / (image_name + '.png')).write_bytes(
            base64.b64decode(image_path.read_text()))
