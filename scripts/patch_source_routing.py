"""Route accepted source attacks through the existing sequencer gate owner."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_source_routing(root: Path) -> None:
    """Extract shared note emission and install opt-in raw source routing."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/actor-source'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'source_route.rs').write_text((assets / 'source_route.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod source_route;\n')
    path = core / 'engine.rs'
    source: str = path.read_text()
    source = replace_once(source, 'struct Gate {', 'struct Gate {\n    clock_track: u8,')
    source = replace_once(source, 'pub struct Engine {', '''pub struct Engine {
    pub source_routes: [crate::source_route::Route; NUM_TRACKS],
    source_cursors: [crate::source_route::Cursor; NUM_TRACKS],
    source_positions: [u32; NUM_TRACKS],
    source_grid_active: [bool; NUM_TRACKS],
    source_automation_seen: [Option<crate::source_route::AutomationPhase>; NUM_TRACKS],
    source_automation_mask: [u8; NUM_TRACKS],''')
    source = replace_once(source, '            hb_weave:', '''            source_routes: [Default::default(); NUM_TRACKS],
            source_cursors: [Default::default(); NUM_TRACKS],
            source_positions: [0; NUM_TRACKS],
            source_grid_active: [false; NUM_TRACKS],
            source_automation_seen: [None; NUM_TRACKS],
            source_automation_mask: [0; NUM_TRACKS],
            hb_weave:''')
    source = replace_once(source, '                if let Some(slot) = t.queued_slot.take() {', '''                if let Some(slot) = t.queued_slot.take() {
                    self.source_automation_seen.fill(None);
                    for actor in 0..NUM_TRACKS {
                        if actor==index || self.source_cursors[actor].source.is_some_and(|source|source.track==index) {
                            self.source_cursors[actor]=Default::default();
                        }
                    }''')
    source = replace_once(source, '    fn start_transport(&mut self) {', '    fn start_transport(&mut self) {\n        self.source_cursors.fill(Default::default());\n        self.source_automation_seen.fill(None);')
    source = replace_once(source, '        if self.count_in_left == 0 {\n            for ti in 0..NUM_TRACKS {', '''        if self.count_in_left == 0 {
            for ti in 0..NUM_TRACKS { self.source_positions[ti]=self.tracks[ti].pos_tick; }
            self.source_automation_tick(out);
            self.source_grid_tick(out);
            for ti in 0..NUM_TRACKS {''')
    source = source.replace('if self.gates[gi].track == ti as u8 {', 'if self.gates[gi].clock_track == ti as u8 {')
    source = source.replace('if self.gates[gi].track==ti as u8 {', 'if self.gates[gi].clock_track==ti as u8 {')
    source = replace_once(source, 'if !self.tracks[ti].muted {\n                        out.push(OutEvent::PolyPressure', 'if !self.tracks[gate.track as usize].muted {\n                        out.push(OutEvent::PolyPressure')
    source = replace_once(source, '            if serviced {\n                gi += 1;', '''            let owner=self.gates[gi].clock_track as usize;
            let clock_serviced=self.tracks[owner].playing_slot.map(|slot|self.tracks[owner].clips[slot].exists()).unwrap_or(false);
            if serviced && clock_serviced {
                gi += 1;''')
    # Keep every existing transpose/action/pressure/retrigger rule in one helper.
    begin: int = source.index('                        // Non-destructive clip transpose: shift only the emitted')
    end: int = source.index('\n                    }\n                }\n                // Advance + wrap', begin)
    emission: str = source[begin:end]
    emission = emission.replace('self.clip_transpose(ti, slot)', 'self.clip_transpose(source_track, slot)').replace('self.clip_transpose(ti,slot)', 'self.clip_transpose(source_track,slot)')
    emission = emission.replace('if !n.rendered {\n                            let clip=', 'if !n.rendered && source_track==ti {\n                            let clip=')
    emission = emission.replace('let clip=&self.tracks[ti].clips[slot];', 'let clip=&self.tracks[source_track].clips[slot];')
    emission = emission.replace('(hb_window.is_some() || hb_rhythm.enabled() || gate.hb_modified)', '(modified || hb_window.is_some() || hb_rhythm.enabled() || gate.hb_modified)')
    emission = emission.replace('self.gates.push(Gate {', 'self.gates.push(Gate {\n                            clock_track: clock_track as u8,')
    emission = emission.replace('hb_window.is_some()||humanize.time_active(ti)||hb_rhythm.enabled()', 'modified||hb_window.is_some()||hb_rhythm.enabled()')
    emission = emission.replace('weave.map_or_else(||hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)),|(_,gate)|gate)', 'gate_override.unwrap_or_else(||hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)))')
    helper: str = '''
impl Engine {
    fn emit_clip_note(&mut self, ti: usize, source_track: usize, slot: usize,
        n: crate::clip::Note, gate_override: Option<u32>,
        hb_window: Option<crate::hb_clip_performance::ReadWindow>,
        hb_rhythm: crate::hb_render_rhythm::Rhythm, modified: bool,
        clock_track: usize, out: &mut Vec<OutEvent>) {
''' + emission + '\n    }\n}\n'
    source = source[:begin] + '''                        let duration=weave.map_or_else(||hb_window.map_or(n.gate.max(1),|window|window.duration(n.gate)),|(_,gate)|gate);
                        if n.vel>0 {source_duration=Some(source_duration.map_or(duration,|previous:u32|previous.max(duration)));}
                        if !self.source_routes[ti].enabled || joint_recording_here {
                            self.emit_clip_note(ti,ti,slot,n,weave.map(|(_,gate)|gate),hb_window,hb_rhythm,humanize.time_active(ti),ti,out);
                        }''' + source[end:]
    source = replace_once(source, '            if !muted {\n                    let len =', '            let mut source_duration: Option<u32> = None;\n            if !muted {\n                    let len =')
    source = replace_once(source, '                // Advance + wrap inside the loop window', '''                if let Some(duration)=source_duration { self.source_attack(ti,slot,duration,out); }
                // Advance + wrap inside the loop window''')
    source = replace_once(source, '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {',
        '    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {\n        self.source_automation_release(out);')
    source = replace_once(source, '            let base = self.tracks[track].lane_base[lane as usize];',
        '            if self.source_automation_mask[track] & (1 << lane) != 0 {continue;}\n            let base = self.tracks[track].lane_base[lane as usize];')
    for signature, notification in (
        ('pub fn auto_label(&mut self, track: usize, lane: usize, label: &str) {', 'self.source_automation_edited(track,lane,None);'),
        ('pub fn auto_base(&mut self, track: usize, lane: usize, val: u8, out: &mut Vec<OutEvent>) {', 'self.source_automation_edited(track,lane,Some(val));'),
        ('pub fn auto_base_quiet(&mut self, track: usize, lane: usize, val: u8) {', 'self.source_automation_edited(track,lane,Some(val));'),
        ('pub fn auto_set(&mut self, track: usize, lane: usize, step: u16, val: u8, out: &mut Vec<OutEvent>) {', 'self.source_automation_edited(track,lane,Some(val));'),
        ('pub fn auto_set_range(&mut self, track: usize, lane: usize, s0: u16, s1: u16, val: u8, out: &mut Vec<OutEvent>) {', 'self.source_automation_edited(track,lane,Some(val));'),
        ('pub fn auto_clear(&mut self, track: usize, lane: usize) {', 'self.source_automation_invalidate();'),
    ):
        source = replace_once(source, signature, signature + '\n        ' + notification)
    source += helper + '\n' + (assets / 'source_engine.rs').read_text() + '\n' + (assets / 'source_automation.rs').read_text()
    tests: Path = assets / 'source_engine_tests.rs'
    if tests.exists():
        source += '\n' + tests.read_text()
    source += '\n' + (assets / 'source_instrument_tests.rs').read_text()
    source += '\n' + (assets / 'source_hb_tests.rs').read_text()
    source += '\n' + (assets / 'source_operations_tests.rs').read_text()
    source += '\n' + (assets / 'source_grid.rs').read_text()
    source += '\n' + (assets / 'source_grid_tests.rs').read_text()
    path.write_text(source)
    path = core / 'grid.rs'
    source = path.read_text()
    source = replace_once(source, 'let next=if state.muted {0} else {state.playing_slot.map_or(0,|slot|mask(&state.clips[slot],state.pos_tick))};',
        'let next=self.source_grid_mask(track);')
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text()
    source = replace_once(source, '            apply_op(engine, op, out);', '            apply_op(engine, op, out);\n            if is_undoable_edit(verb) || verb=="uswap" {engine.source_automation_invalidate();}')
    source = replace_once(source, '| "mute" | "bpm" | "swing"', '| "mute" | "bpm" | "swing" | "source"')
    source = replace_once(source, '        "swing" => {', '        "source" => { engine.source_route_set(&it.collect::<Vec<_>>().join(" ")); }\n        "swing" => {')
    path.write_text(source)
    path = core / 'persist.rs'
    source = path.read_text()
    source = replace_once(source, '    for (ti, t) in engine.tracks.iter().enumerate() {', '''    for (actor, route) in engine.source_routes.iter().enumerate() {
        if *route != Default::default() {s.push_str(&format!("sr {}\\n",route.message(actor)));}
    }
    for (ti, t) in engine.tracks.iter().enumerate() {''')
    source = replace_once(source, '    engine.host_transport_attached = false;', '    engine.host_transport_attached = false;\n    engine.source_routes.fill(Default::default());\n    engine.source_automation_invalidate();')
    source = replace_once(source, '            Some("swing") => {', '            Some("sr") => {engine.source_route_set(&it.collect::<Vec<_>>().join(" "));}\n            Some("swing") => {')
    path.write_text(source)
    # A configured source route replaces the clip side of Joint Follow/Guide,
    # while the existing held-note stack still pairs releases after edits.
    path = root / 'engine/crates/movy-dsp/src/joint_links.rs'
    source = path.read_text()
    source = replace_once(source, '    pub fn route(&mut self,event:Event,playback:bool)->Option<Event> {', '''    pub fn route(&mut self,event:Event,playback:bool)->Option<Event> {
        self.route_source(event,playback,0)
    }
    pub fn route_source(&mut self,event:Event,playback:bool,blocked:u16)->Option<Event> {''')
    source = replace_once(source, '                let (track,shift)=self.routes[event.track]?;', '                let (track,shift)=self.routes[event.track]?;\n                if blocked & (1 << track) != 0 {return None;}')
    source = replace_once(source, '        let index=track*128+pitch as usize;\n        if !on', '''        self.playback_source_pitch(track,pitch,on,false)
    }
    pub fn playback_source_pitch(&mut self,track:usize,pitch:u8,on:bool,source:bool)->Option<u8> {
        let index=track*128+pitch as usize;
        if !on''')
    source = replace_once(source, '        let output=if self.derived(track)', '        let output=if source {Some(pitch)} else if self.derived(track)')
    source += '\n' + (assets / 'source_dsp_tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, 'self.joint_links.route(event,playback)', 'self.joint_links.route_source(event,playback,if playback {self.engine.source_routes.iter().enumerate().fold(0u16,|mask,(track,route)|mask|if route.enabled {1<<track}else{0})} else {0})')
    source = replace_once(source, 'self.joint_links.playback_pitch(track as usize,pitch,true)', 'self.joint_links.playback_source_pitch(track as usize,pitch,true,self.engine.source_routes[track as usize].enabled)')
    source = replace_once(source, '            "motif_load_result" => Some(self.engine.motif_load_result.clone()),', '''            "source_diagnostics" => Some(self.engine.source_diagnostics()),
            key if key.starts_with("source_preview_") => key[15..].parse::<usize>().ok()
                .and_then(|actor|self.engine.source_preview(actor)),
            key if key.starts_with("source_route_") => key[13..].parse::<usize>().ok()
                .and_then(|actor|self.engine.source_routes.get(actor).map(|route|route.message(actor))),
            "motif_load_result" => Some(self.engine.motif_load_result.clone()),''')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(replace_once(path.read_text(), "    'mute', 'bpm', 'swing',", "    'mute', 'bpm', 'swing', 'source',"))
    # Existing Joint Play panel framework handles the new per-actor controls.
    (root / 'src/seq/source-panels.ts').write_text((assets / 'source-panels.ts').read_text())
    (root / 'src/seq/source-overview.ts').write_text((assets / 'source-overview.ts').read_text())
    path = root / 'src/seq/joint-panels.ts'
    source = "import { overviewParameters, overviewHierarchy, overviewGet, overviewKey, resetOverview } from './source-overview.js';\nimport { sourceParameters, sourceKeys, sourcePanelGet, sourcePanelSet } from './source-panels.js';\n" + path.read_text()
    source = replace_once(source, 'export const jointParameters=[...setup,...recording,...participation,...display];', 'export const jointParameters=[...setup,...recording,...participation,...display,...sourceParameters];')
    source = replace_once(source, "        root.params.push({level:'joint_rhythm_'+role});", '''        const sourceLevel='joint_sources_'+role;
        const allSourceKeys=sourceKeys(role);
        const routeKeys=allSourceKeys.slice(0,8);
        const automationKeys=allSourceKeys.slice(8,12);
        const operationKeys=allSourceKeys.slice(12);
        const operationLevel='joint_source_operations_'+role;
        hierarchy.levels[operationLevel]={name:name+' Source Operations',knobs:operationKeys,params:operationKeys.map(key=>({key}))};
        hierarchy.levels['joint_actor_'+role].params.push({level:operationLevel});
        root.params.push({level:operationLevel});
        const automationLevel='joint_source_automation_'+role;
        hierarchy.levels[automationLevel]={name:name+' Source Automation',knobs:automationKeys,params:automationKeys.map(key=>({key}))};
        hierarchy.levels['joint_actor_'+role].params.push({level:automationLevel});
        root.params.push({level:automationLevel});
        hierarchy.levels[sourceLevel]={name:name+' Sources',knobs:routeKeys,params:routeKeys.map(key=>({key}))};
        hierarchy.levels['joint_actor_'+role].params.push({level:sourceLevel});
        root.params.push({level:sourceLevel});
        root.params.push({level:'joint_rhythm_'+role});''')
    source = source.replace('        const meta=jointParameters.find(parameter=>parameter.key===bare);', '''        const overviewValue=overviewGet(base,bare);if(overviewValue!==null)return key.endsWith(':modulated')?'0':overviewValue;
        const sourceValue=sourcePanelGet(base,bare);if(sourceValue!==null)return key.endsWith(':modulated')?'0':sourceValue;
        const meta=jointParameters.find(parameter=>parameter.key===bare);''', 1)
    # The get/set metadata lookup appears twice; use the setter's unique anchor.
    source = replace_once(source, "        const bare=key.split(':').pop()??'';", "        const bare=key.split(':').pop()??'';\n        if(overviewKey(bare))return true;\n        if(sourcePanelSet(base,bare,value))return true;")
    source = source.replace('return hierarchy;', 'return overviewHierarchy(hierarchy);')
    source = source.replace('...jointParameters,...actorParameters', '...jointParameters,...overviewParameters,...actorParameters')
    source = source.replace('export function resetJointPanels():void {', 'export function resetJointPanels():void {resetOverview();')
    path.write_text(source)

    # Match the new native source-routing contract on both sides of the bridge.
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-hb209-field5', '0.71.0-hb214-hbrender1'))
