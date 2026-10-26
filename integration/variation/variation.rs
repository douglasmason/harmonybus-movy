//! Repeatable clip expression, evaluated once at the existing note emission point.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Variation {
    pub amount: u32,
    pub gate: u32,
    pub velocity: u32,
    pub omit: u32,
    pub seed: u32,
    /// Bit 0 locks note length, bit 1 velocity and bit 2 omission.
    pub locks: u32,
}
impl Default for Variation {
    fn default() -> Self { Self { amount: 0, gate: 50, velocity: 30, omit: 0, seed: 1, locks: 0 } }
}
impl Variation {
    pub fn parse(message: &str) -> Option<(usize, Self)> {
        let mut fields = message.split_whitespace();
        let actor = fields.next()?.parse::<usize>().ok()?;
        let amount = fields.next()?.parse().ok()?;
        let gate = fields.next()?.parse().ok()?;
        let velocity = fields.next()?.parse().ok()?;
        let omit = fields.next()?.parse().ok()?;
        let seed = fields.next()?.parse().ok()?;
        // Old saved sessions contain five variation settings. Default every lock to Vary.
        let locks = match fields.next() { Some(value) => value.parse::<u32>().ok()?, None => 0 };
        let config = Self { amount, gate, velocity, omit, seed, locks };
        if fields.next().is_some() || actor >= 16 || config.amount > 100 || config.gate > 100
            || config.velocity > 100 || config.omit > 100 || !(1..=65535).contains(&config.seed)
            || config.locks > 7 { return None; }
        Some((actor, config))
    }
    pub fn message(self, actor: usize) -> String {
        format!("{} {} {} {} {} {} {}", actor, self.amount, self.gate, self.velocity, self.omit, self.seed, self.locks)
    }
    pub fn apply(self, random: u32, velocity: u8, duration: u32, protected: bool) -> Option<(u8, u32)> {
        if self.amount == 0 { return Some((velocity, duration)); }
        if !protected && self.locks & 4 == 0 && random.rotate_left(7) % 10000 < self.amount * self.omit { return None; }
        let delta = |bits: u32, depth: u32| ((bits % 20001) as i64 - 10000)
            * self.amount as i64 * depth as i64 / 1_000_000;
        let velocity = if velocity == 0 || self.locks & 2 != 0 { velocity } else {
            ((velocity as i64 * (100 + delta(random.rotate_left(13), self.velocity)) + 50) / 100).clamp(1,127) as u8
        };
        let duration = if self.locks & 1 != 0 { duration } else {
            ((duration as i64 * (100 + delta(random.rotate_left(23), self.gate)) + 50) / 100)
                .clamp(1,u32::MAX as i64) as u32
        };
        Some((velocity, duration))
    }
}
