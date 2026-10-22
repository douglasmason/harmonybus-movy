impl Engine {
    /// Borrow only raw Grid hold edges. Assignments, live holds, clip-reader
    /// origins and gesture advancement remain owned by the destination actor.
    pub(crate) fn source_grid_mask(&self, actor:usize)->u16 {
        let track=&self.tracks[actor];
        let Some(slot)=track.playing_slot else {return 0;};
        if track.muted || !track.clips[slot].exists() {return 0;}
        let route=self.source_routes[actor];
        if route.enabled && !(self.recording && self.records_track(actor)) {
            if let Some(reference)=route.grid_holds {
                let donor=&self.tracks[reference.track];
                let clip=&donor.clips[reference.slot];
                if !donor.muted && donor.playing_slot==Some(reference.slot) && clip.exists() {
                    return crate::grid::mask(clip,self.source_positions[reference.track]);
                }
            }
        }
        crate::grid::mask(&track.clips[slot],track.pos_tick)
    }
    /// Resolve routed holds before notes, including when the actor's clock is
    /// slower than the donor. The existing Grid mask emits only changed edges.
    fn source_grid_tick(&mut self,out:&mut Vec<OutEvent>) {
        for actor in 0..NUM_TRACKS {
            let route=self.source_routes[actor];
            let routed=route.enabled && route.grid_holds.is_some();
            if routed || self.source_grid_active[actor] {self.grid_tick(actor,out);}
            self.source_grid_active[actor]=routed;
        }
    }
}
