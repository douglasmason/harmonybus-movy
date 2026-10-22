impl Engine {
    /// Replace only the recorded clip-reader fallback. Live/automatic and Grid
    /// performance retain priority in the existing scheduler. Read raw intervals
    /// at the donor's master-tick snapshot; never advance a second gesture owner.
    fn source_gesture_window(&self, actor:usize, slot:usize, position:u32)->Option<crate::hb_clip_performance::ReadWindow> {
        let own=&self.tracks[actor].clips[slot];
        let route=self.source_routes[actor];
        if route.enabled && !(self.recording && self.records_track(actor)) {
            if let Some(reference)=route.gestures {
                let donor=&self.tracks[reference.track].clips[reference.slot];
                if self.source_playing_slots[reference.track]==Some(reference.slot) && donor.exists() {
                    let phase=self.source_positions[reference.track];
                    return donor.operation_intervals.iter().take(4096).rev().find_map(|interval| {
                        if phase<interval.start || phase-interval.start>=interval.length {return None;}
                        let mut sampled=*interval;
                        sampled.age+=u64::from(phase-interval.start);
                        sampled.start=position;
                        sampled.length=1;
                        // Preserve the recorded tick offset, wrapping to the actor's
                        // loop. This is not proportional Fit to Window alignment.
                        sampled.origin=own.loop_start_ticks()+
                            (i64::from(interval.origin)-i64::from(donor.loop_start_ticks()))
                                .rem_euclid(i64::from(own.length_ticks().max(1))) as u32;
                        sampled.window(position,slot,own.loop_start_ticks(),own.length_ticks())
                    });
                }
            }
        }
        own.operation_intervals.iter().rev().find_map(|interval|
            interval.window(position,slot,own.loop_start_ticks(),own.length_ticks()))
    }
}
