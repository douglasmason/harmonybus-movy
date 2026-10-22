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
    pub instrument: Option<ClipRef>,
    pub hb_render: Option<ClipRef>,
    pub note_ops: Option<ClipRef>,
    pub grid_holds: Option<ClipRef>,
    pub gestures: Option<ClipRef>,
}
impl Route {
    /// A destination loop alone cannot prove the period of independent donors.
    /// Keep this conservative across donor stop/mute and recording fallback.
    pub fn has_independent_sources(self, actor:usize, slot:usize)->bool {
        let own=ClipRef{track:actor,slot};
        self.enabled && [self.pitch,self.rhythm,self.expression,self.instrument,
            self.hb_render,self.note_ops,self.grid_holds,self.gestures]
            .into_iter().flatten().any(|source|source!=own)
    }

    /// `actor enabled pitch-track pitch-slot rhythm-track rhythm-slot timeline [expression-track expression-slot [instrument-track instrument-slot [hb-render-track hb-render-slot [note-ops-track note-ops-slot [grid-holds-track grid-holds-slot [gesture-track gesture-slot]]]]]]`.
    /// Legacy seven/nine/eleven/thirteen/fifteen/seventeen-field routes retain Own for omitted dimensions.
    /// A -1 track with -1 slot means that actor's own playing clip.
    pub fn parse(message: &str) -> Option<(usize, Self)> {
        let values: Vec<i32> = message.split_whitespace().map(str::parse).collect::<Result<_,_>>().ok()?;
        if values.len()!=7 && values.len()!=9 && values.len()!=11 && values.len()!=13 && values.len()!=15 && values.len()!=17 && values.len()!=19 {return None;}
        let [actor,enabled,pitch_track,pitch_slot,rhythm_track,rhythm_slot,timeline] = &values[..7] else { return None; };
        if !(0..NUM_TRACKS as i32).contains(actor) || !(0..=1).contains(enabled) || !(0..=1).contains(timeline) { return None; }
        fn reference(track: i32, slot: i32) -> Option<Option<ClipRef>> {
            if track == -1 && slot == -1 { return Some(None); }
            if !(0..NUM_TRACKS as i32).contains(&track) || !(0..CLIPS_PER_TRACK as i32).contains(&slot) { return None; }
            Some(Some(ClipRef {track:track as usize,slot:slot as usize}))
        }
        Some((*actor as usize, Self { enabled:*enabled!=0,
            pitch:reference(*pitch_track,*pitch_slot)?, rhythm:reference(*rhythm_track,*rhythm_slot)?, timeline:*timeline!=0,
            expression:if values.len()>=9 {reference(values[7],values[8])?} else {None},
            instrument:if values.len()>=11 {reference(values[9],values[10])?} else {None},
            hb_render:if values.len()>=13 {reference(values[11],values[12])?} else {None},
            note_ops:if values.len()>=15 {reference(values[13],values[14])?} else {None},
            grid_holds:if values.len()>=17 {reference(values[15],values[16])?} else {None},
            gestures:if values.len()==19 {reference(values[17],values[18])?} else {None} }))
    }
    pub fn message(self, actor: usize) -> String {
        let pitch=self.pitch.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let rhythm=self.rhythm.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let expression=self.expression.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let instrument=self.instrument.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let hb_render=self.hb_render.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let note_ops=self.note_ops.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let grid_holds=self.grid_holds.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        let gestures=self.gestures.map_or((-1,-1),|source|(source.track as i32,source.slot as i32));
        format!("{} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {}",actor,self.enabled as u8,pitch.0,pitch.1,rhythm.0,rhythm.1,self.timeline as u8,expression.0,expression.1,instrument.0,instrument.1,hb_render.0,hb_render.1,note_ops.0,note_ops.1,grid_holds.0,grid_holds.1,gestures.0,gestures.1)
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct Cursor { pub source: Option<ClipRef>, pub onset: Option<u32> }

/// Scheduling watermark only: no musical material or parameter values cached.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AutomationPhase {
    pub own: Option<(usize,u16,u32)>,
    pub donors: [Option<(ClipRef,u16,u32)>;2],
    pub routed: [bool;2],
}

/// Supported local rendering parameters only. Global harmony, routing, latch,
/// reset/clear actions and held-operation controls retain their existing owners.
pub fn automation_dimension(label: &str) -> Option<usize> {
    if label.starts_with("synth:") && label.len()>6 {return Some(0);}
    match label.strip_prefix("midi_fx1:")? {
        "chord_form" | "chord_quality" | "chromatic_quality" | "chord_inversion"
        | "chord_voicing" | "chord_extensions" | "render_velocity_percent"
        | "arp_gate" | "strum_spread" => Some(1),
        _=>None,
    }
}
