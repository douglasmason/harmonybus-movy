"""Make the motif editor a contextual destination of a performance lane."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_motif_lanes(root: Path) -> None:
    """Connect both Record entry points and use one native pulse channel."""
    path: Path = root / 'src/renderer/hb-motif.ts'
    source: str = path.read_text()
    source = source.replace('cachedSetAnimLED, seqLedsInvalidate', 'cachedSetAnimLED, cachedSetAnimButtonLED, seqLedsInvalidate')
    source = source.replace('interface MotifPort extends PerformancePort { readonly ctl?: any; }', '''interface MotifPort extends PerformancePort { readonly ctl?: any; }
let editorPort: MotifPort | null = null;
let editorLane = -1;
let recordRelease = false;
export function motifEditorFor(track: number | undefined): boolean {
    return editorPort !== null && editorPort.performanceTrack === track;
}
export function motifRecordButton(down: boolean): boolean {
    if (!down && recordRelease) { recordRelease=false; return true; }
    if (!editorPort || editorPort.performanceTrack !== appState.activeTrack.index) return false;
    if (down) { recordRelease=true; motifAction(editorPort,'motif_record'); }
    return true;
}
export function motifRecordLight(): boolean {
    if (!motifEditorFor(appState.activeTrack.index)) return false;
    cachedSetAnimButtonLED(86, 0, owner ? 127 : 40, ANIM_PULSE_SLOW);
    return true;
}
export function motifKnobLight(port: PerformancePort, knob: number): boolean {
    if (!motifEditorFor(port.performanceTrack) || knob !== editorLane % 8) return false;
    cachedSetAnimLED(knob, 22, owner ? 127 : 118, ANIM_PULSE_SLOW);
    cachedSetAnimLED(71+knob, 22, owner ? 127 : 118, ANIM_PULSE_SLOW, true);
    return true;
}
function motifLaneLight(button: number): boolean {
    if (!motifEditorFor(appState.activeTrack.index) || button !== editorLane) return false;
    cachedSetAnimLED(16+button, 22, owner ? 127 : 118, ANIM_PULSE_SLOW);
    return true;
}''')
    source = source.replace('return owner !== null;', 'return owner !== null || editorPort !== null;')
    source = source.replace('if (!cancel && row[0] >= 0) return;', "if (!cancel && row[0] >= 0) {seqToast(status);return;}")
    source = replace_once(source, 'export function motifAction(port: MotifPort, key: string): boolean {', '''export function motifAction(port: MotifPort, key: string): boolean {
    if (key==='motif_edit') {
        if(owner||seqState.recording||seqState.countingIn||seqState.stepAutoMode){seqToast('Finish recording/edit');return true;}
        port.performanceSet('motif_edit','Open');
        const lane=Number(port.performanceGet('motif_lane'))-1;
        if(!Number.isInteger(lane)||lane<0||lane>=16){seqToast('Choose Play Motif');return true;}
        editorPort=port;editorLane=lane;viewOwner=null;
        markUiStateDirty();seqLedsInvalidate();appState.dirty=true;return true;
    }
    if (key==='motif_close') {
        if(owner){seqToast('Done or Cancel first');return true;}
        editorPort?.performanceSet('motif_close','Close');editorPort=null;editorLane=-1;
        markUiStateDirty();seqLedsInvalidate();appState.dirty=true;return true;
    }
    if(key==='motif_duplicate'){
        if(owner)return true;
        port.performanceSet('motif_duplicate','Duplicate');
        const draft=port.performanceGet('motif_row').split(',').map(Number);
        if(draft[0]>=0)return motifAction(port,'motif_record');
        seqToast(port.performanceGet('motif_status'));return true;
    }''')
    source = source.replace("if (row[0] < 0) {owner=null;return true;}", "if (row[0] < 0) {seqToast(status);owner=null;return true;}")
    source = source.replace("return !!port && flagValue('hbsteprow') === 2;", 'return !!port && motifEditorFor(port.performanceTrack);')
    # Library selection belongs to the operation selector. The step row is the
    # native note/rest/tie destination only while recording.
    start: int = source.index('    if(!motifPage(port)||!port)return false;', source.index('export function motifStep'))
    end: int = source.index('\n}', start)
    source = source[:start] + '    return motifPage(port);' + source[end:]
    source = source.replace('            const step=pageOffset*16+button,kind=row[6+step]??0;', '            if(motifLaneLight(button))continue;\n            const step=pageOffset*16+button,kind=row[6+step]??0;')
    source = source.replace('    const occupied=values[4]??0,armed=values[3]??-1,selected=values[1]??0;', '    const anchor=values[5]??-1;')
    source = source.replace('        const color=armed===step?13:selected===step?TRACK_COLOR[appState.activeTrack.index]:(occupied&(1<<step))?85:C_BLACK;', '        if(motifLaneLight(step))continue;\n        const kind=values[6+step];\n        const color=step===anchor?13:kind===4?25:kind===3?C_DARKGREY:kind?22:C_BLACK;')
    source = source.replace("    if(!owner){\n        if(viewRow[0]", "    if(!owner){\n        if(motifEditorFor(appState.activeTrack.index)){fill_rect(0,0,128,8,1);fontPrint(1,1,'Lane '+(editorLane+1)+' · Play Motif',0);return true;}\n        if(viewRow[0]")
    source = source.replace('fontPrint(1,1,status,0);return true;', "fontPrint(1,1,editorPort?'Recording · Lane '+(editorLane+1):status,0);return true;")
    source = source.replace('viewRow=[];viewStatus=\'\';motifFinish(true);', "viewRow=[];viewStatus='';motifFinish(true);editorPort?.performanceSet('motif_close','Close');editorPort=null;editorLane=-1;recordRelease=false;")
    # Changing tracks commits a valid draft, preserves a rejected one, and
    # restores normal recording ownership on the new track.
    source = source.replace('export function paintMotif(port: MotifPort | null): boolean {', '''export function paintMotif(port: MotifPort | null): boolean {
    if(editorPort&&editorPort.performanceTrack!==appState.activeTrack.index){
        if(owner)motifFinish();
        if(owner){seqToast('Motif draft retained');detachMotif();}
        editorPort.performanceSet('motif_close','Close');editorPort=null;editorLane=-1;
        seqLedsInvalidate();appState.dirty=true;return false;
    }''')
    path.write_text(source)

    path = root / 'src/seq/router.ts'
    source = "import { motifRecordButton } from '../renderer/hb-motif.js';\n" + path.read_text()
    source = replace_once(source, '    if (d1 === CC_REC) {', '    if (d1 === CC_REC) {\n        if(motifRecordButton(d2 > 0))return true;')
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = "import { motifRecordLight } from '../renderer/hb-motif.js';\n" + path.read_text()
    source = replace_once(source, '    cachedSetButtonLED(CC_REC,', '    if(!motifRecordLight())cachedSetButtonLED(CC_REC,')
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = "import { motifKnobLight, motifEditorFor } from './hb-motif.js';\n" + path.read_text()
    source = source.replace('Math.min(2, Math.round(value))','Math.min(1, Math.round(value))').replace("(flagValue('hbsteprow') + 1) % 3", "(flagValue('hbsteprow') + 1) % 2")
    source = source.replace("const key = next === 2 ? 'motif_slot' : next === 1 ? 'motion_control_1' : 'version';", "const key = next === 1 ? 'motion_control_1' : 'version';")
    source = source.replace("['Steps', 'HB Ops', 'Motifs'][next]", "['Steps', 'Perform'][next]")
    source = source.replace('    const wanted=assignments.reduce', '    let wanted=assignments.reduce')
    source = source.replace('        const bit=1<<knob,lane=assignments[knob];', '        const bit=1<<knob,lane=assignments[knob];\n        if(motifKnobLight(owner,knob)){wanted|=bit;nextState+=\'|motif\';continue;}')
    path.write_text(source)
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text().replace("labels: ['STEPS','HB OPS','MOTIFS']", "labels: ['STEPS','PERFORM']").replace("min: 0, max: 2, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps, HB Ops, Motifs.'", "min: 0, max: 1, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps or Perform.'")
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text().replace('mode: number): any', 'mode: number, editing = false): any').replace('motifs.has(key) ? mode === 2', 'motifs.has(key) ? editing')
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text().replace("import { motifAction }", "import { motifAction, motifEditorFor }")
    source = source.replace("['Steps','HB Ops','Motifs']", "['Steps','Perform']")
    source = source.replace("v === 'Motifs' || v === '2' ? 2 : v === 'HB Ops' || v === 'Perform' || v === '1' ? 1 : 0", "v === 'Perform' || v === '1' ? 1 : 0")
    source = source.replace("hbStepHierarchy(hierarchy, flagValue('hbsteprow'))", "hbStepHierarchy(hierarchy, flagValue('hbsteprow'), motifEditorFor(port.track.index))")
    source = replace_once(source, "if (key.startsWith('motif_') && motifAction(motifPort,key)) {\n                touchActions.set(slot,key);return;", """if (key.startsWith('motif_') && motifAction(motifPort,key)) {
                touchActions.set(slot,key);
                if(key==='motif_edit'||key==='motif_close'){
                    reload();const target=motifEditorFor(port.track.index)?'motif_record':'motion_operation';
                    const page=ctl.pages.findIndex((candidate: any)=>candidate.keys?.includes(target));
                    if(page>=0)ctl.goToPage(page);
                }else ctl.revalue();
                return;""")
    path.write_text(source)
