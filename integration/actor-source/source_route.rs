//! Actor-level raw clip references. No derived-source recursion or copied clips.
use crate::track::{CLIPS_PER_TRACK, NUM_TRACKS};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClipRef { pub track: usize, pub slot: usize }
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Route {
    pub enabled: bool,
    pub pitch: Option<ClipRef>,
    pub rhythm: Option<ClipRef>,
    pub timeline: bool,
    pub expression: Option<ClipRef>,
}
impl Route {
    /// `actor enabled pitch-track pitch-slot rhythm-track rhythm-slot timeline [expression-track expression-slot]`.
    /// Legacy seven-field routes retain destination expression.
    /// A -1 track with -1 slot means that actor's own playing clip.
    pub fn parse(message: &str) -> Option<(usize, Self)> {
        let values: Vec<i32> = message.split_whitespace().map(str::parse).collect::<Result<_,_>>().ok()?;
        if values.len()!=7 && values.len()!=9 {return None;}
        let [actor,enabled,pitch_track,pitch_slot,rhythm_track,rhythm_slot,timeline] = &values[..7] else { return None; };
        if !(0..NUM_TRACKS as i32).contains(actor) || !(0..=1).contains(enabled) || !(0..=1).contains(timeline) { return None; }
        fn reference(track: i32, slot: i32) -> Option<Option<ClipRef>> {
            if track == -1 && slot == -1 { return Some(None); }
            if !(0..NUM_TRACKS as i32).contains(&track) || !(0..CLIPS_PER_TRACK as i32).contains(&slot) { return None; }
            Some(Some(ClipRef {track:track as usize,slot:slot as usize}))
        }
        Some((*actor as usize, Self { enabled:*enabled!=0,
            pitch:reference(*pitch_track,*pitch_slot)?, rhythm:reference(*rhythm_track,*rhythm_slot)?, timeline:*timeline!=0,
            expression:if values.len()==9 {reference(values[7],values[8])?} else {None} }))
    }
    pub fn message(self, actor: usize) -> String {
        let pitch=self.pitch.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let rhythm=self.rhythm.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let expression=self.expression.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        format!("{} {} {} {} {} {} {} {} {}",actor,self.enabled as u8,pitch.0,pitch.1,rhythm.0,rhythm.1,self.timeline as u8,expression.0,expression.1)
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct Cursor { pub source: Option<ClipRef>, pub onset: Option<u32> }
