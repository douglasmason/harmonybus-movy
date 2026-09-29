"""Keep musical LED changes coherent and ahead of slow control-panel work."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_light_priority(root: Path) -> None:
    """Reserve complete pad diffs and preserve the beat on cached touch frames."""
    path: Path = root / 'src/app/tick.ts'
    source: str = path.read_text()
    source = replace_once(source, 'function paintMelodicPads(): void {', 'function paintMelodicPads(): void {\n        const changes: {index:number;note:number;color:number}[]=[];')
    source = replace_once(source, '''                if (!ledBudgetTake()) continue;   // cache left stale: retries next tick
                chromaticCache[i] = color;
                setLED(p, color, true);''', '''                changes.push({index:i,note:p,color});''')
    source = replace_once(source, '''        }
}
let gesturePadRevision''', '''        }
        // One harmony change is one visual update. Defer the complete diff
        // if another owner has already used the budget; never paint half a chord.
        if(!ledBudgetTake(changes.length))return;
        for(const change of changes){chromaticCache[change.index]=change.color;setLED(change.note,change.color,true);}
}
let gesturePadRevision''')
    source = replace_once(source, '    ledFrameReset();\n    if (paintTouchFrame()) return;', '''    ledFrameReset();
    if(globalThis.overtakeParked!==true)seqBeatLedsTick();
    if (paintTouchFrame()) return;''')
    source = replace_once(source, '    if (globalThis.overtakeParked !== true) seqBeatLedsTick();', '''    if (globalThis.overtakeParked !== true) seqBeatLedsTick();
    if(globalThis.overtakeParked!==true&&sessionReady()&&!seqState.sessionMode&&appState.initLedsDone&&
       (appState.trackModels[appState.activeTrack.index]?.[1]?.getDrumPadCount()??0)===0){
        refreshHarmonyPads(appState.activeTrack.index);
        paintMelodicPads();
    }''')
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text()
    source = replace_once(source, '    const rank = (key: string): number => {', "    const rank = (key: string): number => {\n        if(key==='follower_this')return 500;\n        if(key==='pad_display')return 501;")
    path.write_text(source)
