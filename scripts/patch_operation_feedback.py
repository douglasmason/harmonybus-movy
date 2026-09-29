"""Poll visible HB operation feedback independently of screen dirtiness."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_operation_feedback(root: Path) -> None:
    """Use bounded status snapshots and redraw only when visible state changes."""
    source_path: Path = root / 'src/renderer/hb-performance.ts'
    source: str = source_path.read_text()
    source = replace_once(source, 'let operationKnobMask=0;', "let operationKnobMask=0;\nlet operationKnobState='';")
    source = replace_once(source, 'const userLights=wanted?readLaneLights(owner):null;', 'const userLights=assignments.some(lane=>lane>=0&&lane<16)?readLaneLights(owner):null;')
    source = replace_once(source, '    for(let knob=0;knob<8;knob++){', "    let nextState=String(owner.performanceTrack ?? '')+':'+wanted;\n    for(let knob=0;knob<8;knob++){")
    source = replace_once(source, '        const color=active?hbOperationColor(lights.operations[localLane],true):0;', "        const color=active?hbOperationColor(lights.operations[localLane],true):0;\n        nextState+='|'+lane+':'+color+':'+Number(pulse);")
    source = replace_once(source, '    operationKnobMask=wanted;', "    operationKnobMask=wanted;\n    if(nextState!==operationKnobState){operationKnobState=nextState;appState.dirty=true;}")
    source_path.write_text(source)
    source_path = root / 'src/renderer/schwung-page.ts'
    source = source_path.read_text()
    source = replace_once(source, '    tick(): void;', '    tick(): void;\n    pollOperationFeedback(): void;')
    source = replace_once(source, '        get moduleId()', '''        pollOperationFeedback(): void {
            if (hostedModuleId === 'harmonybus' && loaded && !touchPaintPending)
                paintHbOperationKnobs(lanePort, keysOf(), ctl.state.values);
        },
        get moduleId()''')
    source_path.write_text(source)
    source_path = root / 'src/app/tick.ts'
    source = source_path.read_text()
    source = replace_once(source, '    // Warm HarmonyBus before the initial paint.', '''    // Trigger consumption happens in the DSP, without changing a knob value.
    // Do not wait for unrelated model dirtiness before clearing its LED.
    if (!seqState.sessionMode && !stepPageState.selected && !schwungEditorActive() &&
        (appState.currentView === VIEW_KNOBS || appState.currentView === VIEW_CHAIN))
        touchPage?.pollOperationFeedback();

    // Warm HarmonyBus before the initial paint.''')
    source_path.write_text(source)
