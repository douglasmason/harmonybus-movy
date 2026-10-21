impl Engine {
    /// Only scheduling watermarks are invalidated; parameter values remain in
    /// the existing auto_cur owner and musical data remains in the source clip.
    pub fn source_automation_invalidate(&mut self) {
        self.source_automation_seen.fill(None);
    }

    /// Keep the existing applied-value owner coherent with direct auditions.
    fn source_automation_edited(&mut self, track: usize, lane: usize, value: Option<u8>) {
        self.source_automation_invalidate();
        if track<NUM_TRACKS && lane<8 && self.source_automation_mask[track] & (1<<lane)!=0 {
            self.tracks[track].auto_cur[lane]=value.map_or(-1,|value|value as i16);
        }
    }

    fn source_automation_phase(&self, reference: crate::source_route::ClipRef) -> Option<(crate::source_route::ClipRef,u16,u32)> {
        let track=&self.tracks[reference.track];
        if track.muted || track.playing_slot!=Some(reference.slot) || !track.clips[reference.slot].exists() {return None;}
        Some((reference,(self.source_positions[reference.track]/TICKS_PER_STEP) as u16,track.cycle))
    }

    /// Resolve raw parameter locks before any actor emits notes. Work occurs on
    /// step/launch/route/availability changes or command edits, not audio blocks.
    /// A routed donor's own automation route is deliberately never consulted.
    fn source_automation_tick(&mut self, out: &mut Vec<OutEvent>) {
        use crate::source_route::{ClipRef,AutomationPhase};
        for actor in 0..NUM_TRACKS {
            let route=self.source_routes[actor];
            let sources=[route.instrument,route.hb_render];
            let routed=sources.map(|source|route.enabled && source.is_some() && !(self.recording && self.records_track(actor)));
            if !routed.iter().any(|enabled|*enabled) && self.source_automation_mask[actor]==0 {continue;}
            let own=self.tracks[actor].playing_slot.and_then(|slot|
                self.source_automation_phase(ClipRef{track:actor,slot})).map(|(reference,step,cycle)|(reference.slot,step,cycle));
            let donors=std::array::from_fn(|dimension|if routed[dimension] {sources[dimension].and_then(|reference|self.source_automation_phase(reference))} else {None});
            let phase=AutomationPhase{own,donors,routed};
            if self.source_automation_seen[actor]==Some(phase) {continue;}
            self.source_automation_seen[actor]=Some(phase);
            let previous=self.source_automation_mask[actor];
            let mut managed=0u8;
            for lane in 0..8usize {
                let track=&self.tracks[actor];
                let label=&track.lane_label[lane];
                if !track.lane_assigned[lane] {continue;}
                let Some(dimension)=crate::source_route::automation_dimension(label) else {continue;};
                let routed=routed[dimension];
                let donor=donors[dimension];
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
            self.source_automation_mask[actor]=managed;
        }
    }

    /// Transport stop releases borrowed parameter automation to the destination's base.
    /// Held notes retain the ordinary gate/release owner throughout.
    fn source_automation_release(&mut self, out: &mut Vec<OutEvent>) {
        for actor in 0..NUM_TRACKS {
            for lane in 0..8usize {
                let track=&mut self.tracks[actor];
                if self.source_automation_mask[actor] & (1<<lane)!=0 && track.lane_assigned[lane] && crate::source_route::automation_dimension(&track.lane_label[lane]).is_some() {
                    let value=track.lane_base[lane];
                    if track.auto_cur[lane]!=value as i16 {
                        track.auto_cur[lane]=value as i16;
                        out.push(OutEvent::Cc{track:actor as u8,lane:lane as u8,val:value});
                    }
                }
            }
        }
        self.source_automation_mask.fill(0);
        self.source_automation_invalidate();
    }
}
