//! Joint Play dispatch. Geometry is published atomically; held notes own their
//! original track/pitch across view, clip, octave and layout changes.
use crate::surface_route::Event;

#[derive(Clone, Copy, Debug, PartialEq)]
struct Cell { track: usize, pitch: u8, approach: Option<(i16, u8)> }

pub struct JointRoute {
    enabled: bool,
    cells: [Option<Cell>; 32],
    held: [Option<Cell>; 32],
}

impl JointRoute {
    pub fn new() -> Self { Self { enabled: false, cells: [None; 32], held: [None; 32] } }
    pub fn active(&self) -> bool { self.enabled }

    /// `off` or 32 `track,pitch,target,row` cells; -1 pitch is a dead pad.
    /// No partial commit on malformed input. Disabling preserves release owners.
    pub fn set_map(&mut self, value: &str) -> bool {
        if value == "off" { self.enabled = false; return true; }
        let mut cells = [None; 32];
        let mut count = 0;
        for (index, entry) in value.split(';').enumerate() {
            if index >= 32 { return false; }
            let fields: Vec<i16> = match entry.split(',').map(str::parse).collect() { Ok(fields) => fields, Err(_) => return false };
            if fields.len() != 4 || !(0..16).contains(&fields[0]) || !(-1..128).contains(&fields[1]) || !(-1..128).contains(&fields[2]) || !(0..4).contains(&fields[3]) { return false; }
            if fields[1] >= 0 {
                cells[index] = Some(Cell { track: fields[0] as usize, pitch: fields[1] as u8,
                    approach: (fields[2] >= 0).then_some((fields[2] - fields[1], fields[3] as u8)) });
            }
            count += 1;
        }
        if count != 32 { return false; }
        self.cells = cells; self.enabled = true; true
    }

    fn event(cell: Cell, status: u8, value: u8, full: bool) -> Event {
        Event { track: cell.track, pitch: cell.pitch, status,
            value: if status == 0x90 && full {127} else {value},
            approach: if status == 0x90 {cell.approach} else {None}, full_velocity: full }
    }

    pub fn route(&mut self, status: u8, pad: u8, value: u8, full: bool) -> [Option<Event>; 2] {
        let Some(index) = pad.checked_sub(68).filter(|index| *index < 32).map(usize::from) else {return [None; 2]};
        let status = if status & 0xf0 == 0x90 && value == 0 {0x80} else {status & 0xf0};
        if status == 0x80 { return [self.held[index].take().map(|cell| Self::event(cell, 0x80, 0, full)), None]; }
        if status == 0xa0 { return [self.held[index].map(|cell| Self::event(cell, status, value, full)), None]; }
        if status != 0x90 || !self.enabled {return [None; 2];}
        let previous = self.held[index].take().map(|cell| Self::event(cell, 0x80, 0, full));
        self.held[index] = self.cells[index];
        [previous, self.cells[index].map(|cell| Self::event(cell, 0x90, value, full))]
    }
    pub fn release_all(&mut self) -> [Option<Event>; 32] {
        std::array::from_fn(|index| self.held[index].take().map(|cell| Self::event(cell, 0x80, 0, false)))
    }
}

#[cfg(test)] mod tests {
    use super::*;
    fn map(track: usize, pitch: u8) -> String { (0..32).map(|_|format!("{track},{pitch},-1,0")).collect::<Vec<_>>().join(";") }
    #[test] fn owners_survive_disable_and_retarget() {
        let mut route=JointRoute::new(); assert!(route.set_map(&map(3,64)));
        assert_eq!(route.route(0x90,68,90,false)[1].unwrap().track,3);
        assert!(route.set_map(&map(7,72))); assert!(route.set_map("off"));
        let pressure=route.route(0xa0,68,50,false)[0].unwrap(); assert_eq!((pressure.track,pressure.pitch),(3,64));
        let off=route.route(0x80,68,0,false)[0].unwrap(); assert_eq!((off.track,off.pitch),(3,64));
    }
    #[test] fn map_is_atomic_and_repeats_release_first() {
        let mut route=JointRoute::new(); route.set_map(&map(0,60));
        assert!(!route.set_map("3,72,-1,0")); route.route(0x90,68,20,true);
        let repeat=route.route(0x90,68,50,true); assert_eq!(repeat[0].unwrap().status,0x80); assert_eq!(repeat[1].unwrap().value,127);
        assert_eq!(route.route(0x90,68,0,false)[0].unwrap().pitch,60);
    }
}
