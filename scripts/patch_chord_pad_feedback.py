"""Give Chord Play and mode handoffs an acknowledged, complete pad frame."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_chord_pad_feedback(root: Path) -> None:
    """Reuse every mode's painter ahead of competing knob and button traffic."""
    path: Path = root / 'src/app/tick.ts'
    source: str = path.read_text()
    source = replace_once(source, 'let paintedModeRevision=0;', 'let paintedModeRevision=0;\nlet padSweepPending=false;')
    source = replace_once(source, 'export function tick(): void {', 'export function tick(): void {\n    ledFrameReset();')
    source = replace_once(source, 'paintedModeRevision=inputModeLedRevision;invalidateLedCachesOnResume();', 'paintedModeRevision=inputModeLedRevision;invalidateLedCachesOnResume();padSweepPending=true;')
    source = replace_once(source, '    tickFm1();', '    if(padSweepPending||chordActive())paintPriorityPads();\n    tickFm1();')
    source = replace_once(source, '    ledFrameReset();\n    if(globalThis.overtakeParked!==true)seqBeatLedsTick();', '    // The shared LED budget starts before mode feedback, once per app tick.\n    if(globalThis.overtakeParked!==true)seqBeatLedsTick();')
    source = replace_once(source, 'export function paintMelodicPads(): void {', 'export function paintMelodicPads(force=false): boolean {\n    if(force)chromaticCache.fill(255);')
    for mode in ('Grid', 'Field', 'JointPads'):
        source = replace_once(source, 'paint'+mode+'();return;', 'return paint'+mode+'(force);')
    source = replace_once(source, '    withHarmonyPadFrame(()=>{', '    return withHarmonyPadFrame(()=>{')
    source = replace_once(source, 'for(const change of sendPadLedFrame(changes))chromaticCache[change.index]=change.color;', 'for(const change of sendPadLedFrame(changes))chromaticCache[change.index]=change.color;\n        return changes.every(change=>chromaticCache[change.index]===change.color);')
    source += '''
/** Pad delivery precedes control feedback; a rejected sweep stays pending. */
function paintPriorityPads():void {
    if(globalThis.overtakeParked===true||!sessionReady())return;
    if(seqState.sessionMode){
        // Clips already paints its 32-pad grid before its controls.
        seqLedsTick(appState.shiftHeld,appState.currentView,seqState.barOffset,maxBarOffset(),false);
        padSweepPending=false;return;
    }
    const track=appState.activeTrack.index,synth=appState.trackModels[track]?.[1];
    const isDrum=(synth?.getDrumPadCount()??0)>0;
    let complete=false;
    if(isDrum&&!gridActive()&&!fieldActive()&&!jointActive()){
        const config=synth!.getDrumConfig();if(!config)return;
        const selected=synth!.getDrumCurrentPhysPad();
        if(padSweepPending)drumCache.fill(255);
        const changes=Array.from({length:32},(_,index)=>{
            const note=PAD_MIN+index,pitch=drumNoteOfPhys(note,PAD_MIN,config);
            return {index,note,color:drumPadLedColor(note,PAD_MIN,config,selected,track,pitch>=0&&(activeHasNote(track,pitch)||isSounding(note)))};
        }).filter(change=>drumCache[change.index]!==change.color);
        for(const change of sendPadLedFrame(changes))drumCache[change.index]=change.color;
        complete=changes.every(change=>drumCache[change.index]===change.color);
        if(complete){appState.drumActive=true;drumCacheStale=false;lastActiveSlot=track;}
    }else{
        if(!jointActive()&&!gridActive()&&!fieldActive())refreshHarmonyPads(track);
        complete=paintMelodicPads(padSweepPending);
    }
    if(complete){
        padSweepPending=false;
        // Do not follow the sweep with the old slow, unconditional init writes.
        appState.initLedsDone=true;appState.initLedIndex=32;
    }
}
'''
    path.write_text(source)
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    (root / 'browser-test/hb-chord-pad-feedback.mjs').write_text((assets / 'hb-chord-pad-feedback.mjs').read_text())
