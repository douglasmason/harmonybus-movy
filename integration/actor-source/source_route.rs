//! Actor-level raw clip references. No derived-source recursion or copied clips.
use crate::track::{CLIPS_PER_TRACK, NUM_TRACKS};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ClipRef { pub track: usize, pub slot: usize }

/// Accepted raw onsets for one clip tick. Constructed only when a note fires;
/// never retained across ticks and never allocated on the heap. Separate gates
/// prevent a simultaneous snare from extending a kick-only follower's note.
pub struct RhythmAttack { all:u32, lanes:[u32;128] }
impl RhythmAttack {
    pub fn accept(attack:&mut Option<Self>,pitch:u8,duration:u32) {
        let attack=attack.get_or_insert_with(||Self{all:0,lanes:[0;128]});
        let duration=duration.max(1);
        attack.all=attack.all.max(duration);
        if let Some(lane)=attack.lanes.get_mut(pitch as usize) {*lane=(*lane).max(duration);}
    }
    pub fn duration(&self,pitch:Option<u8>)->Option<u32> {
        let duration=pitch.map_or(self.all,|pitch|self.lanes[pitch as usize]);
        (duration>0).then_some(duration)
    }
}
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
#[repr(u8)]
pub enum Alignment { #[default] Sequential=0, Timeline=1, FitWindow=2 }

/// Map one actor loop into a source loop without changing either clock.
/// Integer flooring keeps the result inside the half-open source window.
pub fn fitted_phase(position:u32, actor_start:u32, actor_length:u32,
    source_start:u32, source_length:u32)->u32 {
    let offset=position.saturating_sub(actor_start)%actor_length.max(1);
    source_start+(u64::from(offset)*u64::from(source_length)/u64::from(actor_length.max(1))) as u32
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Route {
    pub enabled: bool,
    pub pitch: Option<ClipRef>,
    pub rhythm: Option<ClipRef>,
    pub rhythm_pitch: Option<u8>,
    pub rhythm_amount: u8,
    pub alignment: Alignment,
    pub expression: Option<ClipRef>,
    pub expression_fit: bool,
    pub instrument: Option<ClipRef>,
    pub instrument_fit: bool,
    pub hb_render: Option<ClipRef>,
    pub instrument_linear: bool,
    pub hb_render_linear: bool,
    /// 0 Clock, 1/2 local modulation inputs, 3..18 shared Field channels.
    pub instrument_driver: u8,
    pub hb_render_driver: u8,
    pub note_ops: Option<ClipRef>,
    pub grid_holds: Option<ClipRef>,
    pub gestures: Option<ClipRef>,
}
impl Default for Route {
    fn default()->Self {
        Self {enabled:false,pitch:None,rhythm:None,rhythm_pitch:None,rhythm_amount:100,
            alignment:Alignment::default(),expression:None,expression_fit:false,
            instrument:None,instrument_fit:false,hb_render:None,instrument_linear:false,hb_render_linear:false,instrument_driver:0,hb_render_driver:0,note_ops:None,
            grid_holds:None,gestures:None}
    }
}
impl Route {
    /// One repeatable choice for both raw sources at the actor's captured phase.
    /// Complementary masks preserve coincident attacks without track-order
    /// dependence, an event queue, a second scheduler or a shared RNG draw.
    pub fn follows_rhythm(self,actor:usize,slot:usize,phase:u32)->bool {
        self.rhythm_amount>=100 || (self.rhythm_amount>0 &&
            crate::humanize::Humanize::seed(actor,slot,phase)%100<u32::from(self.rhythm_amount))
    }
    /// A destination loop alone cannot prove the period of independent donors.
    /// Keep this conservative across donor stop/mute and recording fallback.
    pub fn has_independent_sources(self, actor:usize, slot:usize)->bool {
        let own=ClipRef{track:actor,slot};
        self.enabled && [self.pitch,self.rhythm,self.expression,self.instrument,
            self.hb_render,self.note_ops,self.grid_holds,self.gestures]
            .into_iter().flatten().any(|source|source!=own)
    }

    /// `actor enabled pitch-track pitch-slot rhythm-track rhythm-slot alignment [expression-track expression-slot [instrument-track instrument-slot [hb-render-track hb-render-slot [note-ops-track note-ops-slot [grid-holds-track grid-holds-slot [gesture-track gesture-slot]]]]]]`.
    /// Optional fields 20/21 select expression/instrument Fit (0 Timeline, 1 Fit).
    /// Optional field 22 selects a raw rhythm note (0..127); -1 means all notes.
    /// Optional field 23 blends Own (0) to the rhythm source (100, default).
    /// Pitch alignment: 0 Sequential, 1 Timeline, 2 Fit to Window.
    /// Optional fields 24/25 select Instrument/HB read mode (0 Step, 1 Linear).
    /// Optional fields 26/27 select Instrument/HB position drivers (0 Clock, 1/2 Input, 3..18 Field).
    /// Legacy seven/nine/eleven/thirteen/fifteen/seventeen-field routes retain Own for omitted dimensions.
    /// A -1 track with -1 slot means that actor's own playing clip.
    pub fn parse(message: &str) -> Option<(usize, Self)> {
        let values: Vec<i32> = message.split_whitespace().map(str::parse).collect::<Result<_,_>>().ok()?;
        if values.len()!=7 && values.len()!=9 && values.len()!=11 && values.len()!=13 && values.len()!=15 && values.len()!=17 && !(19..=27).contains(&values.len()) {return None;}
        if values.iter().skip(23).take(2).any(|mode|!(0..=1).contains(mode)) || values.iter().skip(25).any(|driver|!(0..=18).contains(driver)) {return None;}
        if values.get(19).is_some_and(|value|!(0..=1).contains(value)) || values.get(20).is_some_and(|value|!(0..=1).contains(value)) {return None;}
        if values.get(21).is_some_and(|pitch|!(-1..=127).contains(pitch)) {return None;}
        if values.get(22).is_some_and(|amount|!(0..=100).contains(amount)) {return None;}
        let [actor,enabled,pitch_track,pitch_slot,rhythm_track,rhythm_slot,timeline] = &values[..7] else { return None; };
        if !(0..NUM_TRACKS as i32).contains(actor) || !(0..=1).contains(enabled) || !(0..=2).contains(timeline) { return None; }
        fn reference(track: i32, slot: i32) -> Option<Option<ClipRef>> {
            if track == -1 && slot == -1 { return Some(None); }
            if !(0..NUM_TRACKS as i32).contains(&track) || !(0..CLIPS_PER_TRACK as i32).contains(&slot) { return None; }
            Some(Some(ClipRef {track:track as usize,slot:slot as usize}))
        }
        Some((*actor as usize, Self { enabled:*enabled!=0,
            pitch:reference(*pitch_track,*pitch_slot)?, rhythm:reference(*rhythm_track,*rhythm_slot)?,
            rhythm_pitch:values.get(21).copied().filter(|pitch|*pitch>=0).map(|pitch|pitch as u8),
            rhythm_amount:values.get(22).copied().unwrap_or(100) as u8,
            alignment:match timeline {0=>Alignment::Sequential,1=>Alignment::Timeline,_=>Alignment::FitWindow},
            expression:if values.len()>=9 {reference(values[7],values[8])?} else {None},
            expression_fit:values.get(19)==Some(&1),
            instrument:if values.len()>=11 {reference(values[9],values[10])?} else {None},
            instrument_fit:values.get(20)==Some(&1),
            instrument_linear:values.get(23)==Some(&1),hb_render_linear:values.get(24)==Some(&1),
            instrument_driver:values.get(25).copied().unwrap_or(0) as u8,hb_render_driver:values.get(26).copied().unwrap_or(0) as u8,
            hb_render:if values.len()>=13 {reference(values[11],values[12])?} else {None},
            note_ops:if values.len()>=15 {reference(values[13],values[14])?} else {None},
            grid_holds:if values.len()>=17 {reference(values[15],values[16])?} else {None},
            gestures:if values.len()>=19 {reference(values[17],values[18])?} else {None} }))
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
        let mut message=format!("{} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {} {}",actor,self.enabled as u8,pitch.0,pitch.1,rhythm.0,rhythm.1,self.alignment as u8,expression.0,expression.1,instrument.0,instrument.1,hb_render.0,hb_render.1,note_ops.0,note_ops.1,grid_holds.0,grid_holds.1,gestures.0,gestures.1);
        // Preserve the older route encoding unless the new mode is selected.
        let driven=self.instrument_driver!=0 || self.hb_render_driver!=0;
        let extended=self.instrument_linear || self.hb_render_linear || driven;
        if extended || self.expression_fit || self.instrument_fit || self.rhythm_pitch.is_some() || self.rhythm_amount!=100 {message.push_str(if self.expression_fit {" 1"} else {" 0"});}
        if extended || self.instrument_fit || self.rhythm_pitch.is_some() || self.rhythm_amount!=100 {message.push_str(if self.instrument_fit {" 1"} else {" 0"});}
        if extended || self.rhythm_pitch.is_some() || self.rhythm_amount!=100 {message.push_str(&format!(" {}",self.rhythm_pitch.map_or(-1,i32::from)));}
        if extended || self.rhythm_amount!=100 {message.push_str(&format!(" {}",self.rhythm_amount));}
        if extended {message.push_str(&format!(" {} {}",self.instrument_linear as u8,self.hb_render_linear as u8));}
        if driven {message.push_str(&format!(" {} {}",self.instrument_driver,self.hb_render_driver));}
        message
    }
}
#[derive(Clone, Copy, Debug, Default)]
pub struct Cursor { pub source: Option<ClipRef>, pub onset: Option<u32> }

/// Scheduling watermark only: no musical material or parameter values cached.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AutomationPhase {
    pub own: Option<(usize,u32,u32)>,
    pub donors: [Option<(ClipRef,u32,u32)>;2],
    pub routed: [bool;2],
    pub linear: [bool;2],
    pub positions: [Option<u16>;2],
}

impl AutomationPhase {
    pub fn same_dimension(self,other:Self,dimension:usize,linear:bool)->bool {
        let divisor=if linear {1} else {crate::TICKS_PER_STEP};
        self.positions[dimension]==other.positions[dimension] && self.routed[dimension]==other.routed[dimension] && self.linear[dimension]==other.linear[dimension] &&
        self.own.map(|(slot,tick,cycle)|(slot,tick/divisor,cycle))==other.own.map(|(slot,tick,cycle)|(slot,tick/divisor,cycle)) &&
        self.donors[dimension].map(|(source,tick,cycle)|(source,tick/divisor,cycle))==other.donors[dimension].map(|(source,tick,cycle)|(source,tick/divisor,cycle))
    }
}

/// Supported local rendering parameters only. Global harmony, routing, latch,
/// reset/clear actions and held-operation controls retain their existing owners.
pub fn continuous_destination(label:&str)->bool {
    label.starts_with("synth:") || matches!(label,"midi_fx1:render_velocity_percent"|"midi_fx1:arp_gate"|"midi_fx1:strum_spread")
}
pub fn automation_dimension(label: &str) -> Option<usize> {
    if label.starts_with("synth:") && label.len()>6 {return Some(0);}
    match label.strip_prefix("midi_fx1:")? {
        "chord_form" | "chord_quality" | "chromatic_quality" | "chord_inversion"
        | "chord_voicing" | "chord_extensions" | "render_velocity_percent"
        | "arp_gate" | "strum_spread" => Some(1),
        _=>None,
    }
}
