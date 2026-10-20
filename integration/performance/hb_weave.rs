//! Borrow stored attacks/gates, never donor pitches or processed output.
//! Fixed-capacity snapshots are rebuilt on activation/source-slot change only.
use crate::{clip::{Clip, MAX_NOTES}, hb_clip_performance::{Gesture, ReadWindow}};

pub const OPERATION: u8 = 65;
#[derive(Clone, Copy, Default)]
struct Pulse { tick: u32, gate: u32 }
#[derive(Clone)]
pub struct Weave {
    identity: Option<(bool, u64, usize, usize, usize)>,
    last_age: u64,
    origin_age: u64,
    notes: [u32; MAX_NOTES],
    note_count: usize,
    pulses: [Pulse; MAX_NOTES],
    pulse_count: usize,
    length: u32,
}
impl Default for Weave {
    fn default() -> Self {
        Self { identity: None, last_age: 0, origin_age: 0, notes: [0; MAX_NOTES],
            note_count: 0, pulses: [Pulse::default(); MAX_NOTES], pulse_count: 0, length: 0 }
    }
}
impl Weave {
    pub fn clear(&mut self) { self.identity = None; }
    fn snapshot(&mut self, notes: &Clip, rhythm: &Clip) {
        self.note_count = 0;
        self.pulse_count = 0;
        self.length = rhythm.length_ticks();
        for note in notes.notes.iter().filter(|note| !note.suppress && note.tick >= notes.loop_start_ticks() && note.tick < notes.loop_end_ticks()).take(MAX_NOTES) {
            self.notes[self.note_count] = note.tick;
            self.note_count += 1;
        }
        self.notes[..self.note_count].sort_unstable();
        let mut count = 0;
        for index in 0..self.note_count {
            if count == 0 || self.notes[index] != self.notes[count-1] {
                self.notes[count] = self.notes[index]; count += 1;
            }
        }
        self.note_count = count;
        for note in rhythm.notes.iter().filter(|note| !note.suppress && note.tick >= rhythm.loop_start_ticks() && note.tick < rhythm.loop_end_ticks()).take(MAX_NOTES) {
            self.pulses[self.pulse_count] = Pulse { tick: note.tick-rhythm.loop_start_ticks(), gate: note.gate.max(1).min(self.length.max(1)) };
            self.pulse_count += 1;
        }
        self.pulses[..self.pulse_count].sort_unstable_by_key(|pulse| pulse.tick);
        count = 0;
        for index in 0..self.pulse_count {
            let pulse = self.pulses[index];
            if count > 0 && pulse.tick == self.pulses[count-1].tick {
                self.pulses[count-1].gate = self.pulses[count-1].gate.max(pulse.gate);
            } else { self.pulses[count] = pulse; count += 1; }
        }
        self.pulse_count = count;
    }
    /// None means unavailable material (normal playback); Some with count zero is a donor rest.
    pub fn read(&mut self, request: Option<(bool, Gesture)>, notes: &Clip, donor: Option<(usize, &Clip)>) -> Option<(ReadWindow, u32)> {
        let Some((manual, gesture)) = request.filter(|(_, gesture)| gesture.operation == OPERATION) else { self.clear(); return None; };
        let Some((slot, rhythm)) = donor.filter(|(_, clip)| clip.exists()) else { self.clear(); return None; };
        let identity = (manual, gesture.order, gesture.clip, gesture.amount as usize, slot);
        if self.identity != Some(identity) || gesture.age == 0 || gesture.age < self.last_age {
            self.snapshot(notes, rhythm);
            self.identity = Some(identity);
            self.origin_age = gesture.age;
        }
        self.last_age = gesture.age;
        if self.note_count == 0 || self.pulse_count == 0 || self.length == 0 { return None; }
        let age = gesture.age.saturating_sub(self.origin_age);
        let phase = (age % self.length as u64) as u32;
        let pulse = self.pulses[..self.pulse_count].binary_search_by_key(&phase, |pulse| pulse.tick).ok();
        let mut window = ReadWindow { first: notes.loop_start_ticks(), count: 0, start: notes.loop_start_ticks(), span: notes.length_ticks().max(1), reverse: false, speed_num: 1, speed_den: 1 };
        let mut gate = 1;
        if let Some(index) = pulse {
            // Reduce before multiplying to avoid overflow on long-running transports.
            let group = ((age / self.length as u64 % self.note_count as u64) * self.pulse_count as u64 + index as u64) % self.note_count as u64;
            window.first = self.notes[group as usize]; window.count = 1; gate = self.pulses[index].gate;
        }
        Some((window, gate))
    }
}
