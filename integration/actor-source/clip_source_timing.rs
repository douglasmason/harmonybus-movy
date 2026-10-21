//! Clip-source timing adapter for independent actor pitch/rhythm sources.
//! Uses Movy's existing clip period/origin snapshot. No new transport clock,
//! no allocation, no per-tick clip scan. The engine binds track/slot identities.
use crate::hb_loop::{self, Snapshot};
use seq_core::engine::Engine;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClipSource {
    pub track: u8,
    pub slot: u8,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SourceTiming {
    pub source: ClipSource,
    pub period: u64,
    pub origin: u64,
    pub revision: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct WeaveTiming {
    pub pitch: SourceTiming,
    pub rhythm: SourceTiming,
}

/// Bind an actual active source clip, never the separately selected editor clip.
/// Muted sources are unavailable. Conditional clips retain valid timing even
/// though lookahead cannot promise a deterministic harmonic cycle.
pub fn resolve_playing_clip(engine: &Engine, source: ClipSource) -> Option<SourceTiming> {
    let track = engine.tracks.get(usize::from(source.track))?;
    let slot = usize::from(source.slot);
    if slot >= track.clips.len() || track.playing_slot != Some(slot) || !track.clips[slot].exists() {
        return None;
    }
    SourceTiming::from_playing_snapshot(source, hb_loop::snapshot(engine, usize::from(source.track)))
}

impl SourceTiming {
    /// Validate both parts of the authoritative lookahead snapshot identity.
    pub fn from_playing_snapshot(source: ClipSource, snapshot: Snapshot) -> Option<Self> {
        if snapshot.track != source.track || snapshot.slot != source.slot || snapshot.active == 0 || !snapshot.running || snapshot.period == 0 {
            return None;
        }
        Some(Self { source, period: snapshot.period, origin: snapshot.origin, revision: snapshot.revision })
    }

    pub fn phase(&self, completed_tick: u64) -> u64 {
        let tick = completed_tick % self.period;
        let origin = self.origin % self.period;
        if tick >= origin { tick - origin } else { self.period - (origin - tick) }
    }

    /// Raw material has the lookahead identity/revision, not its launch phase.
    /// Period-affecting edits already participate in the authoritative revision.
    pub fn revision_key(&self) -> (ClipSource, u64) {
        (self.source, self.revision)
    }
}

impl WeaveTiming {
    pub fn phases(&self, tick: u64) -> (u64, u64) {
        (self.pitch.phase(tick), self.rhythm.phase(tick))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn timing(track: u8, slot: u8, period: u64, origin: u64) -> SourceTiming {
        SourceTiming { source: ClipSource { track, slot }, period, origin, revision: 42 }
    }

    #[test]
    fn three_and_four_bar_sources_realign_without_reset() {
        let weave = WeaveTiming { pitch: timing(3, 2, 1152, 0), rhythm: timing(5, 1, 1536, 384) };
        assert_eq!(weave.phases(384), (384, 0));
        assert_eq!(weave.phases(1536), (384, 1152));
        assert_eq!(weave.phases(4608), (0, 1152));
        assert_eq!(weave.phases(4992), (384, 0));
    }

    #[test]
    fn selected_editor_clip_cannot_replace_playing_source() {
        let mut engine = Engine::new(48000,12000);
        engine.playing = true;
        engine.tracks[0].clips[0].set_loop(0,32);
        engine.tracks[0].clips[0].add_note_raw(0,0,24,60,100);
        engine.tracks[0].playing_slot=Some(0);
        engine.tracks[0].active_clip=1;
        assert!(resolve_playing_clip(&engine,ClipSource{track:0,slot:1}).is_none());
        assert!(resolve_playing_clip(&engine,ClipSource{track:0,slot:0}).is_some());
        engine.tracks[0].muted=true;
        assert!(resolve_playing_clip(&engine,ClipSource{track:0,slot:0}).is_none());
    }
    #[test]
    fn rejects_inactive_or_mismatched_snapshots() {
        let source = ClipSource { track: 2, slot: 3 };
        let snapshot = Snapshot { track: 2, slot: 3, active: 1, running: true, period: 384, origin: 0, revision: 12, ..Snapshot::default() };
        assert_eq!(SourceTiming::from_playing_snapshot(source, snapshot).unwrap().phase(385), 1);
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { active: 0, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { running: false, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { track: 3, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { slot: 2, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { period: 0, ..snapshot }).is_none());
    }
}
