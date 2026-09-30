"""Approach Copy mode: motif bank and ordered transformation knob access."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_approach_mode(root: Path) -> None:
    """Install controls while preserving Perform lane assignments."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/approach'
    (root / 'src/renderer/hb-approach.ts').write_text((assets / 'hb-approach.ts').read_text())
    path: Path = root / 'src/renderer/hb-performance.ts'
    source: str = "import { syncApproachOwner, approachStep, paintApproach, paintApproachKnobs } from './hb-approach.js';\n" + path.read_text()
    source = source.replace('Math.min(1, Math.round(value))','Math.min(2, Math.round(value))').replace("(flagValue('hbsteprow') + 1) % 2", "(flagValue('hbsteprow') + 1) % 3")
    source = source.replace("const key = next === 1 ? 'motion_control_1' : 'version';", "const key = next === 2 ? 'approach_bank_1' : next === 1 ? 'motion_control_1' : 'version';")
    source = source.replace("['Steps', 'Perform'][next]", "['Steps', 'Perform', 'Approach'][next]").replace("? 'MOTIFS T' : 'HB OPS T'", "? 'APPROACH T' : 'HB OPS T'")
    source = source.replace('export function resetHbPerformance(): void {', 'export function resetHbPerformance(): void {\n    syncApproachOwner(null);')
    source = source.replace('function releaseForModeChange(): void {','function releaseForModeChange(): void {\n    syncApproachOwner(null);')
    source = source.replace('    return page;\n}', "    syncApproachOwner(flagValue('hbsteprow') === 2 ? page : null);\n    return page;\n}")
    source = source.replace("    if (flagValue('hbsteprow') === 2) return false;", "    if (flagValue('hbsteprow') === 2) return approachStep(data,owner);")
    source = replace_once(source,'    syncHbPerformanceMode();\n    const status', '    syncHbPerformanceMode();\n    if(approachStep(data,null))return true;\n    const status')
    source = source.replace('    if (paintMotif(owner)) return true;', "    if (paintMotif(owner)) return true;\n    if(flagValue('hbsteprow')===2)return paintApproach(owner);")
    source = source.replace('    const assignments=keys.map', '    if(paintApproachKnobs(owner,keys))return;\n    const assignments=keys.map')
    path.write_text(source)
    path = root / 'src/renderer/hb-step-panels.ts'
    source = "import { approachPanels } from './hb-approach.js';\n" + path.read_text()
    source = source.replace('    return hierarchy;\n}', '    approachPanels(hierarchy,mode);\n    return hierarchy;\n}')
    path.write_text(source)
    path = root / 'src/seq/flags-def.ts'
    source = path.read_text().replace("labels: ['STEPS','PERFORM']", "labels: ['STEPS','PERFORM','APPROACH']").replace("min: 0, max: 1, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps or Perform.'", "min: 0, max: 2, def: 0, uiOnly: true, release: true,\n        hint: 'Copy tap: Steps, Perform or Approach.'")
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text().replace("['Steps','Perform']", "['Steps','Perform','Approach']").replace("v === 'Perform' || v === '1' ? 1 : 0", "v === 'Approach' || v === '2' ? 2 : v === 'Perform' || v === '1' ? 1 : 0")
    source = source.replace('            if (laneTouchSlots.has(slot)) {\n                releasePerformanceTouch(slot, true);', "            if (laneTouchSlots.has(slot) && !/^approach_bank_/.test(ctl.keyAt(slot))) {\n                releasePerformanceTouch(slot, true);")
    source = replace_once(source,'            const namedControl = /^motion_control_', '''            const approachKnob=/^approach_bank_(\\d+)$/.exec(key);
            if(approachKnob){
                const touchKey='approach_touch_'+approachKnob[1], touchedAt=Date.now();
                lanePort.performanceSet(touchKey,'Down');markUiStateDirty();laneTouchSlots.add(slot);
                ownPerformanceTouch(slot,()=>{
                    laneTouchSlots.delete(slot);lanePort.performanceSet(touchKey,'Up,'+Math.max(0,Date.now()-touchedAt));touchPaintPending=true;
                    touchReadOnly=true;try{ctl.onKnobTouch(slot,false);}finally{touchReadOnly=false;}
                });
                return;
            }
            const namedControl = /^motion_control_''')
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
