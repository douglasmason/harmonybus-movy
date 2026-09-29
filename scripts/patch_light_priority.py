"""Keep musical LED changes coherent and ahead of slow control-panel work."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_light_priority(root: Path) -> None:
    """Reserve complete pad diffs and preserve the beat on cached touch frames."""
    path: Path = root / 'src/app/tick.ts'
    source: str = path.read_text()
    source = "import { sendPadLedFrame } from '../seq/led-cache.js';\nimport { withHarmonyPadFrame } from '../keyboard/harmony-pads.js';\n" + source
    source = replace_once(source, 'function paintMelodicPads(): void {', 'function paintMelodicPads(): void {\n    withHarmonyPadFrame(()=>{\n        const changes: {index:number;note:number;color:number}[]=[];')
    source = replace_once(source, '''                if (!ledBudgetTake()) continue;   // cache left stale: retries next tick
                chromaticCache[i] = color;
                setLED(p, color, true);''', '''                changes.push({index:i,note:p,color});''')
    source = replace_once(source, '''        }
}
let gesturePadRevision''', '''        }
        // One harmony change is one visual update. Defer the complete diff
        // if another owner has already used the budget; never paint half a chord.
        if(!sendPadLedFrame(changes))return;
        for(const change of changes)chromaticCache[change.index]=change.color;
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

/** Publish a complete pad diff in one host call; only acknowledge accepted frames.
 * Individual setLED calls expose partial rows to the concurrent MIDI consumer.
 * Keep the same packet budget: batching does not increase output traffic.
 */
export function sendPadLedFrame(changes: ReadonlyArray<{note:number;color:number}>): boolean {
    if(!changes.length)return true;
    if(!ledBudgetTake(changes.length))return false;
    const packets:number[]=[];
    for(const change of changes)packets.push(0x09,0x90,change.note,change.color);
    return move_midi_internal_send(packets)!==false;
}
'''
    path.write_text(source)
    path = root / 'src/types/schwung.d.ts'
    source = replace_once(path.read_text(), 'declare function move_midi_internal_send(data: number[]): void;', 'declare function move_midi_internal_send(data: number[]): boolean | void;')
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text()
    source = replace_once(source, '    const rank = (key: string): number => {', "    const rank = (key: string): number => {\n        if(key==='follower_this')return 500;\n        if(key==='pad_display')return 501;")
    path.write_text(source)
