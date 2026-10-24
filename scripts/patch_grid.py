"""Install the grid editor over the existing sequencer and panel infrastructure."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_grid(root: Path) -> None:
    """Add grid storage, scheduling, commands, and surface adapters."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/grid'
    core: Path = root / 'engine/crates/seq-core/src'
    for name in ['grid.rs']:
        (core / name).write_text((assets / name).read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text()+'\npub mod grid;\n')
    path = core / 'clip.rs'
    source: str = path.read_text().replace('pub struct Clip {','pub struct Clip {\n    pub grid_gates: Vec<crate::grid::Gate>,')
    source = source.replace('        Clip {','        Clip {\n            grid_gates:Vec::new(),')
    source = source.replace('    pub fn clear(&mut self) {','    pub fn clear(&mut self) {\n        self.grid_gates.clear();')
    source = source.replace('        self.length_steps = len * 2;', '''        let grid_copies:Vec<_>=self.grid_gates.iter().filter(|gate|gate.start>=start as u32*TICKS_PER_STEP&&gate.start<(start+len) as u32*TICKS_PER_STEP).map(|gate|crate::grid::Gate{start:gate.start+span_ticks,end:gate.end+span_ticks,..*gate}).collect();
        self.grid_gates.extend(grid_copies.into_iter().take(crate::grid::MAX_GATES.saturating_sub(self.grid_gates.len())));
        self.length_steps = len * 2;''')
    path.write_text(source)
    path = core / 'engine.rs'
    source = path.read_text().replace('pub enum OutEvent {','pub enum OutEvent {\n    GridMask {track:u8,mask:u16},')
    source = source.replace('pub struct Engine {','pub struct Engine {\n    pub grid_masks:[u16;16],\n    pub grid_view:bool,\n    pub grid_performance:Vec<crate::hb_clip_performance::Performance>,\n    pub grid_configs:Vec<[Option<crate::hb_clip_performance::AutoConfig>;16]>,\n    pub grid_views:[crate::grid::View;2],')
    source = source.replace('            key_playback:', '            grid_masks:[0;16],grid_view:false,grid_performance:vec![Default::default();16],grid_configs:vec![[None;16];16],grid_views:[crate::grid::View::default();2],\n            key_playback:',1)
    source = source.replace('    fn step_tick(&mut self, ti: usize, out: &mut Vec<OutEvent>) {','    fn step_tick(&mut self, ti: usize, out: &mut Vec<OutEvent>) {\n        self.grid_tick(ti,out);')
    source = source.replace('    fn flush_gates(&mut self, out: &mut Vec<OutEvent>) {','    fn flush_gates(&mut self, out: &mut Vec<OutEvent>) {\n        for track in 0..self.tracks.len(){self.grid_release(track,out);}')
    source = source.replace('    pub fn flush_track_gates(&mut self, track: usize, out: &mut Vec<OutEvent>) {','    pub fn flush_track_gates(&mut self, track: usize, out: &mut Vec<OutEvent>) {\n        self.grid_release(track,out);')
    source = source.replace('"play={} tick={}', '"grid={} play={} tick={}')
    source = source.replace('            self.playing as u8,','            if self.grid_view {self.grid_status()} else {String::new()},\n            self.playing as u8,',1)
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text().replace('"tog" | "addp"','"gtog" | "tog" | "addp"')
    source = source.replace('| "watch" | "wlane"','| "gview" | "watch" | "wlane"')
    source = source.replace('        "ltog" => {','''        "gview"=>{
            let fields:Vec<i64>=it.map(str::parse).collect::<Result<_,_>>().unwrap_or_default();
            if fields.len()==1 {engine.grid_view=fields[0]!=0;}
            if fields.len()==11&&(0..2).contains(&fields[0])&&(0..6144).contains(&fields[1])&&[24,48,96,192,384].contains(&fields[2])&&fields[3..].iter().all(|value|(0..144).contains(value)||*value==65535){
                engine.grid_views[fields[0] as usize]=crate::grid::View{start:fields[1] as u32,division:fields[2] as u32,rows:std::array::from_fn(|index|fields[3+index] as u16)};
            }
        },
        "gtog"=>{
            if let (Some(track),Some(start),Some(duration),Some(assignment),Some(velocity))=(next(),next(),next(),next(),next()) {
                if (0..16).contains(&track)&&(0..6144).contains(&start)&&(1..=384).contains(&duration)&&(0..144).contains(&assignment)&&(1..128).contains(&velocity) {
                    engine.grid_toggle(track as usize,start as u32,duration as u32,assignment as u16,velocity as u8);
                }
            }
        },
        "ltog" => {''')
    path.write_text(source)
    path = core / 'persist.rs'
    source = path.read_text().replace('            for event in &c.shared_events {','''            for gate in &c.grid_gates {s.push_str(&format!("gg {} {} {} {} {}\\n",ti,ci,gate.start,gate.end,gate.lane));}
            for event in &c.shared_events {''')
    source = source.replace('        match it.next() {','''        match it.next() {
            Some("gg")=>{
                let fields:Vec<usize>=it.map(str::parse).collect::<Result<_,_>>().unwrap_or_default();
                if let [track,slot,start,end,lane]=fields.as_slice(){
                    if *start<*end&&*end<=6144&&*lane<16 {
                        if let Some(clip)=engine.tracks.get_mut(*track).and_then(|track|track.clips.get_mut(*slot)) {
                            if clip.grid_gates.len()<crate::grid::MAX_GATES {clip.grid_gates.push(crate::grid::Gate{start:*start as u32,end:*end as u32,lane:*lane as u8});}
                        }
                    }
                }
            },''',1)
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text().replace('            match self.out[i] {','''            match self.out[i] {
                OutEvent::GridMask{track,mask}=>{if let Some(slot)=chain_for(track,self.movy_tracks){self.chains.set_param(slot,"midi_fx1:motion_sequence_mask",&mask.to_string());}},''',1)
    path.write_text(source)
    (root / 'src/seq/grid.ts').write_text((assets / 'grid.ts').read_text())
    path = root / 'src/seq/router.ts'
    source = "import { gridMidi } from './grid.js';\n"+path.read_text()
    source = source.replace('    if (jointMidi(data))', '    if (gridMidi(data)) return true;\n    if (jointMidi(data))')
    path.write_text(source)
    path = root / 'src/seq/router-pads.ts'
    source = "import { gridActive } from './grid.js';\n"+path.read_text()
    path.write_text(source.replace('return !seqState.sessionMode;','return !seqState.sessionMode && !gridActive();'))
    path = root / 'src/seq/router-buttons.ts'
    source = "import { gridEnabled, setGridEnabled } from './grid.js';\n"+path.read_text()
    source = source.replace('seqState.sessionMode ? 0 : jointEnabled()', 'seqState.sessionMode ? 0 : gridEnabled() ? 4 : jointEnabled()')
    source = source.replace('(previous + 1) % 4','(previous + 1) % 5')
    source = source.replace('    setJointEnabled(next === 3);','    setGridEnabled(next === 4);\n    setJointEnabled(next === 3);')
    source = source.replace("'Motif Play', 'Joint Play'][next]", "'Motif Play', 'Joint Play', 'Grid Sequencer'][next]")
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { gridActive, gridTouchPage, paintGrid, renderGrid } from '../seq/grid.js';\n"+path.read_text()
    source = source.replace('    if(jointActive()){paintJointPads();return;}','    if(gridActive()){paintGrid();return;}\n    if(jointActive()){paintJointPads();return;}')
    source = source.replace('        } else if (jointActive()) {','        } else if (gridActive()) {\n            renderGrid();\n        } else if (jointActive()) {')
    path.write_text(source)
    path = root / 'src/seq/engine.ts'
    source = "import { gridAccept, gridTick } from './grid.js';\n"+path.read_text()
    source = source.replace("        else if (key === 'len')", "        else if (key === 'grid') gridAccept(val, seqState.reportedTrack);\n        else if (key === 'len')")
    source = source.replace('    syncJoint(engineSet);', '    syncJoint(engineSet);\n    gridTick();')
    path.write_text(source)
    # Put grid after trk in the status stream so ownership is known on track switches.
    path = core / 'engine.rs'
    source = path.read_text().replace('grid={} play={} tick={}', 'play={} tick={}').replace('trk={} step={}', 'trk={} grid={} step={}')
    source = source.replace('            if self.grid_view {self.grid_status()} else {String::new()},\n','')
    source = source.replace('            self.watch_track,\n            wt.current_step(),','            self.watch_track,\n            if self.grid_view {self.grid_status()} else {String::new()},\n            wt.current_step(),')
    path.write_text(source)
    path = root / 'src/seq/ui-state.ts'
    source = "import { gridSnapshot, restoreGrid } from './grid.js';\n"+path.read_text()
    source = source.replace('        jointPlay: jointSnapshot(),','        gridRows:gridSnapshot(),\n        jointPlay: jointSnapshot(),')
    source = source.replace('        restoreTrailSettings(o.padTrails);','        restoreGrid(o.gridRows);\n        restoreTrailSettings(o.padTrails);')
    source = source.replace('    restoreJoint(null);','    restoreGrid(null);\n    restoreJoint(null);')
    path.write_text(source)
    path = root / 'src/surfaces/launchpad.ts'
    source = "import { gridActive, gridColors, gridPad, gridNavigate, gridSurfaceControl } from '../seq/grid.js';\n"+path.read_text()
    source = source.replace('    sample(now);','    if(gridActive()){frameReady=true;}else sample(now);')
    source = source.replace('const desired = withSteadyHarmonyLights(() => withHarmonyPadFrame(colors));','const desired = gridActive()?gridColors("launchpad",8,8):withSteadyHarmonyLights(() => withHarmonyPadFrame(colors));')
    source = source.replace('    if (top >= 0 && top < 8) {','''    if(gridActive()&&top>=0&&top<4){if(value)gridNavigate('launchpad',top===2?-1:top===3?1:0,top===0?1:top===1?-1:0,8,8);return;}
    if(gridActive()&&top>=4&&top<8){if(value)gridSurfaceControl('launchpad',top);return;}
    if(gridActive()&&index>=0&&(type===128||type===144||type===160)){
        if(type!==160)gridPad('launchpad',index,type===144&&value>0,value,8,8,modifier);return;
    }
    if (top >= 0 && top < 8) {''')
    path.write_text(source)

    path = root / 'src/undo/verbs.ts'
    source = path.read_text().replace("    'tog',", "    'gtog', 'tog',").replace("    'watch',", "    'gview', 'watch',")
    path.write_text(source)

    path = root / 'build/browser.mjs'
    path.write_text(path.read_text().replace('    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/grid.ts'),"))
    path = root / 'src/app/tick.ts'
    source = path.read_text().replace('if (!seqState.sessionMode && !isDrum && appState.initLedsDone)', 'if (!seqState.sessionMode && (!isDrum || gridActive()) && appState.initLedsDone)')
    path.write_text(source)

    path = core / 'engine.rs'
    source = path.read_text().replace('        self.hb_rhythm[track]=', '        let (rhythm,grid)=rhythm.split_once(\'|\').unwrap_or((rhythm,""));\n        self.grid_configs[track]=crate::hb_clip_performance::AutoConfig::parse(grid).unwrap_or([None;16]);\n        self.hb_rhythm[track]=')
    source = source.replace('.or_else(||clip.operation_intervals.iter()', '.or_else(||self.grid_performance[ti].advance(slot,clip.loop_start_ticks(),clip.length_ticks(),pos))\n                .or_else(||clip.operation_intervals.iter()')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = path.read_text().replace('Some(format!("{}|{}",message.unwrap_or_default(),rhythm.unwrap_or_default()))', 'Some(format!("{}|{}|{}",message.unwrap_or_default(),rhythm.unwrap_or_default(),instance.get_param("midi_fx1:motion_grid_config").unwrap_or_default()))')
    # A sequencer edge changes runtime ownership, not operation settings.
    source = source.replace('if key.starts_with("midi_fx1:motion_")', 'if key == "midi_fx1:motion_sequence_mask" {} else if key.starts_with("midi_fx1:motion_")')
    path.write_text(source)

    path = root / 'src/seq/step-edit.ts'
    source = path.read_text()+"\n/** Register an explicit editor range using the existing step-parameter lifecycle. */\nexport function editRangeDown(owner:number,start:number,end:number):void {\n    heldRanges.set(owner,{s0:start,s1:end});gestured.add(owner);pressMs.set(owner,Date.now());\n}\n"
    path.write_text(source)
    (root / 'browser-test/hb-grid.mjs').write_text((assets / 'hb-grid.mjs').read_text())

    for relative in ['src/seq/constants.ts','engine/crates/movy-dsp/src/lib.rs','browser-test/mock-engine.mjs']:
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-hb51','0.71.0-hb200'))
