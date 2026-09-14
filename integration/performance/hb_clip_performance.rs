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
/// Persisted in HB; copied only when its parameters or chain change.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AutoConfig {
    pub operation: u8, pub amount: i32, pub grid: u8, pub cycle: u8,
    pub every: u8, pub from: u8, pub through: u8, pub probability: u8, pub evolve: bool,
}
impl AutoConfig {
    pub fn parse(message: &str) -> Option<[Option<Self>;16]> {
        let mut parts=message.split(';');
        if parts.next()? != "mca1" { return None; }
        let mut result=[None;16];let mut seen=0u16;
        for entry in parts {
            let fields: Vec<i32>=entry.split(',').map(str::parse).collect::<Result<_,_>>().ok()?;
            let [lane,operation,amount,grid,cycle,every,from,through,probability,evolve]=fields.as_slice() else { return None; };
            if !(0..16).contains(lane)||!(12..=15).contains(operation)||!(-400..=400).contains(amount)||
                !(0..=8).contains(grid)||!(0..=6).contains(cycle)||!(1..=16).contains(every)||
                *from<1||from>through||through>every||!(0..=100).contains(probability)||!(0..=1).contains(evolve) { return None; }
            let bit=1u16<<*lane;if seen&bit!=0 { return None; }seen|=bit;
            result[*lane as usize]=Some(Self {operation:*operation as u8,amount:*amount,grid:*grid as u8,cycle:*cycle as u8,
                every:*every as u8,from:*from as u8,through:*through as u8,probability:*probability as u8,evolve:*evolve!=0});
        }
        Some(result)
    }
    fn cycle_ticks(self) -> u64 { [48,96,192,384,768,1152,1536][self.cycle as usize] }
}
#[derive(Clone, Default)]
pub struct Performance {
    pub slots: [Option<Gesture>; 16],
    serial: u64,
    automatic: [Option<Gesture>;16],
    windows: [u64;16],
    auto_tick: Option<u64>,
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
    /// One decision per phrase window. Manual holds always take priority.
    pub fn update_auto(&mut self, configs: &[Option<AutoConfig>;16], tick: u64, normal: u32, clip: usize, track: usize, allowed: bool) {
        if self.auto_tick.is_some_and(|previous|tick<previous) { self.automatic.fill(None); }
        self.auto_tick=Some(tick);
        for (lane,config) in configs.iter().enumerate() {
            let Some(config)=config.filter(|_|allowed) else { self.automatic[lane]=None;continue; };
            let cycle=tick/config.cycle_ticks();
            let continuous=config.from==1&&config.through==config.every&&config.probability==100;
            let window=if continuous {0} else {cycle/config.every as u64};
            let position=cycle%config.every as u64+1;
            let mut seed=(lane as u32+1).wrapping_mul(0x9e3779b9)^(track as u32+1).wrapping_mul(0x85ebca6b);
            if config.evolve { seed^=(window as u32).wrapping_mul(0xc2b2ae35); }
            seed^=seed>>16;seed=seed.wrapping_mul(0x7feb352d);seed^=seed>>15;seed=seed.wrapping_mul(0x846ca68b);seed^=seed>>16;
            if position<config.from as u64||position>config.through as u64||seed%100>=config.probability as u32 {
                self.automatic[lane]=None;continue;
            }
            if self.automatic[lane].map_or(true,|gesture|gesture.clip!=clip)||self.windows[lane]!=window {
                self.windows[lane]=window;
                self.automatic[lane]=Some(Gesture {operation:config.operation,amount:config.amount.clamp(-100,100),grid:6u32<<config.grid,
                    origin:normal,clip,order:lane as u64,age:0});
            }
        }
    }
    pub fn config_changed(&mut self, lane: usize) { self.automatic[lane]=None;self.slots[lane]=None; }
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
        let newest = self.slots.iter().flatten().max_by_key(|gesture| gesture.order).copied()
            .or_else(||self.automatic.iter().flatten().max_by_key(|gesture|gesture.order).copied());
        for gesture in self.slots.iter_mut().chain(self.automatic.iter_mut()).flatten() { gesture.age += 1; }
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

#[cfg(test)]
mod auto_tests {
    use super::*;
    fn settings() -> [Option<AutoConfig>;16] {
        AutoConfig::parse("mca1;0,12,1,0,3,4,4,4,100,0").unwrap()
    }
    #[test]
    fn range_boundaries_and_manual_priority() {
        let mut performance=Performance::default();let configs=settings();
        for tick in [0,384,768,1151] {
            performance.update_auto(&configs,tick,0,0,0,true);
            assert!(performance.advance(0,0,384,0).is_none());
        }
        performance.update_auto(&configs,1152,24,0,0,true);
        assert_eq!(performance.advance(0,0,384,24).unwrap().first,24);
        performance.hold(1,true,13,1,0,25,0);
        performance.update_auto(&configs,1153,25,0,0,true);
        assert!(performance.advance(0,0,384,25).unwrap().reverse);
        performance.hold(1,false,0,0,0,0,0);
        performance.update_auto(&configs,1154,26,0,0,true);
        assert_eq!(performance.advance(0,0,384,26).unwrap().first,26);
        performance.update_auto(&configs,1536,0,0,0,true);
        assert!(performance.advance(0,0,384,0).is_none());
        performance.update_auto(&configs,2688,96,0,0,true);
        assert_eq!(performance.advance(0,0,384,96).unwrap().first,96);
    }
    #[test]
    fn full_range_is_continuous_and_config_or_recording_cancels() {
        let configs=AutoConfig::parse("mca1;0,15,2,0,0,1,1,1,100,0").unwrap();
        let mut performance=Performance::default();
        for tick in 0..120 {
            performance.update_auto(&configs,tick, tick as u32,0,0,true);
            assert_eq!(performance.advance(0,0,384,tick as u32).unwrap().first,(tick*2) as u32);
        }
        // Two reader steps at one master tick (a scaled clip) must not restart.
        performance.update_auto(&configs,119,120,0,0,true);
        assert_eq!(performance.advance(0,0,384,120).unwrap().first,240);
        performance.update_auto(&configs,120,121,0,0,false);
        assert!(performance.advance(0,0,384,121).is_none());
        performance.update_auto(&configs,121,122,0,0,true);
        assert_eq!(performance.advance(0,0,384,122).unwrap().first,122);
        performance.config_changed(0);assert!(performance.advance(0,0,384,123).is_none());
    }
    #[test]
    fn parser_rejects_partial_unsafe_or_duplicate_config() {
        assert!(AutoConfig::parse("mca1").unwrap().iter().all(Option::is_none));
        for bad in ["", "mca1;0,12,1", "mca1;0,12,1,9,3,4,4,4,100,0", "mca1;0,12,1,0,3,4,4,3,100,0",
            "mca1;16,12,1,0,3,4,4,4,100,0", "mca1;0,12,1,0,3,4,4,4,101,0",
            "mca1;0,12,1,0,3,4,4,4,100,0;0,12,1,0,3,4,4,4,100,0"] { assert!(AutoConfig::parse(bad).is_none(),"{bad}"); }
    }
    #[test]
    fn probability_and_track_decisions_are_deterministic() {
        let mut configs=settings();configs[0].as_mut().unwrap().probability=0;
        let mut performance=Performance::default();performance.update_auto(&configs,1152,0,0,0,true);
        assert!(performance.advance(0,0,384,0).is_none());
        configs[0].as_mut().unwrap().probability=50;configs[0].as_mut().unwrap().evolve=true;
        let mut admitted=0;
        for phrase in 0..100 {
            let tick=phrase*1536+1152;
            performance.update_auto(&configs,tick,0,0,0,true);
            let first=performance.advance(0,0,384,0).is_some();
            let mut second=Performance::default();second.update_auto(&configs,tick,0,0,0,true);
            assert_eq!(first,second.advance(0,0,384,0).is_some());admitted+=usize::from(first);
        }
        assert!((20..80).contains(&admitted));
    }
}
