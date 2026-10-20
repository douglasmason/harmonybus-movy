"""Reuse HB performance panels behind the Session button's four-mode cycle."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_session_modes(root: Path) -> None:
    """Move navigation off Copy while retaining legacy operation assignments."""
    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = path.read_text()
    source = source.replace("import { canCycleHbStepMode, cycleHbStepMode } from '../renderer/hb-performance.js';\nlet copyTap: { started: number; track: number; view: number } | null = null;", """import { setHbPerformanceMode, openHbPlayPanel } from '../renderer/hb-performance.js';
import { motifEditing } from '../renderer/hb-motif.js';
import { flagValue } from './flags.js';
import { seqToast } from './render.js';
import { schwungActiveFor } from '../renderer/schwung-grid.js';
import { schwungLibAvailable } from '../renderer/schwung-lib.js';

// Derive navigation from existing owners; no second persisted mode state.
export function sessionPlayMode(): number {
    return seqState.sessionMode ? 0 : jointEnabled() ? 3 : flagValue('hbsteprow') === 2 ? 2 : 1;
}
function advanceSessionMode(previous: number): void {
    let next = (previous + 1) % 4;
    if (next === 2 && schwungActiveFor(appState.activeTrack.index, 'midi_fx1')?.moduleId !== 'harmonybus') next = 3;
    if (next === 3 && (!jointAvailable() || !schwungLibAvailable())) next = 0;
    setJointEnabled(next === 3);
    setHbPerformanceMode(next === 2 ? 2 : 0);
    seqState.sessionMode = next === 0;
    if (next === 1 || next === 2) openHbPlayPanel(next === 2 ? 2 : 0);
    seqToast(['Clips', 'Normal Play', 'Motif Play', 'Joint Play'][next]);
}
let sessionPlayPrev = 0;""")
    source = replace_once(source, '            sessionPrev = seqState.sessionMode;', '            sessionPlayPrev = sessionPlayMode();\n            sessionPrev = seqState.sessionMode;')
    source = replace_once(source, "        } else if (momentaryUp(d1) === 'tap' && sessionPrev) {\n            seqState.sessionMode = false;\n            if (jointAvailable()) setJointEnabled(true); // Session -> Joint Play\n        }", """        } else if (momentaryUp(d1) === 'tap') {
            if (motifEditing()) {
                seqState.sessionMode = sessionPrev;
                seqToast('Finish motif edit first');
            } else advanceSessionMode(sessionPlayPrev);
        }""")
    start: int = source.index('    if (d1 === CC_COPY) {')
    end: int = source.index('    if (d1 === CC_DELETE)', start)
    source = source[:start] + """    if (d1 === CC_COPY) {
        dupCopyButton(d2 > 0);
        return true;
    }
""" + source[end:]
    source = source.replace('copyButton as dupCopyButton, dupUsed, dupActive', 'copyButton as dupCopyButton')
    source = source.replace('a clean tap latches (or\n     * toggles back to Note if already in Session)', 'a clean tap advances\n     * Clips / Normal / Motif / Joint')
    path.write_text(source)

    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text()
    start = source.index('    page.reload(true);', source.index('export function cycleHbStepMode'))
    source = source[:start] + "    openHbPlayPanel(next);\n}\n\nexport function openHbPlayPanel(next: number): void {\n    const page = schwungActiveFor(appState.activeTrack.index, 'midi_fx1');\n    if (!page || page.moduleId !== 'harmonybus') return;\n" + source[start:]
    source = source.replace("['Steps', 'Perform 1', 'Perform 2'][next]", "['Normal Play', 'Operator Play', 'Motif Play'][next]")
    path.write_text(source)
    path = root / 'src/renderer/hb-approach.ts'
    path.write_text(path.read_text().replace('Harm Play', 'Motif Play'))
    # Retain the internal enum for existing assignments and compatibility tests,
    # but do not expose a second mode selector in Settings.
    path = root / 'src/seq/flags-visible.ts'
    source = path.read_text().replace('    for (const f of FLAGS) {', "    for (const f of FLAGS) {\n        if (f.key === 'hbsteprow') continue;")
    path.write_text(source)
    path = root / 'browser-test/logic/flags.mjs'
    path.write_text(path.read_text().replace('chtracks,chtrackset,hbsteprow,hblaunchpad', 'chtracks,chtrackset,hblaunchpad').replace("eq('a debug build lists every flag', dbg.length, FLAGS.length);", "eq('debug also hides the legacy navigation flag', dbg.length, FLAGS.length - 1);"))

    path = root / 'src/renderer/schwung-page.ts'
    path.write_text(path.read_text().replace('export { beginHbLaneTouch,', 'export { cycleHbStepMode, beginHbLaneTouch,'))

    # Only row routing changes; touch knobs keep the existing Motif Play panels.
    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text().replace('import { jointActive }', 'import { jointActive, jointStepMode }')
    source = replace_once(source, '    if (releaseHbPerformanceStep(data)) return true;', '    if (releaseHbPerformanceStep(data)) return true;\n    if (jointActive() && jointStepMode() === 0) return false;')
    source = source.replace("if (jointActive() || flagValue('hbsteprow') === 2)", "if (jointActive() ? jointStepMode() === 2 : flagValue('hbsteprow') === 2)")
    source = replace_once(source, '    if (paintMotif(owner)) return true;', '    if (jointActive() && jointStepMode() === 0) return false;\n    if (paintMotif(owner)) return true;')
    source = source.replace("if(jointActive()||flagValue('hbsteprow')===2)", "if(jointActive()?jointStepMode()===2:flagValue('hbsteprow')===2)")
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = "import { jointActive, jointStepMode } from './joint-play.js';\n" + path.read_text()
    source = source.replace('if(motifEditing() || hbPerformancePage())return;', 'if(motifEditing() || (!(jointActive() && jointStepMode() === 0) && hbPerformancePage()))return;')
    path.write_text(source)

    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text().replace("import { jointPage } from '../seq/joint-panels.js';", "import { jointPerformancePort } from '../seq/joint-panels.js';")
    source = source.replace('const page=jointPage();syncApproachOwner(page);return page;', 'const page=jointPerformancePort();syncApproachOwner(page);return page;')
    path.write_text(source)
