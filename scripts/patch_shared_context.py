"""Record clip-owned global harmony contributions and expose their ownership."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_shared_context(root: Path) -> None:
    """Install bounded event storage and the conductor aggregation barrier."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/shared-context'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'shared_context.rs').write_text((assets / 'shared_context.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text()+'\npub mod shared_context;\n')
    path = core / 'clip.rs'
    source: str = path.read_text().replace('pub struct Clip {','pub struct Clip {\n    pub shared_events: Vec<crate::shared_context::Event>,')
    source = source.replace('        Clip {','        Clip {\n            shared_events: Vec::new(),')
    source = source.replace('    pub fn clear(&mut self) {','    pub fn clear(&mut self) {\n        self.shared_events.clear();')
    source = source.replace('        self.length_steps = len * 2;','''        let shared_copies:Vec<_>=self.shared_events.iter().filter(|event|event.tick>=start as u32*TICKS_PER_STEP&&event.tick<(start+len) as u32*TICKS_PER_STEP).map(|event|{let mut copy=*event;copy.tick+=span_ticks;copy}).collect();
        self.shared_events.extend(shared_copies.into_iter().take(crate::shared_context::LIMIT.saturating_sub(self.shared_events.len())));
        self.shared_events.sort_by_key(|event|(event.kind,event.tick));
        self.length_steps = len * 2;''')
    path.write_text(source)
    path=core/'engine.rs'
    source=path.read_text().replace('pub enum OutEvent {','''pub enum OutEvent {
    SharedFrame, SharedReset,
    SharedContext {track:u8,kind:u8,value:crate::shared_context::Value,order:u64},
    SharedKeySequence {track:u8,state:crate::shared_context::KeySequence},
    SharedAnchor {track:u8,pitch:u8,value:crate::shared_context::Value},
    SharedRecord {track:i32},
    SharedHandoff {track:u8},''')
    source=source.replace('pub struct Engine {','''pub struct Engine {
    pub key_playback: [crate::shared_context::KeyPlayback;16],
    pub shared_seen: [[Option<(usize,crate::shared_context::Event)>;3];16],
    pub shared_tick_seen: [u64;16],
    pub shared_recording: Option<usize>,
    pub shared_reset_needed: bool,''')
    source=source.replace('            follower_inputs: [None;16],','''            follower_inputs: [None;16],
            key_playback: std::array::from_fn(|_|crate::shared_context::KeyPlayback::default()),
            shared_seen: [[None;3];16],shared_tick_seen:[u64::MAX;16],shared_recording:None,shared_reset_needed:false,''')
    source=source.replace('    pub fn follower_input_context(&mut self, message: &str) {','    pub fn follower_input_context(&mut self, message: &str) {\n        self.shared_capture(message);')
    source=source.replace('Humanize::parse(humanize,','Humanize::parse(humanize.split(\'|\').next().unwrap_or(""),')
    source=source.replace('    fn service_tick(&mut self, out: &mut Vec<OutEvent>) {','    fn service_tick(&mut self, out: &mut Vec<OutEvent>) {\n        out.push(OutEvent::SharedFrame);\n        self.shared_transport(out);')
    source=source.replace('    fn step_tick(&mut self, ti: usize, out: &mut Vec<OutEvent>) {','    fn step_tick(&mut self, ti: usize, out: &mut Vec<OutEvent>) {\n        self.shared_track(ti,out);')
    source=source.replace('                        out.push(OutEvent::RecordedActions {track:ti as u8,pitch:emit_pitch,','''                        if !n.rendered {
                            let clip=&self.tracks[ti].clips[slot];
                            if let Ok(index)=clip.shared_events.binary_search_by_key(&(0,n.tick),|event|(event.kind,event.tick)) {
                                let event=clip.shared_events[index];
                                if event.value.on&&((event.value.c>>1)&255)==n.pitch as i32+1 {
                                    out.push(OutEvent::SharedAnchor{track:ti as u8,pitch:emit_pitch,value:if self.key_playback[ti].sequence.valid {self.key_playback[ti].value}else{event.value}});
                                }
                            }
                        }
                        out.push(OutEvent::RecordedActions {track:ti as u8,pitch:emit_pitch,''')
    source=source.replace('        let live_link = self.link_enabled;','        let live_key_playback=self.key_playback.clone();\n        let live_link = self.link_enabled;')
    source=source.replace('        self.link_enabled = live_link;','        self.key_playback=live_key_playback;\n        self.link_enabled = live_link;')
    source=source.replace('    fn start_transport(&mut self) {','    fn start_transport(&mut self) {\n        self.key_playback=std::array::from_fn(|_|crate::shared_context::KeyPlayback::default());\n        self.shared_seen=[[None;3];16];')
    source=source.replace('            for (t,performance) in self.tracks.iter_mut().zip(self.hb_performance.iter_mut()) {','''            for (index,(t,performance)) in self.tracks.iter_mut().zip(self.hb_performance.iter_mut()).enumerate() {
                if t.queued_slot.is_some()||t.pending_stop {self.key_playback[index].reset();self.shared_seen[index]=[None;3];}''')
    source+='\n'+(assets/'engine.rs').read_text()
    path.write_text(source)
    path=core/'persist.rs'
    source=path.read_text().replace('    engine.follower_inputs.fill(None);','    engine.follower_inputs.fill(None);\n    engine.key_playback=std::array::from_fn(|_|crate::shared_context::KeyPlayback::default());engine.shared_seen=[[None;3];16];engine.shared_tick_seen=[u64::MAX;16];engine.shared_recording=None;engine.shared_reset_needed=true;')
    source=source.replace('            for interval in &c.operation_intervals {','''            for event in &c.shared_events {
                s.push_str(&format!("sc {} {} {} {} {} {} {} {}\\n",ti,ci,event.tick,event.kind,event.value.on as u8,event.value.a,event.value.b,event.value.c));
            }
            for interval in &c.operation_intervals {''')
    source=source.replace('        match it.next() {','''        match it.next() {
            Some("sc")=>{
                let fields:Vec<i64>=it.map(str::parse).collect::<Result<_,_>>().unwrap_or_default();
                if let [track,clip,tick,kind,on,a,b,c]=fields.as_slice(){
                    if *track>=0&&*clip>=0&&*tick>=0&&*tick<=u32::MAX as i64 {
                        if let Some((_,kind,value))=crate::shared_context::parse(&format!("sc1,{},{},{},{},{},{}",track,kind,on,a,b,c)) {
                            if let Some(target)=engine.tracks.get_mut(*track as usize).and_then(|track|track.clips.get_mut(*clip as usize)) {
                                crate::shared_context::record(&mut target.shared_events,crate::shared_context::Event{tick:*tick as u32,kind,value});
                            }
                        }
                    }
                }
            },''',1)
    path.write_text(source)
    path=root/'engine/crates/movy-dsp/src/chain_slots.rs'
    source=path.read_text().replace('    pub fn hb_input_context(&mut self) -> String {','''    pub fn hb_shared(&mut self,key:&str,value:&str) {
        // Shared storage is inside the common HB library: send once through
        // the first loaded chain, not sixteen duplicate settings edits.
        for instance in self.slots.iter_mut().flatten(){
            if instance.get_param("midi_fx1:shared_context_snapshot").is_some_and(|snapshot|snapshot.starts_with("dp1|")) {
                instance.set_param(key,value);break;
            }
        }
    }
    pub fn hb_input_context(&mut self) -> String {''')
    path.write_text(source)
    path=root/'engine/crates/movy-dsp/src/lib.rs'
    source=path.read_text()
    source=replace_once(source,'    fn drain_out(&mut self) {','''    fn drain_out(&mut self) {
        // Aggregate each sequencer batch before any of its notes are rendered.
        let mut shared_end=0;
''')
    source=replace_once(source,'            match self.out[i] {','''            if i>=shared_end {
                shared_end=(i+1..self.out.len()).find(|&end|matches!(self.out[end],OutEvent::SharedFrame)).unwrap_or(self.out.len());
                let mut changed=false;
                for index in i..shared_end {
                    match self.out[index] {
                        OutEvent::SharedContext{track,kind,value,order}=>{
                            self.chains.hb_shared("midi_fx1:hb_shared_context",&format!("{},{},{},{},{},{},{}",track,kind,value.on as u8,value.a,value.b,value.c,order));changed=true;
                        },
                        OutEvent::SharedKeySequence{track,state}=>{self.chains.hb_shared("midi_fx1:hb_key_sequence_state",&state.wire(track));changed=true;},
                        OutEvent::SharedReset=>{self.chains.hb_shared("midi_fx1:hb_shared_reset","");changed=true;},
                        OutEvent::SharedRecord{track}=>self.chains.hb_shared("midi_fx1:hb_shared_record",&track.to_string()),
                        OutEvent::SharedHandoff{track}=>{self.chains.hb_shared("midi_fx1:hb_shared_handoff",&track.to_string());changed=true;},
                        _=>{}
                    }
                }
                if changed {self.chains.hb_shared("midi_fx1:hb_shared_flush","");}
            }
            match self.out[i] {
                OutEvent::SharedKeySequence{..}|OutEvent::SharedReset|OutEvent::SharedFrame|OutEvent::SharedContext{..}|OutEvent::SharedRecord{..}|OutEvent::SharedHandoff{..}=>{},
                OutEvent::SharedAnchor{track,pitch,value}=>self.chains.hb_shared("midi_fx1:hb_shared_anchor",&format!("{},{},{},{}",track,pitch,value.b,value.c)),''')
    source=source.replace('        self.drain_out();\n        // Every conductor','        self.engine.shared_transport(&mut self.out);\n        self.drain_out();\n        // Every conductor')
    source=source.replace('if seq_core::persist::load(&mut self.engine, val) {','if seq_core::persist::load(&mut self.engine, val) {\n                    self.chains.hb_shared("midi_fx1:hb_shared_reset","All");')
    path.write_text(source)
    # Reuse the existing bounded, single-snapshot live panel path.
    for filename in ['src/renderer/schwung-page.ts','src/model/store.ts']:
        path=root/filename
        source=path.read_text()
        source=source.replace("pageKeys?.includes('next_position') ? 'next_harm' :", "pageKeys?.includes('shared_context_0') ? 'shared_context' : pageKeys?.includes('next_position') ? 'next_harm' :")
        source=source.replace("keys.includes('next_position') ? 'next_harm' :", "keys.includes('shared_context_0') ? 'shared_context' : keys.includes('next_position') ? 'next_harm' :")
        path.write_text(source)
    path=root/'src/app/tick.ts'
    path.write_text(path.read_text().replace("key === 'next_position'", "key === 'shared_context_0' || key === 'next_position'"))
