//! Ordered surface events supplied by the UI's canonical layout. No host changes.
//! A batch sounds and records each event together, avoiding per-note IPC pairs.

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Event {
    pub track: usize,
    pub pitch: u8,
    pub status: u8,
    pub value: u8,
    pub approach: Option<(i16, u8)>,
    pub full_velocity: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
struct Owner { track: usize, pitch: u8, full_velocity: bool }

pub struct SurfaceRoute {
    last_serial: [u64; 3],
    held: [Option<Owner>; 384],
}

impl SurfaceRoute {
    pub fn new() -> Self { Self { last_serial: [0; 3], held: [None; 384] } }

    fn release(&mut self, index: usize) -> Option<Event> {
        let owner = self.held[index].take()?;
        if self.held.iter().flatten().any(|other| other.track == owner.track && other.pitch == owner.pitch) { return None; }
        Some(Event { track: owner.track, pitch: owner.pitch, status: 0x80, value: 0,
            approach: None, full_velocity: owner.full_velocity })
    }

    fn route(&mut self, address: u16, mut event: Event) -> [Option<Event>; 2] {
        let index = address as usize;
        if event.status == 0x80 { return [self.release(index), None]; }
        if event.status == 0xa0 {
            return [self.held[index].map(|owner| Event { track: owner.track, pitch: owner.pitch,
                status: 0xa0, value: event.value, approach: None, full_velocity: owner.full_velocity }), None];
        }
        let released = self.release(index);
        let alias = self.held.iter().flatten().any(|owner| owner.track == event.track && owner.pitch == event.pitch);
        self.held[index] = Some(Owner { track: event.track, pitch: event.pitch, full_velocity: event.full_velocity });
        if event.full_velocity { event.value = 127; }
        [released, (!alias).then_some(event)]
    }

    /// Validate the entire batch before accepting anything. Retries retain serials,
    /// so a delayed acknowledgement can never turn one physical press into two.
    /// Format: serial,track,status,address,pitch,value,approach_shift,row,full_velocity.
    /// Row -1 means an ordinary note, 0..3 an approach resolved by the shared layout.
    pub fn batch(&mut self, payload: &str) -> [Option<Event>; 64] {
        let mut messages = [None; 32];
        let mut previous_serial = 0;
        for (index, message) in payload.split(';').enumerate() {
            if index >= messages.len() { return [None; 64]; }
            let mut fields = message.split(',');
            let Some(serial) = fields.next().and_then(|field| field.parse::<u64>().ok()) else { return [None; 64] };
            let mut values = [0i16; 8];
            for value in &mut values {
                let Some(parsed) = fields.next().and_then(|field| field.parse::<i16>().ok()) else { return [None; 64] };
                *value = parsed;
            }
            let [track,status,address,pitch,value,shift,row,full_velocity] = values;
            if fields.next().is_some() || serial <= previous_serial || !(0..16).contains(&track) ||
                !matches!(status, 128 | 144 | 160) || !(0..384).contains(&address) ||
                !(0..128).contains(&pitch) || !(0..128).contains(&value) ||
                !(-127..=127).contains(&shift) || !(-1..=3).contains(&row) || !(0..=1).contains(&full_velocity) ||
                (row >= 0 && !(0..128).contains(&(pitch + shift))) { return [None; 64]; }
            previous_serial = serial;
            messages[index] = Some((serial, address as u16, Event { track: track as usize,
                pitch: pitch as u8, status: if status == 144 && value == 0 { 128 } else { status as u8 },
                value: value as u8, approach: (row >= 0).then_some((shift, row as u8)), full_velocity: full_velocity != 0 }));
        }
        let mut events = [None; 64];
        for (index, (serial, address, event)) in messages.into_iter().flatten().enumerate() {
            let source = address as usize / 128;
            if serial <= self.last_serial[source] { continue; }
            self.last_serial[source] = serial;
            let routed = self.route(address, event);
            events[index * 2] = routed[0]; events[index * 2 + 1] = routed[1];
        }
        events
    }

    /// The serial fence prevents an older timed-out batch from reviving a note.
    pub fn release_all(&mut self, fence: u64) -> [Option<Event>; 128] {
        self.release_source(0, fence)
    }

    pub fn release_source(&mut self, source: usize, fence: u64) -> [Option<Event>; 128] {
        if source >= 3 || fence <= self.last_serial[source] { return [None; 128]; }
        self.last_serial[source] = self.last_serial[source].max(fence);
        std::array::from_fn(|index| self.release(source * 128 + index))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn message(serial: u64, track: usize, status: u8, address: u16, pitch: u8, value: u8) -> String {
        format!("{serial},{track},{status},{address},{pitch},{value},0,-1,0")
    }
    fn collect(route: &mut SurfaceRoute, payload: &str) -> Vec<Event> { route.batch(payload).into_iter().flatten().collect() }

    #[test]
    fn bursts_sound_and_record_in_order_and_retries_are_idempotent() {
        let mut route = SurfaceRoute::new();
        let batch = [message(1,2,144,11,60,93), message(2,2,160,11,60,0), message(3,7,128,11,72,0)].join(";");
        let events = collect(&mut route, &batch);
        assert_eq!(events.iter().map(|event| event.status).collect::<Vec<_>>(), vec![144,160,128]);
        assert!(events.iter().all(|event| event.track == 2 && event.pitch == 60));
        assert_eq!(events[0].value,93);
        assert_eq!(collect(&mut route,&batch).len(),0);
    }
    #[test]
    fn aliases_repeats_pressure_and_teardown_are_owned() {
        let mut route = SurfaceRoute::new();
        collect(&mut route,&message(1,0,144,11,60,90));
        assert!(collect(&mut route,&message(2,0,144,12,60,80)).is_empty());
        assert!(collect(&mut route,&message(3,0,128,11,60,0)).is_empty());
        assert_eq!(collect(&mut route,&message(4,7,160,12,72,0))[0].pitch,60);
        let repeated=collect(&mut route,&message(5,0,144,12,60,100));
        assert_eq!((repeated[0].status,repeated[1].status),(128,144));
        assert_eq!(route.release_all(8).iter().flatten().count(),1);
        assert!(collect(&mut route,&message(6,0,144,13,64,90)).is_empty());
        assert_eq!(collect(&mut route,"9,3,144,13,80,30,-32,0,1")[0],
            Event {track:3,pitch:80,status:144,value:127,approach:Some((-32,0)),full_velocity:true});
    }
    #[test]
    fn malformed_out_of_order_or_oversized_batches_cannot_partially_apply() {
        let mut route = SurfaceRoute::new();
        assert!(collect(&mut route,&format!("{};bad",message(1,0,144,11,60,90))).is_empty());
        assert!(route.release_all(0).iter().all(Option::is_none));
        assert!(collect(&mut route,&[message(2,0,144,11,60,90),message(1,0,128,11,60,0)].join(";")).is_empty());
        let oversized=(1..34).map(|serial|message(serial,0,144,11,60,90)).collect::<Vec<_>>().join(";");
        assert!(collect(&mut route,&oversized).is_empty());
        assert_eq!(collect(&mut route,&message(1,0,144,11,60,90)).len(),1);
        assert!(collect(&mut route,"2,3,144,13,80,30,80,0,1").is_empty());
    }
}

#[cfg(test)]
mod multisurface_tests {
    use super::*;
    #[test]
    fn cross_surface_aliases_release_only_the_last_owner() {
        let mut route = SurfaceRoute::new();
        assert_eq!(route.batch("1,2,144,60,60,90,0,-1,0").iter().flatten().count(),1);
        assert_eq!(route.batch("2,2,144,188,60,90,0,-1,0").iter().flatten().count(),0);
        assert_eq!(route.release_source(0,3).iter().flatten().count(),0);
        let events = route.batch("4,7,128,188,72,0,0,-1,0");
        let event = events.iter().flatten().next().unwrap();
        assert_eq!((event.track,event.pitch,event.status),(2,60,128));
    }
    #[test]
    fn fences_are_source_local_and_stale_resets_cannot_kill_new_notes() {
        let mut route = SurfaceRoute::new();
        route.release_source(1,10);
        assert_eq!(route.batch("9,2,144,60,60,90,0,-1,0").iter().flatten().count(),1);
        assert_eq!(route.batch("9,2,144,188,64,90,0,-1,0").iter().flatten().count(),0);
        assert_eq!(route.batch("11,2,144,188,64,90,0,-1,0").iter().flatten().count(),1);
        assert_eq!(route.release_source(1,10).iter().flatten().count(),0);
        assert_eq!(route.release_source(1,12).iter().flatten().count(),1);
        assert_eq!(route.release_source(0,13).iter().flatten().count(),1);
    }
    #[test]
    fn remote_namespace_and_bounds() {
        let mut route = SurfaceRoute::new();
        assert_eq!(route.batch("1,0,144,383,127,90,0,-1,0").iter().flatten().count(),1);
        assert_eq!(route.batch("2,0,144,384,127,90,0,-1,0").iter().flatten().count(),0);
        assert_eq!(route.release_source(3,3).iter().flatten().count(),0);
        assert_eq!(route.release_source(2,4).iter().flatten().count(),1);
    }
}
