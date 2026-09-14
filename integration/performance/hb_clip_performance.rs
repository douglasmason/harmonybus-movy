//! Runtime clip-reader gestures. Stored notes and the transport never move.
#[derive(Clone, Copy, Debug)]
pub struct Gesture {
    pub operation: u8,
    pub amount: i32,
    pub grid: u32,
    pub origin: u32,
    pub clip: usize,
    pub order: u64,
    pub age: u64,
}
#[derive(Clone, Default)]
pub struct Performance {
    pub slots: [Option<Gesture>; 16],
    serial: u64,
}
#[derive(Clone, Copy)]
pub struct ReadWindow {
    pub first: u32,
    pub count: u32,
    pub start: u32,
    pub span: u32,
    pub reverse: bool,
    pub speed_num: u32,
    pub speed_den: u32,
}
impl ReadWindow {
    pub fn contains(&self, tick: u32, gate: u32) -> bool {
        if tick < self.start || tick >= self.start + self.span { return false; }
        if self.reverse {
            // Mirror complete note intervals so a note ending at the loop end
            // attacks at the start of the reversed clip, with its gate intact.
            let end = (tick - self.start + gate.min(self.span)) % self.span;
            return self.first == self.start + (self.span - end) % self.span;
        }
        (0..self.count).any(|offset| self.start + (self.first - self.start + offset) % self.span == tick)
    }
    pub fn duration(&self, ticks: u32) -> u32 {
        ((ticks as u64 * self.speed_den as u64).div_ceil(self.speed_num as u64)).clamp(1, u32::MAX as u64) as u32
    }
}
impl Performance {
    pub fn hold(&mut self, lane: usize, down: bool, operation: u8, amount: i32, grid: u8, origin: u32, clip: usize) {
        if lane >= 16 { return; }
        if !down { self.slots[lane] = None; return; }
        if self.slots[lane].is_some() || !(12..=15).contains(&operation) { return; }
        self.serial = self.serial.wrapping_add(1);
        self.slots[lane] = Some(Gesture { operation, amount: amount.clamp(-100,100), grid: 6u32 << grid.min(8), origin, clip, order: self.serial, age: 0 });
    }
    pub fn advance(&mut self, clip: usize, start: u32, span: u32, normal: u32) -> Option<ReadWindow> {
        let span = span.max(1);
        for slot in &mut self.slots {
            if slot.as_ref().is_some_and(|gesture| gesture.clip != clip) { *slot = None; }
        }
        let newest = self.slots.iter().flatten().max_by_key(|gesture| gesture.order).copied();
        for gesture in self.slots.iter_mut().flatten() { gesture.age += 1; }
        let gesture = newest?;
        let relative = normal.saturating_sub(start) as i64;
        let wrap = |position: i64| start + position.rem_euclid(span as i64) as u32;
        let mut window = ReadWindow { first: normal, count: 1, start, span, reverse: false, speed_num: 1, speed_den: 1 };
        window.first = match gesture.operation {
            12 => {
                let length = gesture.grid.min(span).max(1);
                let origin = gesture.origin.saturating_sub(start) / length * length;
                wrap(origin as i64 + (gesture.age % length as u64) as i64)
            },
            13 => { window.reverse=true; normal },
            14 => wrap(relative + gesture.amount as i64 * gesture.grid as i64),
            15 => {
                // Negative amount selects 1/N speed; positive selects N speed.
                let amount = gesture.amount.clamp(-4,4);
                if amount < 0 { window.speed_den = amount.unsigned_abs().max(1); }
                else { window.speed_num = (amount as u32).max(1); }
                let before = gesture.age * window.speed_num as u64 / window.speed_den as u64;
                let after = (gesture.age + 1) * window.speed_num as u64 / window.speed_den as u64;
                // Half speed emits the first onset immediately, then every N ticks.
                window.count = if window.speed_den > 1 { u32::from(gesture.age % window.speed_den as u64 == 0) } else { (after-before) as u32 };
                wrap(gesture.origin.saturating_sub(start) as i64 + before as i64)
            },
            _ => return None,
        };
        Some(window)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn repeat_and_release_keep_transport_independent() {
        let mut performance = Performance::default();
        performance.hold(15,true,12,1,0,110,0);
        let positions: Vec<_> = (0..14).map(|tick| performance.advance(0,96,96,110+tick).unwrap().first).collect();
        assert_eq!(&positions[..8], &[108,109,110,111,112,113,108,109]);
        performance.hold(15,false,0,0,0,0,0);
        assert!(performance.advance(0,96,96,124).is_none());
    }
    #[test]
    fn reverse_shift_and_speed_respect_loop_window() {
        for (operation,amount,expected) in [(13,1,96),(14,-1,186),(15,2,96)] {
            let mut performance=Performance::default();performance.hold(0,true,operation,amount,0,96,0);
            assert_eq!(performance.advance(0,96,96,96).unwrap().first,expected);
        }
        let mut performance=Performance::default();performance.hold(0,true,15,-2,0,96,0);
        let windows: Vec<_>=(0..4).map(|tick|performance.advance(0,96,96,96+tick).unwrap()).collect();
        assert_eq!(windows.iter().map(|window|window.count).collect::<Vec<_>>(),vec![1,0,1,0]);
        assert_eq!(windows[2].first,97);assert_eq!(windows[0].duration(24),48);
    }
    #[test]
    fn latest_hold_wins_and_clip_change_clears() {
        let mut performance=Performance::default();performance.hold(0,true,14,1,0,0,0);
        performance.hold(1,true,13,1,0,0,0);
        assert!(performance.advance(0,0,96,0).unwrap().contains(72,24));
        performance.hold(1,false,0,0,0,0,0);
        assert_eq!(performance.advance(0,0,96,1).unwrap().first,7);
        assert!(performance.advance(1,0,96,0).is_none());
    }
}
