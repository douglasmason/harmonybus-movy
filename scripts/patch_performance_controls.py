"""Keep performance controls focused and share host-owned drum gestures."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_performance_controls(root: Path) -> None:
    """Install visible harmony inspection and repair navigation ownership."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/performance-controls'
    (root / 'src/renderer/harmony-status.ts').write_text((assets / 'harmony-status.ts').read_text())
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = "import {harmonyStatusHierarchy} from './harmony-status.js';\n" + path.read_text()
    source = replace_once(source, '                    motifLoaderPanels(hierarchy);', '                    motifLoaderPanels(hierarchy);\n                    harmonyStatusHierarchy(hierarchy);')
    source = replace_once(source, "const nextKind = isFollower ? 'follower'", "const nextKind = ctl.page?.level==='harmony_status' ? 'harmony_status' : isFollower ? 'follower'")
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text().replace("const commonPanels = new Set(['root',", "const commonPanels = new Set(['root', 'harmony_status',")
    source = replace_once(source, "        if(key==='follower_this')return 500;", "        if(key==='harmony_status')return -1;\n        if(key==='follower_this')return 500;")
    path.write_text(source)
    path = root / 'src/renderer/panel-navigation.ts'
    path.write_text(replace_once(path.read_text(), "if(level==='root'||", "if(level==='root'||level==='harmony_status'||"))
    path = root / 'src/seq/hb-settings.ts'
    path.write_text(replace_once(path.read_text(), "const order=['follower_root'", "const order=['harmony_status','follower_root'"))

    # A performance view owns its own panel. Copying a hidden module panel
    # reloads dozens of pages synchronously and can turn a tap into a long hold.
    path = root / 'src/track/switch.ts'
    source = path.read_text().replace('import { clipsReturnPanel, rememberClipsReturn }', 'import { clipsReturnPanel, rememberClipsReturn, sessionPlayMode }')
    source = replace_once(source, '    if (appState.currentView !== VIEW_KNOBS || seqState.sessionMode) return null;', '    if (sessionPlayMode()>2 || appState.currentView !== VIEW_KNOBS || seqState.sessionMode) return null;')
    source = replace_once(source, '    appState.currentView = followModulePanel(track,', '    appState.currentView = sessionPlayMode()>2 ? prev.view : followModulePanel(track,')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text()
    source = replace_once(source, '            momentaryDown(d1, () => restoreTrackState(prev));\n            switchToTrack(track, prev);', '            switchToTrack(track, prev);\n            // Host/page loading time is not physical hold time.\n            momentaryDown(d1, () => restoreTrackState(prev));')
    # The chain view can show an ordinary hosted module after leaving HB.
    # Back must return to the input view instead of falling into unrelated slots.
    source = replace_once(source, "if(intent.action==='exit'&&spb.moduleId==='harmonybus'&&returnPreviousInputView())return;", "if(intent.action==='exit'&&returnPreviousInputView())return;")
    path.write_text(source)
    path = root / 'src/seq/track-select.ts'
    path.write_text(replace_once(path.read_text(), '    momentaryDown(STEP_PEEK, () => restoreTrackState(prev));\n    switchToTrack(step, prev);', '    switchToTrack(step, prev);\n    momentaryDown(STEP_PEEK, () => restoreTrackState(prev));'))

    # Reuse the existing dfire command. The note belongs to the assignment,
    # never to the currently selected melody lane or the Joint actor fan-out.
    path = root / 'src/seq/clip-page.ts'
    source = path.read_text().replace('export function triggerDrumFill(track:number):void {', 'export function triggerDrumFill(track:number,pitch=seqState.watchLane):void {')
    marker: str = '    const pitch=seqState.watchLane;\n'
    assert source.count(marker) == 1
    source = source.replace(marker, '', 1)
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = "import {chordActive,chordOperationOwner} from '../seq/chord-play.js';\nimport {triggerDrumFill} from '../seq/clip-page.js';\nimport {drumOutputTrack} from '../seq/drum-output.js';\n" + path.read_text()
    source = replace_once(source, 'export function hbPerformancePage(): PerformancePort | null {', 'export function hbPerformancePage(): PerformancePort | null {\n    if(chordActive())return performanceViewAvailable()?chordOperationOwner():null;')
    source = replace_once(source, "if (jointActive() ? jointStepMode() === 2 : flagValue('hbsteprow') === 2)", "if (!chordActive() && (jointActive() ? jointStepMode() === 2 : flagValue('hbsteprow') === 2))")
    source = replace_once(source, "if(jointActive()?jointStepMode()===2:flagValue('hbsteprow')===2)", "if(!chordActive() && (jointActive()?jointStepMode()===2:flagValue('hbsteprow')===2))")
    source = source.replace("write('movy-clip-v2')", "write('movy-clip-v3')")
    source = replace_once(source, '    if(drawMotif())return;', '    drawMotif();')
    source = source.replace('    knob?: boolean;', '    oneShot?: boolean; knob?: boolean;')
    source = replace_once(source, '    invalidateLaneLights(action.owner);', '    invalidateLaneLights(action.owner);\n    if(action.oneShot)return;')
    source = replace_once(source, '    invalidateLaneLights(owner);owner.performanceSet(commandKey,', '    action.oneShot=binding[0]===66;\n    if(action.oneShot)triggerDrumFill(drumOutputTrack(),binding[1]);\n    else {invalidateLaneLights(owner);owner.performanceSet(commandKey,')
    source = replace_once(source, " : 'On');\n    if (paintedOwner", " : 'On');}\n    if (paintedOwner")
    source = replace_once(source, "    seqToast('Slot ' + (step + 1));", "    if(!action.oneShot)seqToast('Slot ' + (step + 1));")
    source = replace_once(source, '        invalidateLaneLights(owner);owner.performanceSet(action.key,', '        action.oneShot=valid&&binding[0]===66;\n        if(action.oneShot)triggerDrumFill(drumOutputTrack(),binding[1]);\n        else {invalidateLaneLights(owner);owner.performanceSet(action.key,')
    source = replace_once(source, " : 'Touch');\n    }\n    action.refs", " : 'Touch');}\n    }\n    action.refs")
    path.write_text(source)
    path = root / 'src/seq/chord-play.ts'
    source = path.read_text().replace('import {beginHbLaneTouch}', 'import {beginHbLaneTouch,paintHbPerformance}')
    source = source.replace('Chord>Core ', 'Chord>Cond ')
    source = source.replace('function conductorTrackForQueue():number {return setup.conductor;}', 'function conductorTrackForQueue():number {return conductorTrack();}')
    source = replace_once(source, 'export function paintChordSteps():boolean{', '''export function chordOperationOwner():PerformancePort|null {
    if(!chordActive()||!page||page.ctl.hbNavigation?.isMenu())return null;
    for(const key of page.ctl.page?.keys??[]){
        const target=alias(key)??{track:appState.activeTrack.index,key};
        if(/^motion_control_\\d+$/.test(target.key))return performanceOwner(target.track);
    }
    return null;
}
export function paintChordSteps():boolean{
    const operationOwner=chordOperationOwner();if(operationOwner)return paintHbPerformance(operationOwner);''')
    path.write_text(source)
    # Native clip polling must not downgrade the UI's capability handshake.
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    if path.exists():
        path.write_text(path.read_text().replace('movy-clip-v2', 'movy-clip-v3'))
    for filename in ('engine/crates/movy-dsp/src/lib.rs','src/seq/constants.ts'):
        path = root / filename
        path.write_text(path.read_text().replace('0.78.0-drum-gesture1','0.80.0-chord-queue2'))
    for filename in ('hb-performance-controls.mjs',):
        (root / 'browser-test' / filename).write_text((assets / filename).read_text())
    for name in ('hb-chord-range.mjs','hb-navigation-lights.mjs'):
        (root / 'browser-test' / name).write_text((assets.parent / 'chord-play' / name).read_text())
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/renderer/hb-performance.ts'),"))
