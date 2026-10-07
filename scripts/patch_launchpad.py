"""Install an opt-in external surface without replacing the Move input path."""
import base64
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_launchpad(root: Path) -> None:
    """Apply the adapter and its isolated lifecycle, preview, and pressure seams."""
    integration: Path = Path(__file__).resolve().parent.parent / "integration/launchpad"
    destination: Path = root / "src/surfaces"
    destination.mkdir(exist_ok=True)
    for filename in ("protocol.ts", "launchpad.ts", "controls.ts"):
        (destination / filename).write_text((integration / filename).read_text())
    (root / "browser-test/hb-launchpad.mjs").write_text((integration / "hb-launchpad.mjs").read_text())

    path: Path = root / "src/app/globals.ts"
    source: str = path.read_text()
    source = "import { onMidiMessageExternal } from '../surfaces/launchpad.js';\n" + source
    source = replace_once(source, "{ init, tick, onMidiMessageInternal,", "{ init, tick, onMidiMessageExternal, onMidiMessageInternal,")
    path.write_text(source)
    path = root / "src/app/tick.ts"
    source = "import { tickLaunchpad } from '../surfaces/launchpad.js';\n" + path.read_text()
    source = replace_once(source, "export function tick(): void {", "export function tick(): void {\n    tickLaunchpad();")
    path.write_text(source)
    path = root / "src/app/unload.ts"
    source = "import { unloadLaunchpad } from '../surfaces/launchpad.js';\n" + path.read_text()
    source = replace_once(source, "export function onUnload(): void {", "export function onUnload(): void {\n    unloadLaunchpad();")
    path.write_text(source)
    path = root / "src/seq/flags-def.ts"
    source = path.read_text()
    flag: str = """    { key: 'hblaunchpad', name: 'Launchpad', min: 0, max: 2, def: 0,
      labels: ['OFF', 'LEGACY', 'X'], release: true, uiOnly: true,
      hint: 'Dedicated HB input on USB channel 1.' },
"""
    position: int = source.index('\n];', source.index('export const FLAGS:'))
    source = source[:position] + '\n' + flag + source[position:]
    path.write_text(source)

    path = root / "src/keyboard/layouts.ts"
    source = replace_once(path.read_text(), "scaleIdx: number, base: number): Int16Array", "scaleIdx: number, base: number, rows = 4, firstRow = 0): Int16Array")
    source = replace_once(source, "new Int16Array(PAD_COUNT)", "new Int16Array(COLS * rows)")
    source = replace_once(source, "i < PAD_COUNT; i++", "i < map.length; i++")
    source = replace_once(source, "const row = (i / COLS) | 0;", "const row = ((i / COLS) | 0) + firstRow;")
    source = replace_once(source, "pitch = row ? -1 : degreeToPitch(base, degrees, col);", "pitch = row % 4 ? -1 : degreeToPitch(base, degrees, (row >> 2) * degrees.length + col);")
    path.write_text(source)
    path = root / "build/browser.mjs"
    source = replace_once(path.read_text(), "    entryPoints: [", "    entryPoints: [\n        resolve(root, 'src/surfaces/launchpad.ts'),\n        resolve(root, 'src/surfaces/protocol.ts'),\n        resolve(root, 'src/surfaces/controls.ts'),")
    path.write_text(source)

    # Share the exact existing color renderer, using a scoped external snapshot.
    path = root / "src/keyboard/harmony-pads.ts"
    source = replace_once(path.read_text(), "keyboardState, padMapFor }", "keyboardState, padMapFor as movePadMapFor }")
    source = "import { currentSetUuid } from '../seq/set-session.js';\nimport { previewPayload } from '../surfaces/protocol.js';\n" + source
    source = replace_once(source, "let snapshot: HarmonySnapshot | null = null;", """let snapshot: HarmonySnapshot | null = null;
type SurfacePreview = { notes: Int16Array; targets: number[]; rows: number[] };
let surfacePreview: SurfacePreview | null = null;
function padMapFor(track: number): Int16Array { return surfacePreview?.notes ?? movePadMapFor(track); }
/** Render another surface with the canonical colors; never change Move's mapping. */
export function withSurfacePreview<T>(track: number, view: HarmonySnapshot, preview: SurfacePreview, paint: () => T): T {
    const previous = { snapshot, watchedTrack, settings, requestedPads, surfacePreview };
    snapshot = view; watchedTrack = track; settings = view.settings;
    requestedPads = Array.from(preview.notes); surfacePreview = preview;
    try { return withHarmonyPadFrame(paint); }
    finally { ({ snapshot, watchedTrack, settings, requestedPads, surfacePreview } = previous); }
}""")
    source = replace_once(source, "export function pianoApproachTarget(track: number, index: number): number {", "export function pianoApproachTarget(track: number, index: number): number {\n    if (surfacePreview) return surfacePreview.targets[index] ?? -1;")
    source = replace_once(source, "return keyboardState.layout===3?index>>3:0;", "return surfacePreview ? surfacePreview.rows[index] ?? 0 : keyboardState.layout===3?index>>3:0;")
    source = replace_once(source, "function padRowBrightness(index:number,track:number):number{", "function padRowBrightness(index:number,track:number):number{\n    if(surfacePreview)return surfacePreview.targets[index]>=0?1/3:1;")
    source = replace_once(source, "let requestedPads: number[] = [];", """let requestedPads: number[] = [];
// Share only a successfully acquired, exact-geometry Move snapshot. This is
// bounded by Move's existing 50 ms polling period; no native state is cached.
let sharedMoveView: { track: number; set: string; geometry: string; at: number; view: HarmonySnapshot } | null = null;
export function matchingMovePreview(track: number, geometry: string, now: number): HarmonySnapshot | null {
    const cached = sharedMoveView;
    return !movePreviewFrozen && cached && cached.track === track && cached.set === currentSetUuid() &&
        cached.geometry === geometry && now >= cached.at && now - cached.at < 50 ? cached.view : null;
}""")
    source = replace_once(source, "    const raw = port.getParam('midi_fx1:pad_view');", """    sharedMoveView = null;
    const raw = port.getParam('midi_fx1:pad_view');""")
    source = replace_once(source, "        snapshot = next;", """        snapshot = next;
        // A failed geometry write must never lend a view for the new layout.
        if (raw && sentPreviewInputs === payload) sharedMoveView = {
            track, set: currentSetUuid(), at: now, view: next,
            geometry: previewPayload(requestedPads.map((pitch, index) => ({ pitch,
                target: targets[index], row: targets[index] >= 0 ? approachRowCode(index) : 0 })),
                keyboardState.layout === 2 || keyboardState.layout === 3),
        };""")
    path.write_text(source)

    # External raw notes must not masquerade as Move pads in the audio fast path.
    path = root / "engine/crates/movy-dsp/src/lib.rs"
    source = replace_once(path.read_text(), "len: c_int, _source: c_int)", "len: c_int, source: c_int)")
    source = replace_once(source, "        if len >= 3 {\n            let d1", "        if len >= 3 && source == MOVE_MIDI_SOURCE_INTERNAL {\n            let d1")
    path.write_text(source)
    path = root / "engine/crates/seq-core/src/command.rs"
    source = replace_once(path.read_text(), '| "non" | "nof"', '| "non" | "nof" | "npr"')
    source = replace_once(source, '        "non" => {', '''        "npr" => {
            if let (Some(track), Some(pitch), Some(value)) = (next(), next(), next()) {
                if (0..128).contains(&pitch) {
                    engine.live_poly_pressure(track as usize, pitch as u8, value.clamp(0, 127) as u8);
                }
            }
        }
        "non" => {''')
    path.write_text(source)

    # The same painter can target external LEDs without changing Move's cache.
    path = root / "src/renderer/hb-performance.ts"
    source = path.read_text()
    source = source.replace('if (!cancel && action.refs && --action.refs > 0) return;', 'if (action.refs && --action.refs > 0) return;')
    start = source.index('export function paintHbOperationKnobs(')
    end = source.index('\nconst namedLaneLights=', start)
    body = source[start:end].replace('values:Record<string,unknown>):void', 'values:Record<string,unknown>, paint:typeof cachedSetAnimLED=cachedSetAnimLED):void')
    body = body.replace('paintApproachKnobs(owner,keys);','paintApproachKnobs(owner,keys,paint);').replace('cachedSetAnimLED(', 'paint(')
    body = body.replace('    operationKnobMask=wanted;', '    if(paint!==cachedSetAnimLED)return;\n    operationKnobMask=wanted;')
    source = source[:start]+body+source[end:]
    path.write_text(source)
    path = root / "src/renderer/hb-approach.ts"
    source = path.read_text()
    start = source.index('export function paintApproachKnobs(')
    end = source.index('export function approachPanels(', start)
    body = source[start:end].replace('keys: (string | null)[]): boolean', 'keys: (string | null)[], paint:typeof cachedSetAnimLED=cachedSetAnimLED): boolean').replace('cachedSetAnimLED(', 'paint(')
    path.write_text(source[:start]+body+source[end:])

    path = root / "src/renderer/schwung-page.ts"
    source = "import { beginControlTouch } from '../surfaces/controls.js';\n" + path.read_text()
    source = replace_once(source, "const touchedAt=Date.now();lanePort.performanceSet(key,'Down');", "const release=beginControlTouch(lanePort,key);")
    source = source.replace("lanePort.performanceSet(key,cancel?'Cancel':'Up,'+Math.max(0,Date.now()-touchedAt));", "release(cancel);")
    source = replace_once(source, "lanePort.performanceSet(key,'Down');approachTouched(lanePort);markUiStateDirty();laneTouchSlots.add(slot);", "const release=beginControlTouch(lanePort,key);approachTouched(lanePort);markUiStateDirty();laneTouchSlots.add(slot);")
    source = replace_once(source, "laneTouchSlots.delete(slot);lanePort.performanceSet(key,'Up');", "laneTouchSlots.delete(slot);release();")
    source = replace_once(source, "const touchKey='approach_touch_'+approachKnob[1], touchedAt=Date.now();\n                lanePort.performanceSet(touchKey,'Down');", "const touchKey='approach_touch_'+approachKnob[1], release=beginControlTouch(lanePort,touchKey);\n                ")
    source = source.replace("lanePort.performanceSet(touchKey,cancel?'Cancel':'Up,'+Math.max(0,Date.now()-touchedAt));", "release(cancel);")
    path.write_text(source)

    path = root / "src/undo/verbs.ts"
    path.write_text(path.read_text().replace("'non', 'nof',", "'non', 'nof', 'npr',"))
    path = root / "browser-test/logic/flags.mjs"
    path.write_text(path.read_text().replace("'chtracks,chtrackset,hbsteprow'", "'chtracks,chtrackset,hbsteprow,hblaunchpad'"))

    for name in ("flags-release", "flags-scrolled"):
        (root / "browser-test/screenshots/baseline" / (name + ".png")).write_bytes(
            base64.b64decode((integration / (name + ".png.b64")).read_text()))
