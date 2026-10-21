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
    source_positions: [u32; NUM_TRACKS],''')
    source = replace_once(source, '            hb_weave:', '''            source_routes: [Default::default(); NUM_TRACKS],
            source_cursors: [Default::default(); NUM_TRACKS],
            source_positions: [0; NUM_TRACKS],
            hb_weave:''')
    source = replace_once(source, '                if let Some(slot) = t.queued_slot.take() {', '''                if let Some(slot) = t.queued_slot.take() {
                    for actor in 0..NUM_TRACKS {
                        if actor==index || self.source_cursors[actor].source.is_some_and(|source|source.track==index) {
                            self.source_cursors[actor]=Default::default();
                        }
                    }''')
    source = replace_once(source, '    fn start_transport(&mut self) {', '    fn start_transport(&mut self) {\n        self.source_cursors.fill(Default::default());')
    source = replace_once(source, '        if self.count_in_left == 0 {\n            for ti in 0..NUM_TRACKS {', '''        if self.count_in_left == 0 {
            for ti in 0..NUM_TRACKS { self.source_positions[ti]=self.tracks[ti].pos_tick; }
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
    source += helper + '\n' + (assets / 'source_engine.rs').read_text()
    tests: Path = assets / 'source_engine_tests.rs'
    if tests.exists():
        source += '\n' + tests.read_text()
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text()
    source = replace_once(source, '| "mute" | "bpm" | "swing"', '| "mute" | "bpm" | "swing" | "source"')
    source = replace_once(source, '        "swing" => {', '        "source" => { engine.source_route_set(&it.collect::<Vec<_>>().join(" ")); }\n        "swing" => {')
    path.write_text(source)
    path = core / 'persist.rs'
    source = path.read_text()
    source = replace_once(source, '    for (ti, t) in engine.tracks.iter().enumerate() {', '''    for (actor, route) in engine.source_routes.iter().enumerate() {
        if *route != Default::default() {s.push_str(&format!("sr {}\\n",route.message(actor)));}
    }
    for (ti, t) in engine.tracks.iter().enumerate() {''')
    source = replace_once(source, '    engine.host_transport_attached = false;', '    engine.host_transport_attached = false;\n    engine.source_routes.fill(Default::default());')
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
            key if key.starts_with("source_route_") => key[13..].parse::<usize>().ok()
                .and_then(|actor|self.engine.source_routes.get(actor).map(|route|route.message(actor))),
            "motif_load_result" => Some(self.engine.motif_load_result.clone()),''')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(replace_once(path.read_text(), "    'mute', 'bpm', 'swing',", "    'mute', 'bpm', 'swing', 'source',"))
    # Existing Joint Play panel framework handles the new per-actor controls.
    (root / 'src/seq/source-panels.ts').write_text((assets / 'source-panels.ts').read_text())
    path = root / 'src/seq/joint-panels.ts'
    source = "import { sourceParameters, sourceKeys, sourcePanelGet, sourcePanelSet } from './source-panels.js';\n" + path.read_text()
    source = replace_once(source, 'export const jointParameters=[...setup,...recording,...participation,...display];', 'export const jointParameters=[...setup,...recording,...participation,...display,...sourceParameters];')
    source = replace_once(source, "        root.params.push({level:'joint_rhythm_'+role});", '''        const sourceLevel='joint_sources_'+role;
        const routeKeys=sourceKeys(role);
        hierarchy.levels[sourceLevel]={name:name+' Sources',knobs:routeKeys,params:routeKeys.map(key=>({key}))};
        hierarchy.levels['joint_actor_'+role].params.push({level:sourceLevel});
        root.params.push({level:sourceLevel});
        root.params.push({level:'joint_rhythm_'+role});''')
    source = source.replace('        const meta=jointParameters.find(parameter=>parameter.key===bare);', '''        const sourceValue=sourcePanelGet(base,bare);if(sourceValue!==null)return key.endsWith(':modulated')?'0':sourceValue;
        const meta=jointParameters.find(parameter=>parameter.key===bare);''', 1)
    # The get/set metadata lookup appears twice; use the setter's unique anchor.
    source = replace_once(source, "        const bare=key.split(':').pop()??'';", "        const bare=key.split(':').pop()??'';\n        if(sourcePanelSet(base,bare,value))return true;")
    path.write_text(source)

    # Match the new native source-routing contract on both sides of the bridge.
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-hb209-field5', '0.71.0-hb210-weave1'))
