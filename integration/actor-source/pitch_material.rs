//! Bounded source material prepared on clip changes, not audio callbacks.
//! Use with the existing sequencer Gate ownership, never as a second scheduler.
use seq_core::engine::Engine;

use super::clip_source_timing::{ClipSource, SourceTiming, resolve_playing_clip};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PitchVoice {
    pub pitch: u8,
    pub velocity: u8,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PitchGroup {
    pub onset: u32,
    pub voices: Vec<PitchVoice>,
}

#[derive(Debug, Default)]
pub struct PitchMaterial {
    pub key: Option<(ClipSource, u64, u64, u64)>,
    pub groups: Vec<PitchGroup>,
}

impl PitchMaterial {
    /// Rebuild only on a changed revision/period/origin/identity.
    /// Caller must invoke this on the edit/launch/update path, NEVER per tick.
    /// Preserves simultaneous notes as one attack group, and skips rests.
    pub fn refresh(&mut self, engine: &Engine, source: ClipSource) -> bool {
        let Some(timing) = resolve_playing_clip(engine, source) else {
            self.key = None;
            self.groups.clear();
            return false;
        };
        let key = timing.revision_key();
        if self.key == Some(key) { return true; }
        self.groups.clear();
        let track = &engine.tracks[usize::from(source.track)];
        let clip = &track.clips[usize::from(source.slot)];
        let start = clip.loop_start_ticks();
        let end = clip.loop_end_ticks();
        let mut notes: Vec<_> = clip.notes.iter()
            .filter(|note| note.tick >= start && note.tick < end
                && note.vel > 0 && !note.suppress)
            .map(|note| (note.tick, PitchVoice { pitch: note.pitch, velocity: note.vel }))
            .collect();
        notes.sort_by_key(|(tick, _)| *tick);
        for (tick, voice) in notes {
            if let Some(group) = self.groups.last_mut() {
                if group.onset == tick {
                    group.voices.push(voice);
                    continue;
                }
            }
            self.groups.push(PitchGroup { onset: tick, voices: vec![voice] });
        }
        self.key = Some(key);
        true
    }

    /// Constant-time attack selection after preparation; no mutation or allocation.
    pub fn group_for_attack(&self, ordinal: u64) -> Option<&PitchGroup> {
        let count = self.groups.len();
        if count == 0 { None } else { self.groups.get((ordinal % count as u64) as usize) }
    }

    pub fn invalidate(&mut self) {
        self.key = None;
        self.groups.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn groups_chords_and_cycles_without_consuming_silence() {
        let mut engine = Engine::new(48000, 12000);
        engine.playing = true;
        let clip = &mut engine.tracks[0].clips[0];
        clip.set_loop(0, 16);
        clip.add_note_raw(0, 0, 24, 60, 90);
        clip.add_note_raw(0, 0, 24, 64, 80);
        clip.add_note_raw(8, 192, 24, 67, 95);
        engine.tracks[0].playing_slot = Some(0);
        let mut material = PitchMaterial::default();
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 0 }));
        assert_eq!(material.groups.len(), 2);
        assert_eq!(material.group_for_attack(0).unwrap().voices.len(), 2);
        assert_eq!(material.group_for_attack(1).unwrap().voices[0].pitch, 67);
        assert_eq!(material.group_for_attack(2).unwrap().voices.len(), 2);
        engine.tracks[0].active_clip = 1;
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 0 }));
        assert_eq!(material.groups.len(), 2);
        engine.tracks[0].clips[0].notes[0].pitch = 62;
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 0 }));
        assert_eq!(material.group_for_attack(0).unwrap().voices[0].pitch, 62);
        material.invalidate();
        assert!(material.key.is_none());
    }
}
