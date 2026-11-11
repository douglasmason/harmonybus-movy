impl Engine {
    /// Invalidate readers after content/target edits, retaining the output owner.
    pub fn source_automation_invalidate(&mut self) {
        self.source_automation_seen.fill(None);
        for caches in &mut self.source_automation_cache {caches.fill(None);}
    }

    /// Keep the existing applied-value owner coherent with direct auditions.
    fn source_automation_edited(&mut self, track: usize, lane: usize, value: Option<u8>) {
        self.source_automation_invalidate();
        if track<NUM_TRACKS && lane<8 && self.source_automation_mask[track] & (1<<lane)!=0 {
            self.tracks[track].auto_cur[lane]=value.map_or(-1,|value|value as i16);
        }
    }

    fn source_automation_phase(&self, reference: crate::source_route::ClipRef) -> Option<(crate::source_route::ClipRef,u32,u32)> {
        let track=&self.tracks[reference.track];
        if track.muted || track.playing_slot!=Some(reference.slot) || !track.clips[reference.slot].exists() {return None;}
        Some((reference,self.source_positions[reference.track],track.cycle))
    }

    /// Resolve controls before attacks: Step at step changes, Linear at existing
    /// master ticks. The latter caches neighboring points, never whole curves.
    /// A routed donor's own automation route is deliberately never consulted.
    fn source_automation_tick(&mut self, out: &mut Vec<OutEvent>) {
        use crate::source_route::{ClipRef,AutomationPhase};
        for actor in 0..NUM_TRACKS {
            let route=self.source_routes[actor];
            let sources=[route.instrument,route.hb_render];
            let recording=self.recording && self.records_track(actor);
            let routed=sources.map(|source|route.enabled && source.is_some() && !recording);
            let requested=[route.instrument_linear,route.hb_render_linear];
            let positions=[route.instrument_driver,route.hb_render_driver].map(|driver|if recording {None}else{self.source_position_inputs.position(actor,driver)});
            let linear=std::array::from_fn::<_,2,_>(|dimension|requested[dimension] && !recording &&
                (0..8).any(|lane|self.tracks[actor].lane_assigned[lane] && self.tracks[actor].lane_numeric[lane] &&
                    crate::source_route::continuous_destination(&self.tracks[actor].lane_label[lane]) &&
                    crate::source_route::automation_dimension(&self.tracks[actor].lane_label[lane])==Some(dimension)));
            if !routed.iter().any(|enabled|*enabled) && !linear.iter().any(|enabled|*enabled) && positions.iter().all(Option::is_none) && self.source_automation_mask[actor]==0 {continue;}
            let own=self.tracks[actor].playing_slot.and_then(|slot|
                self.source_automation_phase(ClipRef{track:actor,slot})).map(|(reference,step,cycle)|(reference.slot,step,cycle));
            let donors=std::array::from_fn(|dimension|if routed[dimension] {sources[dimension].and_then(|reference| {
                let phase=self.source_automation_phase(reference)?;
                if dimension!=0 || !route.instrument_fit {return Some(phase);}
                let (slot,_,cycle)=own?;
                let actor_clip=&self.tracks[actor].clips[slot];
                let donor_clip=&self.tracks[reference.track].clips[reference.slot];
                let position=crate::source_route::fitted_phase(self.source_positions[actor],
                    actor_clip.loop_start_ticks(),actor_clip.length_ticks(),
                    donor_clip.loop_start_ticks(),donor_clip.length_ticks());
                Some((reference,position,cycle))
            })} else {None});
            let phase=AutomationPhase{own,donors,routed,linear,positions};
            let seen=self.source_automation_seen[actor];
            if seen.is_some_and(|previous|(0..2).all(|dimension|previous.same_dimension(phase,dimension,linear[dimension]))) {continue;}
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
                let continuous=linear[dimension] && track.lane_numeric[lane] && crate::source_route::continuous_destination(label);
                let position=positions[dimension].filter(|_|track.lane_numeric[lane]&&crate::source_route::continuous_destination(label));
                if !((routed || continuous || position.is_some()) && own.is_some()) && previous & (1<<lane)==0 {continue;}
                let owns=(routed || continuous || position.is_some()) && track.playing_slot.is_some_and(|slot|track.clips[slot].exists());
                if owns {managed |= 1<<lane;}
                if previous & (1<<lane)!=0 && seen.is_some_and(|old|old.same_dimension(phase,dimension,continuous)) {continue;}
                let borrowed=donor.and_then(|(reference,tick,_)| {
                    let donor_track=&self.tracks[reference.track];
                    let donor_lane=(0..8).find(|index|donor_track.lane_assigned[*index] && donor_track.lane_label[*index]==*label)?;
                    Some((reference,donor_lane,tick))
                });
                let selected=own.and_then(|(slot,tick,_)|borrowed.or(Some((ClipRef{track:actor,slot},lane,tick))));
                let value=selected.map_or(track.lane_base[lane],|(reference,source_lane,tick)| {
                    let source=&self.tracks[reference.track];let clip=&source.clips[reference.slot];
                    let tick=position.map_or(f64::from(tick),|value|crate::position_inputs::tick(clip,value));
                    if continuous {
                        crate::automation_reader::read_mode(&mut self.source_automation_cache[actor][lane],clip,reference,
                            source_lane as u8,source.lane_base[source_lane],tick,self.recording,position.is_some())
                    } else {clip.effective_at(source_lane as u8,(tick/f64::from(TICKS_PER_STEP)) as u16,source.lane_base[source_lane])}
                });
                // A muted actor must keep its base until unmuted; otherwise
                // the ordinary muted-track scheduler can reapply its locks.
                if self.tracks[actor].auto_cur[lane]!=value as i16 {
                    self.tracks[actor].auto_cur[lane]=value as i16;
                    out.push(OutEvent::Cc{track:actor as u8,lane:lane as u8,val:value});
                }
            }
            self.source_automation_mask[actor]=managed;
        }
    }

    /// Metadata must identify the current lane target. A stale UI response
    /// cannot mark a replacement enum numeric. Unknown/legacy lanes stay Step.
    pub fn auto_numeric(&mut self,track:usize,lane:usize,label:&str,numeric:bool) {
        let Some(target)=self.tracks.get_mut(track) else {return;};
        if lane>=8 || !target.lane_assigned[lane] || target.lane_label[lane]!=label {return;}
        let numeric=numeric && crate::source_route::continuous_destination(label);
        if target.lane_numeric[lane]!=numeric {
            target.lane_numeric[lane]=numeric;self.source_automation_invalidate();self.dirty=true;
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
