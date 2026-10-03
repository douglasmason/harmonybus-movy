//! Opt-in callback timing. Fixed storage; formatting happens only on status reads.
use std::time::Instant;
const STAGES: usize = 7;
#[derive(Default)]
pub struct AudioProfile {
    pub enabled: bool,
    blocks: u64,
    over: u64,
    near: u64,
    peak: u64,
    budget: u64,
    maxima: [u64; STAGES],
    worst: [u64; STAGES],
}
impl AudioProfile {
    pub fn start(&mut self) { *self = Self { enabled: true, ..Self::default() }; }
    pub fn stamp(&self) -> Option<Instant> { self.enabled.then(Instant::now) }
    pub fn mark(&self, last: &mut Option<Instant>, spans: &mut [u64; STAGES], stage: usize) {
        if let Some(previous) = *last {
            let now = Instant::now();
            spans[stage] = now.duration_since(previous).as_nanos().min(u64::MAX as u128) as u64;
            *last = Some(now);
        }
    }
    pub fn finish(&mut self, spans: [u64; STAGES], frames: usize, rate: u32) {
        if !self.enabled || rate == 0 { return; }
        self.budget = (frames as u64).saturating_mul(1_000_000_000) / u64::from(rate);
        let total: u64 = spans.iter().sum();
        self.blocks = self.blocks.saturating_add(1);
        self.over = self.over.saturating_add(u64::from(total > self.budget));
        self.near = self.near.saturating_add(u64::from(total > self.budget * 7 / 10));
        for (peak, value) in self.maxima.iter_mut().zip(spans) { *peak = (*peak).max(value); }
        if total > self.peak { self.peak = total; self.worst = spans; }
    }
    pub fn status(&self) -> String {
        use std::fmt::Write;
        let mut result = format!(" aprof={},{},{},{},{},{}", self.enabled as u8,
            self.blocks, self.over, self.near, self.peak / 1000, self.budget / 1000);
        for value in self.worst { let _ = write!(result, ",{}", value / 1000); }
        for value in self.maxima { let _ = write!(result, ",{}", value / 1000); }
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retains_coincident_worst_block_and_counts_thresholds() {
        let mut meter = AudioProfile::default();
        meter.finish([2_000_000,0,0,0,0,0,0],48,48000);
        assert_eq!(meter.blocks,0);
        meter.start();
        meter.finish([800_000,0,0,0,0,0,0],48,48000);
        meter.finish([100_000,1_100_000,0,0,0,0,0],48,48000);
        assert_eq!((meter.blocks,meter.over,meter.near),(2,1,2));
        assert_eq!(meter.worst[0],100_000);
        assert_eq!(meter.maxima[0],800_000);
        assert!(meter.status().starts_with(" aprof=1,2,1,2,1200,1000,100,1100"));
        meter.start();
        assert_eq!((meter.blocks,meter.peak),(0,0));
    }
}
