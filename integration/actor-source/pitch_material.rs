//! Bounded source material prepared on clip changes, not audio callbacks.
//! Use with the existing sequencer Gate ownership, never as a second scheduler.
use seq_core::{engine::Engine, clip::MAX_NOTES};

use super::clip_source_timing::{ClipSource, SourceTiming};
use crate::hb_loop::Snapshot;
#[cfg(test)]
use super::clip_source_timing::resolve_playing_clip;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PitchVoice {
    pub pitch: u8,
    pub velocity: u8,
    /// Index into the source clip; resolve transient suppression at emission.
    pub source_note: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PitchGroup {
    pub onset: u32,
    pub voices: Vec<PitchVoice>,
}

#[derive(Debug, Default)]
pub struct PitchMaterial {
    pub key: Option<(ClipSource, u64)>,
    pub groups: Vec<PitchGroup>,
    #[cfg(test)]
    pub rebuilds: usize,
}

impl PitchMaterial {
    /// Rebuild only on a changed authoritative content revision or identity.
    /// Caller must invoke this on the edit/launch/update path, NEVER per tick.
    /// Preserves simultaneous notes as one attack group, and skips rests.
    /// Suppression/fired are transient sequencer flags, not raw content. They
    /// must not remove notes from a projection that outlives a playback pass.
    /// Voice indices remain valid only while this revision matches the source.
    pub fn refresh_from_snapshot(&mut self, engine: &Engine, snapshot: Snapshot) -> bool {
        // Consume the same snapshot supplied to harmonic lookahead. Never
        // compute another revision hash for the raw projection. The caller
        // must prepare both projections before any subsequent clip mutation.
        let source = ClipSource { track: snapshot.track, slot: snapshot.slot };
        let Some(track) = engine.tracks.get(usize::from(source.track)) else {
            self.invalidate();
            return false;
        };
        let slot = usize::from(source.slot);
        if slot >= track.clips.len() || track.playing_slot != Some(slot)
            || track.muted || !engine.playing || !track.clips[slot].exists() {
            self.invalidate();
            return false;
        }
        let Some(timing) = SourceTiming::from_playing_snapshot(source, snapshot) else {
            self.invalidate();
            return false;
        };
        let key = timing.revision_key();
        if self.key == Some(key) { return true; }
        #[cfg(test)] { self.rebuilds += 1; }
        self.groups.clear();
        let track = &engine.tracks[usize::from(source.track)];
        let clip = &track.clips[usize::from(source.slot)];
        let start = clip.loop_start_ticks();
        let end = clip.loop_end_ticks();
        let mut notes: Vec<_> = clip.notes.iter().take(MAX_NOTES).enumerate()
            .filter(|(_, note)| note.tick >= start && note.tick < end && note.vel > 0)
            .map(|(source_note, note)| (note.tick, PitchVoice { pitch: note.pitch, velocity: note.vel, source_note }))
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

    #[cfg(test)]
    fn refresh(&mut self, engine: &Engine, source: ClipSource) -> bool {
        if resolve_playing_clip(engine, source).is_none() {
            self.invalidate();
            return false;
        }
        self.refresh_from_snapshot(engine, crate::hb_loop::snapshot(engine, usize::from(source.track)))
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

    fn playing_engine() -> Engine {
        let mut engine = Engine::new(48000, 12000);
        engine.playing = true;
        engine.tracks[0].playing_slot = Some(0);
        engine.tracks[0].clips[0].set_loop(0, 16);
        engine.tracks[0].clips[0].add_note_raw(0, 0, 24, 60, 90);
        engine
    }

    #[test]
    fn launch_phase_and_transient_flags_do_not_reextract_raw_material() {
        let mut engine = playing_engine();
        let source = ClipSource { track: 0, slot: 0 };
        engine.tracks[0].clips[0].notes[0].suppress = true;
        let mut material = PitchMaterial::default();
        assert!(material.refresh(&engine, source));
        assert_eq!(material.groups.len(), 1, "suppression is not a content edit");
        let first = resolve_playing_clip(&engine, source).unwrap();
        engine.tracks[0].pos_tick = 96;
        engine.tracks[0].clips[0].release_pass_flags();
        let second = resolve_playing_clip(&engine, source).unwrap();
        assert_ne!(first.origin, second.origin);
        assert_eq!(first.revision_key(), second.revision_key());
        assert!(material.refresh(&engine, source));
        engine.tracks[0].clips[0].notes[0].fired = true;
        assert!(material.refresh(&engine, source));
        assert_eq!(material.rebuilds, 1);
        assert_eq!(material.groups[0].voices[0].source_note, 0);
    }

    #[test]
    fn changed_source_and_unavailable_source_cannot_reuse_stale_indices() {
        let mut engine = playing_engine();
        let source = ClipSource { track: 0, slot: 0 };
        let mut material = PitchMaterial::default();
        assert!(material.refresh(&engine, source));
        engine.tracks[0].clips[0].notes.clear();
        assert!(!material.refresh(&engine, source));
        assert!(material.key.is_none());
        assert!(material.group_for_attack(0).is_none());
        engine.tracks[0].clips[1].add_note_raw(0, 0, 48, 72, 100);
        engine.tracks[0].playing_slot = Some(1);
        assert!(!material.refresh(&engine, source));
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 1 }));
        assert_eq!(material.group_for_attack(0).unwrap().voices[0].pitch, 72);
        engine.stop(&mut Vec::new());
        assert!(!material.refresh(&engine, ClipSource { track: 0, slot: 1 }));
    }

    #[test]
    fn conditional_clip_has_material_without_claiming_exact_harmonic_period() {
        let mut engine = playing_engine();
        engine.tracks[0].clips[0].trigs.push(seq_core::clip::Trig {
            step: 0, lane: None,
            props: seq_core::clip::TrigProps { prob: 50, cond_a: 1, cond_b: 2, invert: false },
        });
        assert_eq!(crate::hb_loop::snapshot(&engine, 0).active, 2);
        let mut material = PitchMaterial::default();
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 0 }));
        assert_eq!(material.groups.len(), 1);
    }

    #[test]
    fn raw_material_is_bounded_and_ignores_zero_velocity_rests() {
        let mut engine = playing_engine();
        let template = engine.tracks[0].clips[0].notes[0].clone();
        engine.tracks[0].clips[0].notes = vec![template; MAX_NOTES + 10];
        engine.tracks[0].clips[0].notes[0].vel = 0;
        let mut material = PitchMaterial::default();
        assert!(material.refresh(&engine, ClipSource { track: 0, slot: 0 }));
        assert_eq!(material.groups.len(), 1);
        assert_eq!(material.groups[0].voices.len(), MAX_NOTES - 1);
    }
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
