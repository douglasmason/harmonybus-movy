"""Approach Copy mode: motif bank and ordered transformation knob access."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_approach_mode(root: Path) -> None:
    """Install controls while preserving Perform lane assignments."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/approach'
    (root / 'src/renderer/hb-approach.ts').write_text((assets / 'hb-approach.ts').read_text())
    (root / 'src/renderer/hb-choice-order.ts').write_text((assets / 'hb-choice-order.ts').read_text())
    path: Path = root / 'src/renderer/hb-performance.ts'
    source: str = "import { syncApproachOwner, approachStep, paintApproach, paintApproachKnobs, drawApproachRows } from './hb-approach.js';\n" + path.read_text()
    source = source.replace('Math.min(1, Math.round(value))','Math.min(2, Math.round(value))').replace("(flagValue('hbsteprow') + 1) % 2", "(flagValue('hbsteprow') + 1) % 3")
    source = source.replace("const key = next === 1 ? 'motion_control_1' : 'version';", "const key = next === 2 ? 'approach_bank_1' : next === 1 ? 'motion_control_1' : 'version';")
    source = source.replace("['Steps', 'Perform'][next]", "['Steps', 'Perform', 'Approach'][next]").replace("? 'MOTIFS T' : 'HB OPS T'", "? 'APPROACH T' : 'HB OPS T'")
    source = source.replace('export function resetHbPerformance(): void {', 'export function resetHbPerformance(): void {\n    syncApproachOwner(null);')
    source = source.replace('function releaseForModeChange(): void {','function releaseForModeChange(): void {\n    syncApproachOwner(null);')
    source = source.replace('    return page;\n}', "    syncApproachOwner(flagValue('hbsteprow') === 2 ? page : null);\n    return page;\n}")
    source = source.replace("    if (flagValue('hbsteprow') === 2) return false;", "    if (flagValue('hbsteprow') === 2) return approachStep(data,owner);")
    source = replace_once(source,'    syncHbPerformanceMode();\n    const status', '    syncHbPerformanceMode();\n    if(approachStep(data,null))return true;\n    const status')
    source = source.replace('    if (paintMotif(owner)) return true;', "    if (paintMotif(owner)) return true;\n    if(flagValue('hbsteprow')===2)return paintApproach(owner);")
    source = replace_once(source, '    const namedLights=assignments.some(lane=>lane>=16)?readNamedLights(owner):null;', '    const namedLights=assignments.some(lane=>lane>=16)?readNamedLights(owner):null;\n    paintApproachKnobs(owner,keys);')
    source = source.replace(" : 'STEPS / NO HB',1);", " : 'STEPS / NO HB',1);\n    if(active && flagValue('hbsteprow')===2)drawApproachRows(hbPerformancePage()!);")
    source=source.replace('    const clip = operation >= 12 && operation <= 15;\n    return clip ? (active ? 17 : 97) : (active ? C_GREEN : 85);', '    return active ? 120 : 124;')
    source = source.replace('        const bit=1<<knob,lane=assignments[knob];', "        const bit=1<<knob,lane=assignments[knob];\n        if(/^approach_bank_/.test(keys[knob]??'')||keys[knob]==='approach_motif_latch'||keys[knob]==='key_center'||keys[knob]==='parallel_mode'||keys[knob]==='dominant_color'){wanted|=bit;continue;}")
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = "import { orderHarmonyChoices } from './hb-choice-order.js';\nimport { approachPanels } from './hb-approach.js';\n" + path.read_text()
    source = source.replace('    return hierarchy;\n}', '    approachPanels(hierarchy,mode);\n    return hierarchy;\n}')
    source = source.replace('    const levels = hierarchy.levels;', '    orderHarmonyChoices(hierarchy);\n    const levels = hierarchy.levels;')
    source = source.replace('    const levels = hierarchy.levels;', "    const levels = hierarchy.levels;\n    if(levels.secondary_scale){levels.secondary_scale.params.push({key:'track_defaults_reset',name:'Reset Track',type:'enum',options:['Shift+Touch'],options_as_string:true});levels.secondary_scale.knobs.push('track_defaults_reset');}")
    path.write_text(source)
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text().replace("labels: ['STEPS','PERFORM']", "labels: ['STEPS','PERFORM','APPROACH']").replace("min: 0, max: 1, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps or Perform.'", "min: 0, max: 2, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps, Perform or Approach.'")
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = "import { seqToast } from '../seq/render.js';\nimport { choiceGroup, orderHarmonyChoices } from './hb-choice-order.js';\nimport { approachRowsActive, approachTouched, drawApproachOperations, drawDetectedChordForm, PARALLEL_SCALES, DOMINANT_COLORS } from './hb-approach.js';\n" + path.read_text().replace("['Steps','Perform']", "['Steps','Perform','Approach']").replace("v === 'Perform' || v === '1' ? 1 : 0", "v === 'Approach' || v === '2' ? 2 : v === 'Perform' || v === '1' ? 1 : 0")
    source = replace_once(source, "            if (hostedModuleId === 'harmonybus' && k.endsWith(':ui_hierarchy') && v) {", """            if (hostedModuleId === 'harmonybus' && k.endsWith(':chain_params') && v) {
                try { const parameters=JSON.parse(v);orderHarmonyChoices(parameters);v=JSON.stringify(parameters); } catch (_) {}
            }
            if (hostedModuleId === 'harmonybus' && k.endsWith(':ui_hierarchy') && v) {""")
    source = replace_once(source, "                    readCache.set(componentKey + ':chain_params', JSON.stringify(snapshot.params));", "                    orderHarmonyChoices(snapshot.params);\n                    readCache.set(componentKey + ':chain_params', JSON.stringify(snapshot.params));")
    source = source.replace('            if (laneTouchSlots.has(slot)) {\n                releasePerformanceTouch(slot, true);', "            if (laneTouchSlots.has(slot) && !/^approach_bank_/.test(ctl.keyAt(slot))) {\n                releasePerformanceTouch(slot, true);")
    source = replace_once(source, '        knobTurn: (slot: number, delta: number) => {', """        knobTurn: (slot: number, delta: number) => {
            const keyContext=ctl.keyAt(slot);
            if(keyContext==='harm_play_advance'||keyContext==='track_defaults_reset')return;
            if(keyContext==='key_center'||keyContext==='parallel_mode'||keyContext==='dominant_color'){
                if(appState.shiftHeld&&keyContext==='key_center')return;
                if(appState.shiftHeld){
                    if(laneTouchSlots.has(slot))releasePerformanceTouch(slot,true);
                    const setting=keyContext==='dominant_color'?'dominant_color_family':keyContext==='parallel_mode'?'parallel_scale':'key_center_scale';
                    const options=keyContext==='dominant_color'?DOMINANT_COLORS:keyContext==='parallel_mode'?PARALLEL_SCALES:['Parent Mode','Parallel Scale'];
                    const current=Math.max(0,options.indexOf(lanePort.performanceGet(setting)));
                    const index=Math.max(0,Math.min(options.length-1,current+delta));
                    if(delta){lanePort.performanceSet(setting,options[index]);markUiStateDirty();}
                    ctl.state.peek={key:keyContext,title:keyContext==='dominant_color'?'Dominant Color':keyContext==='parallel_mode'?'Parallel Scale':'New Key Scale',options,index,at:Date.now()};
                }else if(delta){lanePort.performanceSet(keyContext,delta>0?'LatchOn':'LatchOff');markUiStateDirty();}
                approachTouched(lanePort);ctl.revalue();touchPaintPending=true;return;
            }
            if(ctl.keyAt(slot)==='approach_motif_latch'){
                if(delta&&!approachRowsActive()){lanePort.performanceSet('approach_motif_latch',delta>0?'On':'Off');approachTouched(lanePort);ctl.revalue();markUiStateDirty();touchPaintPending=true;}
                return;
            }
            const approachControl=/^approach_bank_(\\d+)$/.exec(ctl.keyAt(slot));
            if(approachControl && appState.shiftHeld){
                if(laneTouchSlots.has(slot))releasePerformanceTouch(slot,true);
                const key=ctl.keyAt(slot),options=ctl.metaAt(slot)?.options||[];
                const current=Math.max(0,options.indexOf(String(ctl.state.values[key])));
                if(delta&&current>=0){
                    const index=Math.max(0,Math.min(options.length-1,current+delta));
                    ctl.commitEnum(key,index);ctl.revalue();markUiStateDirty();approachTouched(lanePort);
                    ctl.state.peek={key,title:choiceGroup(options[index]),options,index,at:Date.now()};
                }
                return;
            }
            if(approachControl){
                if(approachRowsActive())return;
                if(delta){lanePort.performanceSet('approach_control_'+approachControl[1],delta>0?'LatchOn':'LatchOff');approachTouched(lanePort);markUiStateDirty();touchPaintPending=true;
                    const key=ctl.keyAt(slot);ctl.state.peek={key,title:delta>0?'Latched On':'Latch Off',options:[String(ctl.state.values[key]??'Operation')],index:0,at:Date.now()};}
                return;
            }
""")
    source = replace_once(source,'            const namedControl = /^motion_control_', '''            if(key==='harm_play_advance'){
                if(!appState.shiftHeld){lanePort.performanceSet(key,'Next');approachTouched(lanePort);touchPaintPending=true;}return;
            }
            if(key==='track_defaults_reset'){
                if(appState.shiftHeld){
                    for(const heldSlot of [...laneTouchSlots])releasePerformanceTouch(heldSlot,true);
                    lanePort.performanceSet(key,String(port.track.index));markUiStateDirty();
                    reload();seqToast('Reset HB T'+(port.track.index+1));touchPaintPending=true;
                }return;
            }
            if(key==='key_center'||key==='parallel_mode'||key==='dominant_color'){
                if(appState.shiftHeld)return;
                lanePort.performanceSet(key,'Down');approachTouched(lanePort);markUiStateDirty();laneTouchSlots.add(slot);
                ownPerformanceTouch(slot,()=>{
                    laneTouchSlots.delete(slot);lanePort.performanceSet(key,'Up');touchPaintPending=true;
                    touchReadOnly=true;try{ctl.onKnobTouch(slot,false);}finally{touchReadOnly=false;}
                });return;
            }
            const approachKnob=/^approach_bank_(\\d+)$/.exec(key);
            if(approachKnob){
                if(appState.shiftHeld)return;
                const touchKey='approach_touch_'+approachKnob[1], touchedAt=Date.now();
                lanePort.performanceSet(touchKey,'Down');approachTouched(lanePort);markUiStateDirty();laneTouchSlots.add(slot);
                ownPerformanceTouch(slot,(cancel=false)=>{
                    laneTouchSlots.delete(slot);lanePort.performanceSet(touchKey,cancel?'Cancel':'Up,'+Math.max(0,Date.now()-touchedAt));touchPaintPending=true;
                    touchReadOnly=true;try{ctl.onKnobTouch(slot,false);}finally{touchReadOnly=false;}
                });
                return;
            }
            const namedControl = /^motion_control_''')
    source=source.replace('            ctl.render(ctx, { title, bands: BANDS });', '            ctl.render(ctx, { title, bands: BANDS });\n            drawApproachOperations(keysOf(), ctl.state.values, ctl.state.touched);\n            drawDetectedChordForm(keysOf(), ctl.state.values, ctl.state.touched);')
    path.write_text(source)
    path=root/'src/renderer/schwung-page.ts'
    source=path.read_text().replace('    readonly ready: boolean;', '    readonly ready: boolean;\n    readonly knobLEDMask: number;')
    source=source.replace('        get ready() { return loaded; },', "        get ready() { return loaded; },\n        get knobLEDMask() { return hostedModuleId==='harmonybus'?(keysOf().reduce((mask,key,index)=>mask|(/^approach_bank_|^approach_motif_latch$|^key_center$|^parallel_mode$|^dominant_color$|^motion_control_|^follow_touch_/.test(key??'')?1<<index:0),0)|motifKnobSelectionMask(port.track.index)):0; },")
    path.write_text(source)
    path=root/'src/renderer/knob-leds.ts'
    source=path.read_text().replace('updateKnobLEDs(vm: ViewModel)', 'updateKnobLEDs(vm: ViewModel, ownedMask = 0)')
    start=source.index('/* Amber intensity scale')
    end=source.index('let logTickCount',start)
    source=source[:start]+source[end:]
    source=source.replace('White intensity scale (knobs 1-4)', 'White intensity scale (all eight knobs)').replace('Knobs 1-4 (physK 0-3) → white intensity; knobs 5-8 (physK 4-7) → amber intensity.', 'All eight knobs use white intensity.')
    source=source.replace(": row === 0 ? (flash ? 120 : whiteLevel(pvm.normalizedValue))\n                : (flash ? 3 : amberLevel(pvm.normalizedValue));", ": flash ? 120 : whiteLevel(pvm.normalizedValue);")
    source=source.replace('            const pvm   = vm.rows[row][col];', '            if(ownedMask&(1<<physK)){lastKnobColor[physK]=-1;continue;}\n            const pvm   = vm.rows[row][col];')
    path.write_text(source)
    path=root/'src/app/tick.ts'
    source=path.read_text().replace('            updateKnobLEDs(vm);\n', '            updateKnobLEDs(vm,[VIEW_KNOBS,VIEW_CHAIN].includes(appState.currentView)&&!stepPageState.selected?touchPage?.knobLEDMask??0:0);\n')
    path.write_text(source)
    path=root/'build/browser.mjs'
    source=path.read_text().replace("resolve(root, 'src/renderer/hb-motif.ts'),", "resolve(root, 'src/renderer/hb-motif.ts'),\n        resolve(root, 'src/renderer/hb-approach.ts'),")
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    source = path.read_text().replace('8063| (127u64<<13)', '8063| (4095u64<<43) | (127u64<<13)')
    source = source.replace('    let intent=actions[LANES];', '''    let approach=(actions[LANES]>>43)&2047;
    if approach!=0 && ((approach&63)==0 || (approach&63)>50 || (14..=15).contains(&(approach&63)) || ((approach&63)<16 && approach>>6!=0)){return None;}
    if actions[LANES]&(1u64<<54)!=0 && (approach&63)<16{return None;}
    let intent=actions[LANES];''')
    path.write_text(source)

    path.write_text(path.read_text() + """
#[cfg(test)] mod approach_row_tests {
    use super::*;
    #[test] fn preserves_approach_step_and_alias_through_projection() {
        for code in 1..=50u64 {
            if code==14||code==15 {continue;}
            for step in 0..if code<16 {1}else{32} {
                let mut actions=[0u64;LANES+1];actions[LANES]=((code|(step<<6))<<43)|4;
                assert_eq!(parse(&format!("ra4,{}",payload(96,actions))),Some((96,actions)));
                let (_,projected)=piano_emit(96,96,Some(actions),None,None,12);
                assert_eq!(projected.unwrap()[LANES]>>43,actions[LANES]>>43);
            }
        }
        for code in [14,15,51,63,64,65] {
            let mut actions=[0;LANES+1];actions[LANES]=code<<43;
            assert!(parse(&format!("ra4,{}",payload(60,actions))).is_none());
        }
    }
}
""")
