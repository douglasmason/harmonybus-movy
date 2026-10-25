//! Runtime conductor-clip metadata. No allocation, persisted data, or UI polling.
use seq_core::engine::Engine;
use seq_core::PPQN;
use std::fmt::{self, Write};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Snapshot {
    pub tick: u64,
    pub track: u8,
    pub slot: u8,
    pub period: u64,
    pub origin: u64,
    pub revision: u64,
    pub active: u8, // 0 empty/stopped lane, 1 periodic, 2 nonperiodic
    pub running: bool,
}
fn gcd(mut left: u64, mut right: u64) -> u64 {
    while right != 0 { let rem = left % right; left = right; right = rem; }
    left
}
fn hash(state: &mut u64, value: u64) { *state = (*state ^ value).wrapping_mul(1099511628211); }
pub fn snapshot(engine: &Engine, track_index: usize) -> Snapshot {
    // advance_block leaves master_tick and track.pos_tick pointing to the NEXT
    // sequencer tick. Its outgoing MIDI only covers ticks through next_tick-1.
    // Publish that completed position so HB cannot release followers against
    // a chord whose conductor MIDI is still waiting for the next audio block.
    let next_tick = engine.hb_master_tick();
    let mut result = Snapshot { tick: next_tick.saturating_sub(1), track: track_index as u8,
        running: engine.playing, ..Snapshot::default() };
    let track = &engine.tracks[track_index];
    let Some(clip) = track.playing() else { return result; };
    result.slot = track.playing_slot.unwrap() as u8;
    if track.muted || !clip.exists() { return result; }
    let start = clip.loop_start_ticks();
    let end = clip.loop_end_ticks();
    let independent=engine.source_routes[track_index]
        .has_independent_sources(track_index,result.slot as usize);
    // Empty destination notes do not imply silence when pitches/rhythm can be
    // borrowed. Keep the conductor present so HB suspends a stale own-loop model.
    if !independent && !clip.notes.iter().any(|note| note.tick >= start && note.tick < end && note.vel > 0) { return result; }
    let numerator = u64::from(clip.scale_num.max(1));
    let denominator = u64::from(clip.scale_den.max(1));
    let window = u64::from(end - start) * denominator;
    result.period = window / gcd(window, numerator);
    let phase = (u64::from(track.pos_tick.saturating_sub(start)) * denominator + u64::from(track.scale_acc)) / numerator;
    // Both operands describe the next position; keep the loop origin in that
    // common coordinate system even though the published playhead is completed.
    result.origin = (next_tick % result.period + result.period - phase % result.period) % result.period;
    result.active = if independent {2} else {1};
    let mut revision = 14695981039346656037;
    for value in [track.playing_slot.unwrap() as u64, start as u64, end as u64, numerator, denominator,
                  clip.transpose as i64 as u64, clip.quant as u64] { hash(&mut revision, value); }
    for note in &clip.notes {
        if note.tick >= start && note.tick < end {
            for value in [note.tick as u64, note.gate as u64, note.pitch as u64, note.vel as u64, note.step as u64, note.rendered as u64] { hash(&mut revision,value); }
            if let Some(key) = note.input_key {
                for value in [1, key.root as u64, key.scale as u64, key.transpose as i64 as u64] { hash(&mut revision,value); }
            } else { hash(&mut revision,0); }
            if let Some(actions) = note.actions { for value in actions { hash(&mut revision,value); } }
        }
    }
    if let Some(key) = clip.input_key {
        for value in [key.root as u64, key.scale as u64, key.transpose as i64 as u64] { hash(&mut revision,value); }
    }
    for lock in &clip.locks {
        for value in [lock.lane as u64, lock.step as u64, lock.val as u64] { hash(&mut revision,value); }
    }
    for interval in &clip.operation_intervals {
        for value in [interval.start as u64, interval.length as u64, interval.origin as u64,
            interval.age, interval.lane as u64, interval.operation as u64, interval.amount as i64 as u64, interval.grid as u64] { hash(&mut revision,value); }
    }
    // Version the expanded content identity so persisted pre-audit timelines
    // cannot be reused under the new contract. Runtime playheads/flags are not
    // content revisions; mutation paths remain covered by direct reads.
    hash(&mut revision, 0x48424c4f4f5032);
    hash(&mut revision, clip.grid_gates.len() as u64);
    for gate in &clip.grid_gates {
        for value in [gate.start as u64, gate.end as u64, gate.lane as u64] {hash(&mut revision,value);}
    }
    hash(&mut revision, clip.shared_events.len() as u64);
    for event in &clip.shared_events {
        for value in [event.tick as u64,event.kind as u64,event.value.on as u64,
            event.value.a as i64 as u64,event.value.b as i64 as u64,event.value.c as i64 as u64] {hash(&mut revision,value);}
    }
    hash(&mut revision, clip.trigs.len() as u64);
    for trig in &clip.trigs {
        for value in [trig.step as u64,trig.lane.map_or(128,u64::from),trig.props.prob as u64,
            trig.props.cond_a as u64,trig.props.cond_b as u64,trig.props.invert as u64] {hash(&mut revision,value);}
    }
    for lane in 0..8 {
        hash(&mut revision,track.lane_assigned[lane] as u64);
        hash(&mut revision,track.lane_base[lane] as u64);
        hash(&mut revision,track.lane_label[lane].len() as u64);
        for byte in track.lane_label[lane].bytes() {hash(&mut revision,u64::from(byte));}
    }
    // Probability and multi-pass conditions need a longer/non-deterministic model.
    // Do not claim their nominal clip loop is an exact repeating harmony cycle.
    if clip.trigs.iter().any(|trig| trig.props.prob != 100 || trig.props.cond_b != 1 || trig.props.invert) {
        result.active = 2;
    }
    result.revision = revision;
    result
}
pub struct Message<const CAPACITY: usize = 192> { bytes: [u8; CAPACITY], len: usize }
impl<const CAPACITY: usize> Write for Message<CAPACITY> {
    fn write_str(&mut self, text: &str) -> fmt::Result {
        if self.len + text.len() >= self.bytes.len() { return Err(fmt::Error); }
        self.bytes[self.len..self.len + text.len()].copy_from_slice(text.as_bytes());
        self.len += text.len(); Ok(())
    }
}
impl Snapshot {
    pub fn message(self) -> Message {
        let mut message = Message { bytes: [0;192], len:0 };
        write!(&mut message,"{},{},{},{},{},{},{},{},{}",self.tick,self.period,self.origin,self.revision,self.active,self.running as u8,PPQN,self.track,self.slot).unwrap();
        message
    }
}
pub fn block_message(block: u64, frames: usize, sample_rate: u32) -> Message {
    let mut message = Message { bytes:[0;192],len:0 };
    write!(&mut message,"{},{},{}",block,frames,sample_rate).unwrap();
    message
}
impl<const CAPACITY: usize> Message<CAPACITY> { pub fn as_c_str(&self) -> &std::ffi::CStr { std::ffi::CStr::from_bytes_with_nul(&self.bytes[..=self.len]).unwrap() } }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn follower_boundary_never_precedes_conductor_midi() {
        use seq_core::engine::OutEvent;
        use std::io::Write;
        for frames in [64, 250, 1000] {
            let mut engine = Engine::new(48000,12000);
            engine.playing = true;
            engine.tracks[0].playing_slot = Some(0);
            engine.tracks[0].clips[0].set_loop(0,32);
            for interval in [0,4,7] {
                engine.tracks[0].clips[0].add_note_raw(0,0,384,60+interval,100);
                engine.tracks[0].clips[0].add_note_raw(16,384,384,62+interval,100);
            }
            let mut trace = if frames == 64 {
                std::env::var("HB_TIMING_TRACE").ok().map(|path| std::fs::File::create(path).unwrap())
            } else { None };
            let mut events = Vec::new();
            let mut rendered_root = 60;
            let mut releases = 0;
            let mut boundary = 384;
            while engine.hb_master_tick() < 2305 {
                engine.advance_block(frames,&mut events);
                let current = snapshot(&engine,0);
                if let Some(file) = &mut trace {
                    writeln!(file,"T {}",current.message().as_c_str().to_str().unwrap()).unwrap();
                }
                // The real bridge publishes metadata, drains this MIDI batch,
                // then runs conductors and releases queued follower notes.
                for event in events.drain(..) {
                    match event {
                        OutEvent::NoteOn { track:0, pitch, vel } => {
                            if pitch == 60 || pitch == 62 { rendered_root = pitch; }
                            if let Some(file) = &mut trace { writeln!(file,"N 144 {pitch} {vel}").unwrap(); }
                        }
                        OutEvent::NoteOff { track:0, pitch } => {
                            if let Some(file) = &mut trace { writeln!(file,"N 128 {pitch} 0").unwrap(); }
                        }
                        _ => {}
                    }
                }
                if let Some(file) = &mut trace { writeln!(file,"E").unwrap(); }
                if current.tick >= boundary {
                    let expected_root = if (boundary / 384) % 2 == 1 { 62 } else { 60 };
                    assert_eq!(rendered_root,expected_root,
                        "follower released before chord MIDI: frames={frames}, boundary={boundary}, published={}",current.tick);
                    boundary += 384;
                    releases += 1;
                }
            }
            assert_eq!(releases,6);
        }
    }
    #[test]
    fn phases_and_revisions_survive_multiple_real_sequencer_wraps() {
        let mut engine = Engine::new(48000,12000);
        engine.playing = true;
        engine.tracks[0].playing_slot = Some(0);
        engine.tracks[0].clips[0].set_loop(0,48);
        engine.tracks[0].clips[0].add_note_raw(0,0,24,60,100);
        engine.tracks[1].clips[0].set_loop(0,64);
        engine.tracks[1].clips[0].add_note_raw(0,0,24,67,100);
        let first = snapshot(&engine,0);
        let mut events = Vec::new();
        for tick in 1..=4992 {
            engine.advance_block(250,&mut events);
            events.clear();
            if tick == 384 { engine.tracks[1].playing_slot = Some(0); }
            let current = snapshot(&engine,0);
            assert_eq!(current.origin,first.origin);
            assert_eq!(current.revision,first.revision);
            if tick >= 384 {
                let second = snapshot(&engine,1);
                assert_eq!(second.period,1536);
                assert_eq!(second.origin,384);
            }
        }
    }
    #[test]
    fn conductor_block_protocol() {
        assert_eq!(block_message(7,64,48000).as_c_str().to_bytes(),b"7,64,48000");
    }
    #[test]
    fn loop_metadata_tracks_playing_content_and_phase() {
        let mut engine = Engine::new(48000,12000);
        engine.tracks[0].playing_slot = Some(0);
        engine.tracks[0].clips[0].set_loop(16,48);
        engine.tracks[0].clips[0].add_note_raw(16,384,24,60,100);
        engine.tracks[0].pos_tick = 384;
        let first = snapshot(&engine,0);
        assert_eq!(first.period,1152); // 3 bars at 96 PPQN
        assert_eq!(first.active,1);
        engine.tracks[0].active_clip = 1; // edit target is NOT the playing clip
        assert_eq!(snapshot(&engine,0),first);
        engine.tracks[0].clips[0].notes[0].fired = true;
        assert_eq!(snapshot(&engine,0),first);
        engine.tracks[0].clips[0].notes[0].pitch = 62;
        assert_ne!(snapshot(&engine,0).revision,first.revision);
        engine.tracks[0].clips[0].scale_num=2;
        assert_eq!(snapshot(&engine,0).period,576);
        engine.tracks[0].muted=true;
        assert_eq!(snapshot(&engine,0).active,0);
        assert!(first.message().as_c_str().to_bytes().ends_with(b",96,0,0"));
    }
}

/// Preview the notes Play will start from, without advancing the engine or MIDI.
/// Uses the same source-key projection and recorded piano intent as playback.
pub fn opening_preview(engine: &Engine, track_index: usize) -> Message<12288> {
    let mut message=Message {bytes:[0;12288],len:0};
    let track=&engine.tracks[track_index];
    let slot=engine.song_entry_at(0).map(|entry|entry.0).unwrap_or(track.active_clip);
    let clip=&track.clips[slot];
    if engine.playing || track.muted || !clip.exists()
        || engine.source_routes[track_index].has_independent_sources(track_index,slot) {
        write!(&mut message,"0").unwrap();return message;
    }
    let first=clip.notes.iter().filter(|note|note.vel>0&&note.tick>=clip.loop_start_ticks()&&note.tick<clip.loop_end_ticks()).map(|note|note.tick).min();
    let Some(first)=first else {write!(&mut message,"0").unwrap();return message;};
    write!(&mut message,"1").unwrap();
    for note in clip.notes.iter().filter(|note|note.vel>0&&note.tick==first).take(8) {
        let projected=if note.rendered {note.pitch} else {match (note.input_key,engine.follower_inputs[track_index]) {
            (Some(source),Some(target))=>source.project(note.pitch,target),_=>note.pitch
        }};
        let normal=(projected as i32+engine.clip_transpose(track_index,slot)).clamp(0,127) as u8;
        let (pitch,actions)=seq_core::recorded_actions::piano_emit(note.pitch,normal,note.actions,note.input_key,engine.follower_inputs[track_index],engine.clip_transpose(track_index,slot));
        write!(&mut message,";{},{}",pitch,note.rendered as u8).unwrap();
        if let Some(words)=actions {for word in words {write!(&mut message,",{:x}",word).unwrap();}}
    }
    message
}

#[cfg(test)]
mod opening_tests {
    use super::*;
    #[test]
    fn stopped_preview_uses_selected_clip_and_never_starts_transport() {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].active_clip=1;
        engine.tracks[0].playing_slot=Some(0);
        engine.tracks[0].clips[0].add_note_raw(0,0,96,48,100);
        engine.tracks[0].clips[1].add_note_raw(0,0,96,60,100);
        engine.tracks[0].clips[1].add_note_raw(0,0,96,64,100);
        engine.tracks[0].clips[1].add_note_raw(4,96,96,67,100);
        let tick=engine.hb_master_tick();
        let message=opening_preview(&engine,0);
        assert_eq!(message.as_c_str().to_str().unwrap(),"1;60,0;64,0");
        assert!(!engine.playing);assert_eq!(engine.hb_master_tick(),tick);
        engine.tracks[0].muted=true;
        assert_eq!(opening_preview(&engine,0).as_c_str().to_str().unwrap(),"0");
        engine.tracks[0].muted=false;engine.playing=true;
        assert_eq!(opening_preview(&engine,0).as_c_str().to_str().unwrap(),"0");
    }
}

#[cfg(test)]
mod revision_audit_tests {
    use super::*;
    use seq_core::{command,grid,shared_context::{Event,Value}};
    fn setup()->Engine {
        let mut engine=Engine::new(48000,12000);
        engine.tracks[0].playing_slot=Some(0);
        engine.tracks[0].clips[0].set_loop(0,16);
        engine.tracks[0].clips[0].add_note_raw(0,0,24,60,100);
        engine
    }
    #[test]
    fn grid_and_shared_context_edits_invalidate_same_note_material() {
        let mut engine=setup();let plain=snapshot(&engine,0).revision;
        engine.tracks[0].clips[0].grid_gates.push(grid::Gate{start:0,end:24,lane:0});
        let held=snapshot(&engine,0).revision;assert_ne!(held,plain);
        engine.tracks[0].clips[0].grid_gates[0].end=48;
        assert_ne!(snapshot(&engine,0).revision,held);
        engine.tracks[0].clips[0].grid_gates.clear();assert_eq!(snapshot(&engine,0).revision,plain);
        engine.tracks[0].clips[0].shared_events.push(Event{tick:0,kind:1,value:Value{on:true,a:2,b:0,c:0}});
        let contextual=snapshot(&engine,0).revision;assert_ne!(contextual,plain);
        engine.tracks[0].clips[0].shared_events[0].value.a=3;
        assert_ne!(snapshot(&engine,0).revision,contextual);
    }
    #[test]
    fn trigger_identity_includes_lane_step_and_each_condition_value() {
        let mut engine=setup();let plain=snapshot(&engine,0).revision;
        engine.tracks[0].clips[0].trigs.push(seq_core::clip::Trig{step:0,lane:None,props:seq_core::clip::TrigProps::DEFAULT});
        for field in 0..6 {
            let before=snapshot(&engine,0).revision;
            let trig=&mut engine.tracks[0].clips[0].trigs[0];
            match field {0=>trig.step=1,1=>trig.lane=Some(60),2=>trig.props.prob=50,
                3=>trig.props.cond_a=2,4=>trig.props.cond_b=3,_=>trig.props.invert=true}
            assert_ne!(snapshot(&engine,0).revision,before);
        }
        assert_eq!(snapshot(&engine,0).active,2);
        engine.tracks[0].clips[0].trigs.clear();assert_eq!(snapshot(&engine,0).revision,plain);
    }
    #[test]
    fn automation_mapping_and_base_are_content_but_current_value_is_not() {
        let mut engine=setup();let mut events=Vec::new();
        let plain=snapshot(&engine,0).revision;
        engine.auto_label(0,0,"midi_fx1:chord_form");engine.auto_base(0,0,10,&mut events);
        let mapped=snapshot(&engine,0).revision;assert_ne!(mapped,plain);
        engine.auto_base(0,0,20,&mut events);let changed=snapshot(&engine,0).revision;assert_ne!(changed,mapped);
        engine.auto_label(0,0,"midi_fx1:chord_quality");assert_ne!(snapshot(&engine,0).revision,changed);
        let current=snapshot(&engine,0).revision;
        engine.tracks[0].auto_cur[0]=100;engine.tracks[0].last_auto_step=10;
        engine.tracks[0].clips[0].notes[0].fired=true;engine.tracks[0].cycle=9;
        assert_eq!(snapshot(&engine,0).revision,current);
    }
    #[test]
    fn grid_command_undo_load_and_slot_launch_keep_content_identity() {
        let mut engine=setup();let before=snapshot(&engine,0).revision;let mut events=Vec::new();
        command::apply_batch(&mut engine,"usnap 1;gtog 0 0 24 128 100",&mut events);
        let edited=snapshot(&engine,0).revision;assert_ne!(edited,before);
        let saved=seq_core::persist::serialize(&engine);
        let mut restored=Engine::new(48000,12000);assert!(seq_core::persist::load(&mut restored,&saved));
        restored.tracks[0].playing_slot=Some(0);assert_eq!(snapshot(&restored,0).revision,edited);
        command::apply_batch(&mut engine,"uswap 1 2",&mut events);assert_eq!(snapshot(&engine,0).revision,before);
        command::apply_batch(&mut engine,"uswap 2 3",&mut events);assert_eq!(snapshot(&engine,0).revision,edited);
        engine.tracks[0].clips[1]=engine.tracks[0].clips[0].clone();
        engine.tracks[0].playing_slot=Some(1);assert_ne!(snapshot(&engine,0).revision,edited);
        engine.tracks[0].playing_slot=Some(0);assert_eq!(snapshot(&engine,0).revision,edited);
        engine.tracks[0].muted=true;assert_eq!(snapshot(&engine,0).active,0);
        engine.tracks[0].muted=false;assert_eq!(snapshot(&engine,0).revision,edited);
    }
    #[test]
    fn live_shared_recording_invalidates_and_round_trips() {
        let mut engine=setup();engine.playing=true;engine.toggle_record(0);
        let before=snapshot(&engine,0).revision;
        engine.shared_capture("sc1,0,1,1,2,0,0");
        let recorded=snapshot(&engine,0).revision;assert_ne!(recorded,before);
        engine.shared_capture("sc1,0,1,1,3,0,0");
        assert_ne!(snapshot(&engine,0).revision,recorded);
        let saved=seq_core::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
        assert!(seq_core::persist::load(&mut restored,&saved));restored.tracks[0].playing_slot=Some(0);
        assert_eq!(snapshot(&restored,0).revision,snapshot(&engine,0).revision);
    }
}

#[cfg(test)]
mod revision_benchmark {
    use super::*;
    #[test]
    #[ignore = "release-mode producer cost, not a physical audio latency assertion"]
    fn hb_loop_snapshot_benchmark() {
        for dense in [false,true] {
            let mut engine=Engine::new(48000,12000);engine.tracks[0].playing_slot=Some(0);
            let clip=&mut engine.tracks[0].clips[0];clip.set_loop(0,256);
            for index in 0..if dense {512}else{16} {clip.add_note_raw(index as u16,index*6,6,60,100);}
            if dense {
                clip.grid_gates=vec![seq_core::grid::Gate{start:0,end:24,lane:0};4096];
                clip.shared_events=vec![seq_core::shared_context::Event{tick:0,kind:1,value:seq_core::shared_context::Value{on:true,a:2,b:0,c:0}};512];
                clip.trigs=vec![seq_core::clip::Trig{step:0,lane:None,props:seq_core::clip::TrigProps::DEFAULT};1024];
            }
            let start=std::time::Instant::now();
            for _ in 0..16_000 {std::hint::black_box(snapshot(std::hint::black_box(&engine),0));}
            println!("lookahead-snapshot dense={dense} samples=16000 elapsed_us={}",start.elapsed().as_micros());
        }
    }
}

#[cfg(test)]
mod woven_eligibility_tests {
    use super::*;
    use seq_core::source_route::{ClipRef,Route};
    fn setup()->Engine {
        let mut engine=Engine::new(48000,12000);
        for track in 0..3 {engine.tracks[track].playing_slot=Some(0);engine.tracks[track].clips[0].set_loop(0,16);}
        engine.tracks[0].clips[0].add_note_raw(0,0,24,48,100);
        engine.tracks[1].clips[0].set_loop(0,24);
        engine.tracks[1].clips[0].add_note_raw(0,0,24,60,100);
        engine.tracks[1].clips[0].add_note_raw(4,96,24,64,100);
        engine.tracks[2].clips[0].add_note_raw(0,0,24,36,100);
        engine.tracks[2].clips[0].add_note_raw(4,96,24,36,100);
        engine
    }
    fn route(dimension:usize,reference:Option<ClipRef>)->Route {
        let mut route=Route{enabled:true,..Default::default()};
        match dimension {0=>route.pitch=reference,1=>route.rhythm=reference,2=>route.expression=reference,
            3=>route.instrument=reference,4=>route.hb_render=reference,5=>route.note_ops=reference,
            6=>route.grid_holds=reference,_=>route.gestures=reference}route
    }
    #[test]
    fn stopped_preview_cannot_advertise_unplayed_own_material() {
        let mut engine=setup();let own=opening_preview(&engine,0).as_c_str().to_bytes().to_vec();
        assert_ne!(own,b"0");
        for dimension in 0..8 {
            engine.source_routes[0]=route(dimension,Some(ClipRef{track:1,slot:0}));
            assert_eq!(opening_preview(&engine,0).as_c_str().to_bytes(),b"0");
            engine.source_routes[0].enabled=false;
            assert_eq!(opening_preview(&engine,0).as_c_str().to_bytes(),own);
        }
    }
    #[test]
    fn every_independent_dimension_suspends_own_period_claim() {
        let mut engine=setup();let own=snapshot(&engine,0);
        assert_eq!(own.active,1);
        for dimension in 0..8 {
            for alignment in [seq_core::source_route::Alignment::Sequential,seq_core::source_route::Alignment::Timeline,seq_core::source_route::Alignment::FitWindow] {
                engine.source_routes[0]=route(dimension,Some(ClipRef{track:1,slot:0}));
                engine.source_routes[0].alignment=alignment;
                let woven=snapshot(&engine,0);
                assert_eq!(woven.active,2);assert_eq!(woven.period,own.period);
                assert_eq!(woven.origin,own.origin);
                engine.source_routes[0].enabled=false;assert_eq!(snapshot(&engine,0).active,1);
                engine.source_routes[0]=route(dimension,None);assert_eq!(snapshot(&engine,0).active,1);
                engine.source_routes[0]=route(dimension,Some(ClipRef{track:0,slot:0}));assert_eq!(snapshot(&engine,0).active,1);
                engine.source_routes[0]=route(dimension,Some(ClipRef{track:0,slot:1}));assert_eq!(snapshot(&engine,0).active,2);
            }
        }
    }
    #[test]
    fn empty_destination_and_unavailable_donors_cannot_hide_a_conductor() {
        let mut engine=setup();engine.source_routes[0]=route(0,Some(ClipRef{track:1,slot:0}));
        engine.tracks[0].clips[0].notes.clear();assert_eq!(snapshot(&engine,0).active,2);
        engine.tracks[1].muted=true;assert_eq!(snapshot(&engine,0).active,2);
        engine.tracks[1].playing_slot=None;assert_eq!(snapshot(&engine,0).active,2);
        engine.tracks[1].clips[0].clear();assert_eq!(snapshot(&engine,0).active,2);
        engine.playing=true;engine.toggle_record(0);assert_eq!(snapshot(&engine,0).active,2);
        engine.tracks[0].muted=true;assert_eq!(snapshot(&engine,0).active,0);
        engine.tracks[0].muted=false;engine.tracks[0].playing_slot=None;assert_eq!(snapshot(&engine,0).active,0);
        engine.tracks[0].playing_slot=Some(0);engine.tracks[0].clips[0].clear();assert_eq!(snapshot(&engine,0).active,0);
    }
    #[test]
    fn route_undo_and_save_load_restore_forecast_eligibility() {
        let mut engine=setup();let mut events=Vec::new();
        seq_core::command::apply_batch(&mut engine,"usnap 1;source 0 1 1 0 2 0 0",&mut events);
        assert_eq!(snapshot(&engine,0).active,2);
        let saved=seq_core::persist::serialize(&engine);let mut restored=Engine::new(48000,12000);
        assert!(seq_core::persist::load(&mut restored,&saved));restored.tracks[0].playing_slot=Some(0);
        assert_eq!(snapshot(&restored,0).active,2);
        seq_core::command::apply_batch(&mut engine,"uswap 1 2",&mut events);assert_eq!(snapshot(&engine,0).active,1);
        seq_core::command::apply_batch(&mut engine,"uswap 2 3",&mut events);assert_eq!(snapshot(&engine,0).active,2);
    }
    #[test]
    fn metadata_reads_preserve_woven_events_gates_and_transport() {
        let mut observed=setup();let mut control=setup();
        for engine in [&mut observed,&mut control] {
            engine.playing=true;engine.source_route_set("0 1 1 0 2 0 0");
            engine.tracks[0].clips[0].notes.clear();engine.tracks[0].clips[0].scale_den=2;
        }
        let mut emitted=0;
        for _ in 0..800 {
            let mut actual=Vec::new();let mut expected=Vec::new();
            observed.advance_block(250,&mut actual);control.advance_block(250,&mut expected);
            assert_eq!(snapshot(&observed,0).active,2);
            assert_eq!(actual,expected);
            emitted+=actual.iter().filter(|event|matches!(event,seq_core::engine::OutEvent::NoteOn{track:0,..})).count();
            assert_eq!(observed.hb_master_tick(),control.hb_master_tick());
        }
        assert!(emitted>=4);
        let mut actual=Vec::new();let mut expected=Vec::new();observed.stop(&mut actual);control.stop(&mut expected);
        assert_eq!(actual,expected);
    }
}
