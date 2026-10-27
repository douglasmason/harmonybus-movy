"""Place keyboard notes horizontally while preserving their harmonic context."""
from pathlib import Path

from patch_responsive_persistence import replace_once


def patch_pad_position(root: Path) -> None:
    """Patch the shared geometry, input owner, persistence and note ledger."""
    assets: Path = Path(__file__).resolve().parent.parent / "integration/pad-position"
    path: Path = root / "src/seq/pad-position.ts"
    path.write_text((assets / "pad-position.ts").read_text())
    path = root / "build/browser.mjs"
    source: str = replace_once(path.read_text(), "    entryPoints: [", "    entryPoints: [\n        resolve(root, 'src/seq/pad-position.ts'),")
    path.write_text(source)

    path = root / "src/keyboard/layouts.ts"
    source = path.read_text()
    source = replace_once(source, "firstRow = 0): Int16Array", "firstRow = 0, columnOffset = 0): Int16Array")
    source = replace_once(source, "const col = i % COLS;", "const col = i % COLS - columnOffset;")
    source = replace_once(source, "const off = (row & 1) ? PIANO_BLACK[col] : PIANO_WHITE[col];\n            pitch = off < 0 ? -1 : base + (row >> 1) * 12 + off;", """const white = degreeToPitch(base + (row >> 1) * 12, PIANO_WHITE.slice(0, 7), col);
            pitch = row & 1 ? (pianoGapColumn(col) ? -1 : white - 1) : white;""")
    source = replace_once(source, "const PIANO_BLACK = [-1, 1, 3, -1, 6, 8, 10, -1];", """/** Piano gaps follow the shifted white-key sequence, including negative columns. */
export function pianoGapColumn(column: number): boolean {
    const phase = ((column % 7) + 7) % 7;
    return phase === 0 || phase === 3;
}""")
    source = source.replace("const PIANO_WHITE = [0, 2, 4, 5, 7, 9, 11, 12];", "const PIANO_WHITE = [0, 2, 4, 5, 7, 9, 11];")
    source = source.replace("PIANO_WHITE.slice(0, 7)", "PIANO_WHITE")
    path.write_text(source)

    path = root / "src/keyboard/state.ts"
    source = path.read_text()
    source = replace_once(source, "export const OCT_MIN = 0;", "export const COLUMN_OFFSET_MIN = -7;\nexport const COLUMN_OFFSET_MAX = 7;\nexport const OCT_MIN = 0;")
    source = replace_once(source, "    rootPc: 0,", "    columnOffset: 0,          /* positive moves notes right; shared by surfaces */\n    rootPc: 0,")
    source = replace_once(source, "keyboardState.scale + ':' + base;", "keyboardState.scale + ':' + base + ':' + keyboardState.columnOffset;")
    source = replace_once(source, "keyboardState.scale, base);", "keyboardState.scale, base, 4, 0, keyboardState.columnOffset);")
    path.write_text(source)

    path = root / "src/seq/ui-state.ts"
    source = path.read_text().replace("resetOctaves, OCT_MIN", "resetOctaves, COLUMN_OFFSET_MIN, COLUMN_OFFSET_MAX, OCT_MIN")
    source = replace_once(source, "        rootPc: keyboardState.rootPc,", "        rootPc: keyboardState.rootPc,\n        columnOffset: keyboardState.columnOffset,")
    source = replace_once(source, "        keyboardState.scale  =", "        keyboardState.columnOffset = clampInt(o.columnOffset, COLUMN_OFFSET_MIN, COLUMN_OFFSET_MAX, 0);\n        keyboardState.scale  =")
    source = replace_once(source, "    keyboardState.rootPc = 0;", "    keyboardState.columnOffset = 0;\n    keyboardState.rootPc = 0;")
    path.write_text(source)

    path = root / "src/seq/router.ts"
    source = "import { padPositionMidi } from './pad-position.js';\n" + path.read_text()
    source = replace_once(source, "    if (jointMidi(data)) return true;", "    if (jointMidi(data)) return true;\n    if (padPositionMidi(data)) return true;")
    path.write_text(source)

    path = root / "src/seq/leds.ts"
    source = "import { padPositionActive, canShiftPadPosition } from './pad-position.js';\nimport { clipsSurfaceActive } from './clips-view.js';\n" + path.read_text()
    source = source.replace("import {chordActive,chordPage}", "import {chordPadModalActive}")
    source = replace_once(source, """    if (!settingsActive() && chordActive()) {
        const navigation=chordPage().ctl.hbNavigation;
        cachedSetButtonLED(CC_LEFT,navigation?.canMove(-1)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_RIGHT,navigation?.canMove(1)?WHITE_DIM:WHITE_OFF);""", """    if (clipsSurfaceActive()) {
        cachedSetButtonLED(CC_LEFT,groupArrowColor(-1));
        cachedSetButtonLED(CC_RIGHT,groupArrowColor(1));
    } else if (chordPadModalActive()) {
        cachedSetButtonLED(CC_LEFT,WHITE_OFF);cachedSetButtonLED(CC_RIGHT,WHITE_OFF);
    } else if (padPositionActive()) {
        cachedSetButtonLED(CC_LEFT,canShiftPadPosition(-1)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_RIGHT,canShiftPadPosition(1)?WHITE_DIM:WHITE_OFF);""")
    path.write_text(source)

    path = root / "src/seq/chord-play.ts"
    source = path.read_text()
    source = replace_once(source, "export function chordMidi(data:number[],panels=true,surface?:SchwungPage):boolean{", """/** Modal reviews consume pad presses, unlike the ordinary settings panels. */
export function chordPadModalActive():boolean {
    return controlsActive() && (partModalActive() || motifLoaderActive(performanceOwner(conductorTrack())));
}
export function chordMidi(data:number[],panels=true,surface?:SchwungPage):boolean{""")
    source = replace_once(source, "if(key===14||key===62||key===63){if(key===14||value)current.changePage(key===62?-1:key===63?1:value<64?value:value-128);appState.dirty=true;return true;}", "if(key===14){current.changePage(value<64?value:value-128);appState.dirty=true;return true;}")
    path.write_text(source)

    path = root / "src/seq/joint-play.ts"
    source = path.read_text()
    source = replace_once(source, "approach: boolean, below: boolean):", "approach: boolean, below: boolean, columnOffset = 0):")
    source = replace_once(source, "scale,bases[role],rows);", "scale,bases[role],rows,0,columnOffset);")
    source = replace_once(source, "buildSurfaceCells(notes,actualLayout,mode===0)", "buildSurfaceCells(notes,actualLayout,mode===0,columnOffset)")
    source = replace_once(source, "settings,keyboardState.scale,keyboardState.rootPc,", "settings,keyboardState.scale,keyboardState.rootPc,keyboardState.columnOffset,")
    source = replace_once(source, "        false,belowHeld||belowLatch);", "        false,belowHeld||belowLatch,keyboardState.columnOffset);")
    path.write_text(source)

    path = root / "src/surfaces/protocol.ts"
    source = "import { pianoGapColumn } from '../keyboard/layouts.js';\n" + path.read_text()
    source = replace_once(source, "piano: boolean): SurfaceCell[]", "piano: boolean, columnOffset = 0): SurfaceCell[]")
    source = replace_once(source, "[0, 3, 7].includes(column)", "pianoGapColumn(column - columnOffset)")
    path.write_text(source)

    path = root / "src/surfaces/launchpad.ts"
    source = path.read_text()
    source = replace_once(source, "keyboardState.scale, baseNoteFor(selected)].join", "keyboardState.scale, baseNoteFor(selected), keyboardState.columnOffset].join")
    source = replace_once(source, "surfaceFirstRow(keyboardState.layout));", "surfaceFirstRow(keyboardState.layout), keyboardState.columnOffset);")
    source = replace_once(source, "isPianoLayout(keyboardState.mode, keyboardState.layout));", "isPianoLayout(keyboardState.mode, keyboardState.layout), keyboardState.columnOffset);")
    path.write_text(source)

    path = root / "src/keyboard/harmony-pads.ts"
    source = path.read_text().replace("isPianoLayout, LAYOUT_APPROACH", "isPianoLayout, pianoGapColumn, LAYOUT_APPROACH")
    source = replace_once(source, "![0,3,7].includes(index % 8)", "!pianoGapColumn(index % 8 - keyboardState.columnOffset)")
    source = replace_once(source, "keyboardState.layout,trackColor(track)", "keyboardState.layout,keyboardState.columnOffset,trackColor(track)")
    source = replace_once(source, "let polledAt = -Infinity;", """let polledAt = -Infinity;
/** Discard only position-dependent feedback; keep the bounded native poll cadence. */
export function invalidateHarmonyPadGeometry(): void {
    sharedMoveView = null;
    if (snapshot) snapshot = { ...snapshot, targets: undefined, gapColors: undefined,
        outputGroups: undefined, playPads: 0, nextPulsePads: 0, nextRanks: undefined };
}""")
    path.write_text(source)

    # Map edits preserve held input; target changes still terminate the old owner.
    path = root / "engine/crates/movy-dsp/src/pad_route.rs"
    source = replace_once(path.read_text(), "    pub fn active(&self) -> bool {", "    pub fn owner(&self) -> i32 { self.chain }\n\n    pub fn active(&self) -> bool {")
    path.write_text(source)
    path = root / "engine/crates/movy-dsp/src/lib.rs"
    source = replace_once(path.read_text(), '            "padmap" => {\n                if !self.pads.set_map(val)', '            "padmap" => {\n                let previous_owner = self.pads.owner();\n                if !self.pads.set_map(val)')
    source = replace_once(source, "                } else {\n                    // Anything still held belonged to the previous routing.", "                } else if self.pads.owner() != previous_owner {\n                    // Geometry changes preserve onset ownership; leaving the owner releases it.")
    path.write_text(source)

    # Tests exercise the real input and lighting paths, not a second implementation.
    path = root / "browser-test/hb-pad-position.mjs"
    path.write_text((assets / "hb-pad-position.mjs").read_text())

    # Show the resolved destination separately from editable input coordinates.
    # Reading the existing footer snapshot adds no native polling or key mapping.
    path = root / "src/renderer/hb-footer.ts"
    source = path.read_text()
    source = replace_once(source, "export function harmonyFooterText(", """/** Parent key already resolved by HB, including Key Center and Parallel. */
export function parentKeyLabel(data?:readonly number[]):string {
    if(!data)return '';
    const [key,scale]=data;
    const raw=scale===-1?'Blues':scale===0?'Custom':FOLLOWER_SCALE_NAMES[scale-1]??'Custom';
    const label=raw.replace('Natural Minor','Min').replace('Major','Maj').replace('Minor','Min')
        .replace('Half-Whole Diminished','DimH-W').replace('Whole-Half Diminished','DimW-H').replace(/ /g,'');
    return roots[key]+' '+label;
}
export function harmonyFooterText(""")
    source = replace_once(source, "    const raw=scale===-1?'Blues':scale===0?'Custom':FOLLOWER_SCALE_NAMES[scale-1]??'Custom';\n    const label=raw.replace('Natural Minor','Min').replace('Major','Maj').replace('Minor','Min').replace(/ /g,'');", "    const parent=parentKeyLabel(data);")
    source = replace_once(source, "[prefix+' '+roots[key]+' '+label,prefix,roots[key]]", "[prefix+' '+parent,prefix,roots[key]]")
    path.write_text(source)

    path = root / "src/seq/joint-play.ts"
    source = replace_once(path.read_text(), "export function jointActive(): boolean {return enabled && !seqState.sessionMode && jointAvailable();}", """export function jointActive(): boolean {return enabled && !seqState.sessionMode && jointAvailable();}
/** All actors share the parent key; use their existing bounded preview cache. */
export function jointParentKeySnapshot(): readonly number[] | undefined {
    return jointActive() ? actors.find(actor => actor.view?.footer)?.view?.footer : undefined;
}""")
    path.write_text(source)

    path = root / "src/seq/main-page.ts"
    source = "import { setPadPosition } from './pad-position.js';\n" + path.read_text()
    source = source.replace("K_LAYOUT", "K_POSITION")
    source = replace_once(source, "    if (k === K_POSITION) return;\n    mainPageState.touchedKnob = down ? k : -1;", """    if (k === K_POSITION && down && appState.shiftHeld) {
        accum[k] = 0;
        setPadPosition(0);
    }
    mainPageState.touchedKnob = down ? k : -1;""")
    source = replace_once(source, "    if (k === K_POSITION) return;", """    if (k === K_POSITION && appState.shiftHeld) {
        mainPageState.touchedKnob = k;
        accum[k] = 0;
        setPadPosition(0);
        return;
    }""")
    source = replace_once(source, "    if (n === 0) return;", """    if (n === 0) return;
    if (k === K_POSITION) { setPadPosition(keyboardState.columnOffset + n); return; }""")
    path.write_text(source)

    path = root / "src/seq/main-page-vm.ts"
    source = """import { padPositionLabel } from './pad-position.js';
import { appState } from '../app/state.js';
import { harmonyFooterSnapshot } from '../keyboard/harmony-pads.js';
import { parentKeyLabel } from '../renderer/hb-footer.js';
import { jointActive, jointParentKeySnapshot } from './joint-play.js';
""" + path.read_text()
    source = source.replace("import { keyboardState }", "import { keyboardState, COLUMN_OFFSET_MIN, COLUMN_OFFSET_MAX }")
    source = replace_once(source, "shortName: 'ROOT', fullName: 'Root'", "shortName: 'IN ROOT', fullName: 'Input Root'")
    source = replace_once(source, "shortName: 'KEY', fullName: 'Key'", "shortName: 'IN SCL', fullName: 'Input Scale'")
    source = replace_once(source, "const layout = cell({shortName:'MORE ->',fullName:'Turn jog dial: more panels',renderStyle:'preset',displayValue:'JOG DIAL',normalizedValue:0});", """const layout = cell({
        shortName: 'POS', fullName: 'Pos / Shift: Reset', renderStyle: 'preset',
        displayValue: padPositionLabel(),
        normalizedValue: (keyboardState.columnOffset - COLUMN_OFFSET_MIN) / (COLUMN_OFFSET_MAX - COLUMN_OFFSET_MIN),
    });
    const parent = parentKeyLabel(jointActive() ? jointParentKeySnapshot() : harmonyFooterSnapshot(appState.activeTrack.index));""")
    source = replace_once(source, "headerOverride: ['SET PARAMS'", "headerOverride: [parent ? 'PARENT ' + parent : 'SET PARAMS'")
    path.write_text(source)

    path = root / "browser-test/hb-pad-settings.mjs"
    source = path.read_text().replace("displayValue,'JOG DIAL'", "displayValue,'Default'").replace("shortName,'MORE ->'", "shortName,'POS'")
    path.write_text(source)

    path = root / "browser-test/logic/params-pages.mjs"
    source = path.read_text().replace("vm.rows[1][3].displayValue, 'JOG DIAL'", "vm.rows[1][3].displayValue, 'Default'")
    source = replace_once(source, "keyboardState.rootPc = 0; keyboardState.scale = 0; // C, Major", "keyboardState.rootPc = 0; keyboardState.scale = 0; keyboardState.columnOffset = 0; // C, Major, default position")
    source = source.replace("more panels are discoverable", "pad position is visible")
    source = source.replace("unused knob does not change layout", "position knob does not change layout").replace("unused knob opens no overlay", "position knob opens no overlay")
    path.write_text(source)

    path = root / "browser-test/logic/seq-router.mjs"
    source = path.read_text()
    source = replace_once(source, "    // Bar navigation: Right advances the visible bar (clip is 1 bar long, so\n    // one extra empty bar is reachable), with a toast; clamps at the end.", """    // Note-play arrows shift the keyboard, even with a clip in view.
    keyboardState.columnOffset = 0;
    seqHandleMidi([0xB0, 63, 127], false);
    eq('Right arrow moves notes right', keyboardState.columnOffset, 1);
    seqHandleMidi([0xB0, 62, 127], false);
    eq('Left arrow restores notes', keyboardState.columnOffset, 0);

    // Explicit bar navigation still reaches one extra empty bar and clamps.
    const { navigateBar } = await import('../../dist/esm/seq/router-steps.js');""")
    source = replace_once(source, "    eq('Right arrow claimed (engine ready)', seqHandleMidi([0xB0, 63, 127], false), true);", "    navigateBar(1);")
    source = replace_once(source, "    seqHandleMidi([0xB0, 63, 127], false);     // clamp: max is 1 for a 1-bar clip", "    navigateBar(1);     // clamp: max is 1 for a 1-bar clip")
    source = replace_once(source, "    seqHandleMidi([0xB0, 62, 127], false);     // Left", "    navigateBar(-1);")
    source = replace_once(source, "    // Arrows fall through to existing nav when the engine is NOT ready.", "    // Keyboard placement does not require the audio engine.")
    source = replace_once(source, "    eq('Right arrow NOT claimed without engine', seqHandleMidi([0xB0, 63, 127], false), false);", """    eq('Right arrow claimed without engine', seqHandleMidi([0xB0, 63, 127], false), true);
    eq('Right arrow shifts without engine', keyboardState.columnOffset, 1);
    keyboardState.columnOffset = 0;""")
    path.write_text(source)
