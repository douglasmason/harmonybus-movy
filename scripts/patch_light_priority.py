"""Keep musical LED changes coherent and ahead of slow control-panel work."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_light_priority(root: Path) -> None:
    """Reserve complete pad diffs and preserve the beat on cached touch frames."""
    path: Path = root / 'src/app/tick.ts'
    source: str = path.read_text()
    source = "import { sendPadLedFrame, melodicPadColorCache as chromaticCache } from '../seq/led-cache.js';\nimport { withHarmonyPadFrame } from '../keyboard/harmony-pads.js';\n" + source
    source = replace_once(source, 'const chromaticCache = new Uint8Array(32);', '// Melodic pad cache is shared with immediate input feedback.')
    source = replace_once(source, 'function paintMelodicPads(): void {', 'export function paintMelodicPads(): void {\n    withHarmonyPadFrame(()=>{\n        const changes: {index:number;note:number;color:number}[]=[];')
    source = replace_once(source, '''                if (!ledBudgetTake()) continue;   // cache left stale: retries next tick
                chromaticCache[i] = color;
                setLED(p, color, true);''', '''                changes.push({index:i,note:p,color});''')
    source = replace_once(source, '''        }
}
let gesturePadRevision''', '''        }
        // Only cache packets accepted by the host; rejected pads retry next tick.
        for(const change of sendPadLedFrame(changes))chromaticCache[change.index]=change.color;
    });
}
let gesturePadRevision''')
    source = replace_once(source, '    ledFrameReset();\n    if (paintTouchFrame()) return;', '''    ledFrameReset();
    if(globalThis.overtakeParked!==true)seqBeatLedsTick();
    if(globalThis.overtakeParked!==true&&sessionReady()&&!seqState.sessionMode&&
       !stepPageState.selected&&!schwungEditorActive()&&
       (appState.currentView===VIEW_KNOBS||appState.currentView===VIEW_CHAIN)){
        const track=appState.activeTrack.index;
        const model=appState.trackModels[track]?.[appState.trackChainIndex[track]];
        if(model)schwungCachedFor(track,model.getComponentKey())?.pollOperationFeedback();
    }
    if (paintTouchFrame()) return;''')
    source = replace_once(source, '    if (globalThis.overtakeParked !== true) seqBeatLedsTick();', '''    if (globalThis.overtakeParked !== true) seqBeatLedsTick();
    if(globalThis.overtakeParked!==true&&sessionReady()&&!seqState.sessionMode&&appState.initLedsDone&&
       (appState.trackModels[appState.activeTrack.index]?.[1]?.getDrumPadCount()??0)===0){
        refreshHarmonyPads(appState.activeTrack.index);
        paintMelodicPads();
    }''')
    source = replace_once(source, 'seqState.barOffset, maxBarOffset());', 'seqState.barOffset, maxBarOffset(), false);')
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = replace_once(path.read_text(), '    maxOff: number = 0,\n): void {', '    maxOff: number = 0,\n    resetFrame: boolean = true,\n): void {')
    source = replace_once(source, '''    /* Starts the LED frame for everything painted from here on. app/tick.ts
     * resets it too, at the very top: this one keeps the budget meaningful for
     * callers that drive the LED layer directly, that one guarantees a tick
     * which never reaches here cannot leave it exhausted and stop every LED. */
    ledFrameReset();''', '''    // Standalone callers start a frame. The app already reset its shared
    // budget before priority feedback and must not reset it midway through.
    if(resetFrame)ledFrameReset();''')
    path.write_text(source)
    path = root / 'src/seq/led-cache.ts'
    source = path.read_text()
    source += '''

/** Shared with immediate pad feedback: an out-of-frame write invalidates the
 * regular painter's belief about that physical LED, including fast releases
 * that still see a retained Auto Chord input in the last HB snapshot. */
export const melodicPadColorCache = new Uint8Array(32);
export function invalidateMelodicPadColor(note: number, padMin: number): void {
    const index=note-padMin;
    if(index>=0&&index<melodicPadColorCache.length)melodicPadColorCache[index]=255;
}

/** Submit a bounded frame through the native cable binding. Older hosts
 * retain per-pad delivery; only accepted writes enter the paint cache. */
export function sendPadLedFrame<T extends {note:number;color:number}>(changes: ReadonlyArray<T>): T[] {
    if(!changes.length||!ledBudgetTake(changes.length))return [];
    // Cable 0 is the normal Move LED destination. The host binding reserves
    // and publishes the entire packet array in one write, or rejects it whole.
    if(typeof move_midi_cable_send==='function'){
        const packets:number[]=[];
        for(const change of changes)packets.push(0x09,0x90,change.note,change.color);
        return move_midi_cable_send(0,packets)===true?[...changes]:[];
    }
    const accepted:T[]=[];
    for(const change of changes){
        if(move_midi_internal_send([0x09,0x90,change.note,change.color])!==false)accepted.push(change);
    }
    return accepted;
}

'''
    source += """
/** Live melodic feedback shares the same delivery path as complete frames. */
export function sendImmediatePadLed(note:number,color:number):void {
    if(typeof move_midi_cable_send==='function')move_midi_cable_send(0,[0x09,0x90,note,color]);
    else setLED(note,color);
}
"""
    path.write_text(source)
    path = root / 'src/keyboard/handler.ts'
    source = "import { invalidateMelodicPadColor, sendImmediatePadLed } from '../seq/led-cache.js';\n" + path.read_text()
    immediate: str = '    setLED(padNote, padColor('
    if source.count(immediate) != 2:
        raise RuntimeError('Expected immediate melodic pad press and release feedback')
    source = source.replace(immediate, '    invalidateMelodicPadColor(padNote, padMin);\n' + immediate)
    source=source.replace('    setLED(padNote, padColor(', '    sendImmediatePadLed(padNote, padColor(')
    path.write_text(source)
    path = root / 'src/types/schwung.d.ts'
    source = replace_once(path.read_text(), 'declare function move_midi_internal_send(data: number[]): void;', 'declare function move_midi_internal_send(data: number[]): boolean | void;')
    source+='\ndeclare function move_midi_cable_send(cable:number,data:number[]):boolean;\n'
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text()
    source = replace_once(source, '    const rank = (key: string): number => {', "    const rank = (key: string): number => {\n        if(key==='follower_this')return 500;\n        if(key==='pad_display')return 501;")
    path.write_text(source)
