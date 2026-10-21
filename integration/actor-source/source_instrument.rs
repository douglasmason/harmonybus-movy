impl Engine {
    /// Only scheduling watermarks are invalidated; parameter values remain in
    /// the existing auto_cur owner and musical data remains in the source clip.
    pub fn source_instrument_invalidate(&mut self) {
        self.source_instrument_seen.fill(None);
    }

    /// Keep the existing applied-value owner coherent with direct auditions.
    fn source_instrument_edited(&mut self, track: usize, lane: usize, value: Option<u8>) {
        self.source_instrument_invalidate();
        if track<NUM_TRACKS && lane<8 && self.source_instrument_mask[track] & (1<<lane)!=0 {
            self.tracks[track].auto_cur[lane]=value.map_or(-1,|value|value as i16);
        }
    }

    fn source_instrument_phase(&self, reference: crate::source_route::ClipRef) -> Option<(crate::source_route::ClipRef,u16,u32)> {
        let track=&self.tracks[reference.track];
        if track.muted || track.playing_slot!=Some(reference.slot) || !track.clips[reference.slot].exists() {return None;}
        Some((reference,(self.source_positions[reference.track]/TICKS_PER_STEP) as u16,track.cycle))
    }

    /// Resolve raw instrument locks before any actor emits notes. Work occurs on
    /// step/launch/route/availability changes or command edits, not audio blocks.
    /// A routed donor's own automation route is deliberately never consulted.
    fn source_instrument_tick(&mut self, out: &mut Vec<OutEvent>) {
        use crate::source_route::{ClipRef,InstrumentPhase};
        for actor in 0..NUM_TRACKS {
            let route=self.source_routes[actor];
            let routed=route.enabled && route.instrument.is_some() && !(self.recording && self.records_track(actor));
            if !routed && self.source_instrument_mask[actor]==0 {continue;}
            let own=self.tracks[actor].playing_slot.and_then(|slot|
                self.source_instrument_phase(ClipRef{track:actor,slot})).map(|(reference,step,cycle)|(reference.slot,step,cycle));
            let donor=if routed {route.instrument.and_then(|reference|self.source_instrument_phase(reference))} else {None};
            let phase=InstrumentPhase{own,donor,routed};
            if self.source_instrument_seen[actor]==Some(phase) {continue;}
            self.source_instrument_seen[actor]=Some(phase);
            let previous=self.source_instrument_mask[actor];
            let mut managed=0u8;
            for lane in 0..8usize {
                let track=&self.tracks[actor];
                let label=&track.lane_label[lane];
                // Exact full target match. HB, mixer, effects and unnamed lanes
                // remain under their existing owners, even on matching numbers.
                if !track.lane_assigned[lane] || !label.starts_with("synth:") || label.len()==6 {continue;}
                if !(routed && own.is_some()) && previous & (1<<lane)==0 {continue;}
                let borrowed=donor.and_then(|(reference,step,_)| {
                    let donor_track=&self.tracks[reference.track];
                    let donor_lane=(0..8).find(|index|donor_track.lane_assigned[*index] && donor_track.lane_label[*index]==*label)?;
                    Some(donor_track.clips[reference.slot].effective_at(donor_lane as u8,step,donor_track.lane_base[donor_lane]))
                });
                let value=if own.is_some() {borrowed} else {None}.unwrap_or_else(||
                    own.map_or(track.lane_base[lane],|(slot,step,_)|track.clips[slot].effective_at(lane as u8,step,track.lane_base[lane])));
                // A muted actor must keep its base until unmuted; otherwise
                // the ordinary muted-track scheduler can reapply its locks.
                if routed && self.tracks[actor].playing_slot.is_some_and(|slot|self.tracks[actor].clips[slot].exists()) {managed |= 1<<lane;}
                if track.auto_cur[lane]!=value as i16 {
                    self.tracks[actor].auto_cur[lane]=value as i16;
                    out.push(OutEvent::Cc{track:actor as u8,lane:lane as u8,val:value});
                }
            }
            self.source_instrument_mask[actor]=managed;
        }
    }

    /// Transport stop releases instrument automation to the destination's base.
    /// Held notes retain the ordinary gate/release owner throughout.
    fn source_instrument_release(&mut self, out: &mut Vec<OutEvent>) {
        for actor in 0..NUM_TRACKS {
            for lane in 0..8usize {
                let track=&mut self.tracks[actor];
                if self.source_instrument_mask[actor] & (1<<lane)!=0 && track.lane_assigned[lane] && track.lane_label[lane].starts_with("synth:") {
                    let value=track.lane_base[lane];
                    if track.auto_cur[lane]!=value as i16 {
                        track.auto_cur[lane]=value as i16;
                        out.push(OutEvent::Cc{track:actor as u8,lane:lane as u8,val:value});
                    }
                }
            }
        }
        self.source_instrument_mask.fill(0);
        self.source_instrument_invalidate();
    }
}
