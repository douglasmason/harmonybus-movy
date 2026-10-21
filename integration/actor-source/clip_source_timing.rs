//! Clip-source timing adapter for independent actor pitch/rhythm sources.
//! Uses Movy's existing clip period/origin snapshot. No new transport clock,
//! no allocation, no per-tick clip scan. The engine binds track/slot identities.
use crate::hb_loop::Snapshot;

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

impl SourceTiming {
    /// The snapshot must correspond to the selected playing clip. The host is
    /// responsible for checking its slot; Snapshot itself has no slot field.
    pub fn from_playing_snapshot(source: ClipSource, snapshot: Snapshot) -> Option<Self> {
        if snapshot.track != source.track || snapshot.active != 1 || !snapshot.running || snapshot.period == 0 {
            return None;
        }
        Some(Self { source, period: snapshot.period, origin: snapshot.origin, revision: snapshot.revision })
    }

    pub fn phase(&self, completed_tick: u64) -> u64 {
        (completed_tick % self.period + self.period - self.origin % self.period) % self.period
    }

    pub fn revision_key(&self) -> (ClipSource, u64, u64, u64) {
        (self.source, self.period, self.origin, self.revision)
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
    fn rejects_inactive_or_mismatched_snapshots() {
        let source = ClipSource { track: 2, slot: 3 };
        let snapshot = Snapshot { track: 2, active: 1, running: true, period: 384, origin: 0, revision: 12, ..Snapshot::default() };
        assert_eq!(SourceTiming::from_playing_snapshot(source, snapshot).unwrap().phase(385), 1);
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { active: 0, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { running: false, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { track: 3, ..snapshot }).is_none());
        assert!(SourceTiming::from_playing_snapshot(source, Snapshot { period: 0, ..snapshot }).is_none());
    }
}
