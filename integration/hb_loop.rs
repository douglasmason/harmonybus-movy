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
    if !clip.notes.iter().any(|note| note.tick >= start && note.tick < end && note.vel > 0) { return result; }
    let numerator = u64::from(clip.scale_num.max(1));
    let denominator = u64::from(clip.scale_den.max(1));
    let window = u64::from(end - start) * denominator;
    result.period = window / gcd(window, numerator);
    let phase = (u64::from(track.pos_tick.saturating_sub(start)) * denominator + u64::from(track.scale_acc)) / numerator;
    // Both operands describe the next position; keep the loop origin in that
    // common coordinate system even though the published playhead is completed.
    result.origin = (next_tick % result.period + result.period - phase % result.period) % result.period;
    result.active = 1;
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
    // Probability and multi-pass conditions need a longer/non-deterministic model.
    // Do not claim their nominal clip loop is an exact repeating harmony cycle.
    if clip.trigs.iter().any(|trig| trig.props.prob != 100 || trig.props.cond_b != 1 || trig.props.invert) {
        result.active = 2;
    }
    result.revision = revision;
    result
}
pub struct Message { bytes: [u8; 192], len: usize }
impl Write for Message {
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
impl Message { pub fn as_c_str(&self) -> &std::ffi::CStr { std::ffi::CStr::from_bytes_with_nul(&self.bytes[..=self.len]).unwrap() } }

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
