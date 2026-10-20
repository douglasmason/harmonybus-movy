//! Borrow quantized/swung attacks and stored gates, never donor pitches.
//! Compare source material only on activation and borrowed-loop boundaries.
use crate::{clip::{Clip, MAX_NOTES}, hb_clip_performance::{Gesture, ReadWindow}};

use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;

pub const OPERATION: u8 = 65;
#[derive(Clone, Copy, Default)]
struct Pulse { tick: u32, gate: u32 }
#[derive(Clone)]
pub struct Weave {
    identity: Option<(bool, u64, usize, usize, usize)>,
    last_age: u64,
    cycle_start: u64,
    completed_attacks: u64,
    fingerprint: u64,
    #[cfg(test)]
    pub snapshots: usize,
    notes: [u32; MAX_NOTES],
    note_count: usize,
    pulses: [Pulse; MAX_NOTES],
    pulse_count: usize,
    length: u32,
}
impl Default for Weave {
    fn default() -> Self {
        Self { identity: None, last_age: 0, cycle_start: 0, completed_attacks: 0, fingerprint: 0,
            #[cfg(test)] snapshots: 0, notes: [0; MAX_NOTES],
            note_count: 0, pulses: [Pulse::default(); MAX_NOTES], pulse_count: 0, length: 0 }
    }
}
impl Weave {
    pub fn clear(&mut self) { self.identity = None; }
    fn fingerprint(notes: &Clip, rhythm: &Clip, swing: u32) -> u64 {
        let mut hash = DefaultHasher::new();
        (notes.loop_start_ticks(), notes.length_ticks(), rhythm.loop_start_ticks(), rhythm.length_ticks(),
            rhythm.quant, rhythm.scale_num, rhythm.scale_den, swing, notes.notes.len(), rhythm.notes.len()).hash(&mut hash);
        for note in notes.notes.iter().take(MAX_NOTES) { (note.tick, note.suppress).hash(&mut hash); }
        for note in rhythm.notes.iter().take(MAX_NOTES) { (note.tick, note.step, note.gate, note.suppress).hash(&mut hash); }
        hash.finish()
    }
    fn snapshot(&mut self, notes: &Clip, rhythm: &Clip, swing: u32) {
        #[cfg(test)] { self.snapshots += 1; }
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
            let delay = crate::clip_tools::swing_delay(swing, note.step, rhythm.scale_num, rhythm.scale_den);
            let tick = crate::clip_tools::playback_tick(note, rhythm.quant, delay, rhythm.loop_end_ticks(), self.length.max(1));
            if tick < rhythm.loop_start_ticks() || tick >= rhythm.loop_end_ticks() { continue; }
            self.pulses[self.pulse_count] = Pulse { tick: tick-rhythm.loop_start_ticks(), gate: note.gate.max(1).min(self.length.max(1)) };
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
    pub fn read(&mut self, request: Option<(bool, Gesture)>, notes: &Clip, donor: Option<(usize, &Clip)>, swing: u32) -> Option<(ReadWindow, u32)> {
        let Some((manual, gesture)) = request.filter(|(_, gesture)| gesture.operation == OPERATION) else { return None; };
        let Some((slot, rhythm)) = donor.filter(|(_, clip)| clip.exists()) else { self.clear(); return None; };
        let identity = (manual, gesture.order, gesture.clip, gesture.amount as usize, slot);
        if self.identity != Some(identity) || gesture.age == 0 || gesture.age < self.last_age {
            self.snapshot(notes, rhythm, swing);
            self.fingerprint = Self::fingerprint(notes, rhythm, swing);
            self.identity = Some(identity);
            // Gesture age already advances underneath manual overrides. It is
            // the phase source even when this reader first becomes the winner.
            self.cycle_start = 0;
            self.completed_attacks = 0;
        }
        self.last_age = gesture.age;
        let length = self.length.max(1) as u64;
        let cycles = gesture.age.saturating_sub(self.cycle_start) / length;
        if cycles > 0 {
            self.cycle_start += cycles * length;
            self.completed_attacks = self.completed_attacks.saturating_add(cycles.saturating_mul(self.pulse_count as u64));
            let fingerprint = Self::fingerprint(notes, rhythm, swing);
            if self.fingerprint != fingerprint {
                self.snapshot(notes, rhythm, swing);
                self.fingerprint = fingerprint;
            }
            // A shorter edited loop may have wrapped again during an override.
            let extra = gesture.age.saturating_sub(self.cycle_start) / self.length.max(1) as u64;
            self.cycle_start += extra * self.length.max(1) as u64;
            self.completed_attacks = self.completed_attacks.saturating_add(extra.saturating_mul(self.pulse_count as u64));
        }
        if self.note_count == 0 || self.pulse_count == 0 || self.length == 0 { return None; }
        let phase = gesture.age.saturating_sub(self.cycle_start) as u32;
        let pulse = self.pulses[..self.pulse_count].binary_search_by_key(&phase, |pulse| pulse.tick).ok();
        let mut window = ReadWindow { first: notes.loop_start_ticks(), count: 0, start: notes.loop_start_ticks(), span: notes.length_ticks().max(1), reverse: false, speed_num: 1, speed_den: 1 };
        let mut gate = 1;
        if let Some(index) = pulse {
            // Reduce before adding so long-running transports remain bounded.
            let group = (self.completed_attacks % self.note_count as u64 + index as u64) % self.note_count as u64;
            window.first = self.notes[group as usize]; window.count = 1; gate = self.pulses[index].gate;
        }
        Some((window, gate))
    }
}
