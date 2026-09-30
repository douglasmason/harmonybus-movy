"""Mirror saved native Move colors across Movy's four track banks."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_native_track_colors(root: Path) -> None:
    """Install a set/resume reader; keep file IO outside performance gestures."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration' / 'track-colors'
    (root / 'src/seq/native-track-colors.ts').write_text((integration / 'native-track-colors.ts').read_text())
    path: Path = root / 'src/seq/colors.ts'
    source: str = path.read_text()
    source = source.replace('export function trackColor(track: number): number {', '''let nativeTrackColors: readonly (readonly number[])[] | null = null;
export function setNativeTrackColors(colors: readonly (readonly number[])[] | null): void {
    nativeTrackColors = colors;
}
export function trackColor(track: number): number {''')
    source = source.replace('return TRACK_COLOR[track & 15];', 'return nativeTrackColors?.[track & 3]?.[0] ?? TRACK_COLOR[track & 3];')
    source = source.replace('return TRACK_COLOR_DIM[track & 15];', 'return nativeTrackColors?.[track & 3]?.[1] ?? TRACK_COLOR_DIM[track & 3];')
    path.write_text(source)
    path = root / 'src/seq/set-session.ts'
    source = "import { syncNativeTrackColors } from './native-track-colors.js';\n" + path.read_text()
    source = replace_once(source, '        const active = readActiveSetAny();', '        const active = readActiveSetAny();\n        if (active && !active.provisional) syncNativeTrackColors(active.id.uuid, active.id.name);')
    path.write_text(source)
    path = root / 'src/app/resume.ts'
    source = "import { syncNativeTrackColors } from '../seq/native-track-colors.js';\nimport { readActiveSet } from '../seq/set-context.js';\n" + path.read_text()
    source = replace_once(source, "    mlog('resume from background');", "    mlog('resume from background');\n    const active = readActiveSet();\n    if (active) syncNativeTrackColors(active.uuid, active.name, true);")
    path.write_text(source)
    (root / 'browser-test/native-track-colors.mjs').write_text((integration / 'native-track-colors.mjs').read_text())
    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/native-track-colors.ts'),\n        resolve(root, 'src/keyboard/pad-palette.ts'),")
    path.write_text(source)

    path = root / 'browser-test/logic/tracks-refs.mjs'
    source = path.read_text()
    for index in ['4','6','15','n']:
        source = source.replace('TRACK_COLOR['+index+']', 'TRACK_COLOR[('+index+') & 3]')
        source = source.replace('TRACK_COLOR_DIM['+index+']', 'TRACK_COLOR_DIM[('+index+') & 3]')
    path.write_text(source)
