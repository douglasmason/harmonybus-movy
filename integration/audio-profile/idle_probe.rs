//! Opt-in normal / minimal callback / normal comparison; fixed-size collection.
//! Host output, UI request work, and native instruments remain outside this boundary.
use std::time::Instant;
#[derive(Clone, Copy, Default)]
struct Phase {
    blocks: u64, gap_count: u64, over_period: u64, over_half: u64,
    gap_peak: u64, work_sum: u64, work_peak: u64, idle_peak: u64,
}
#[derive(Clone, Copy, Default)]
struct Gap { ms: u64, phase: usize, previous_phase: usize, gap: u64, work: u64, idle: u64, requests: u64 }
#[derive(Default)]
pub struct IdleProbe {
    pub active: bool, pub aborted: bool,
    origin: Option<Instant>, previous: Option<Instant>, end: Option<Instant>,
    current_phase: usize, previous_phase: usize, previous_work: u64, requests: u64,
    phases: [Phase; 3], gaps: [Gap; 12],
}
impl IdleProbe {
    #[cfg(test)]
    pub fn test_elapsed(&mut self, seconds: u64) { self.origin=Some(Instant::now()-std::time::Duration::from_secs(seconds)); }
    pub fn start(&mut self) { *self = Self { active: true, origin: Some(Instant::now()), ..Self::default() }; }
    pub fn stop(&mut self) { if self.active { self.aborted = true; } self.active = false; }
    pub fn begin(&mut self, frames: usize, rate: u32) -> bool {
        if !self.active { return false; }
        self.begin_at(Instant::now(), frames, rate)
    }
    fn begin_at(&mut self, now: Instant, frames: usize, rate: u32) -> bool {
        if !self.active { return false; }
        let elapsed = now.duration_since(self.origin.unwrap()).as_millis() as u64;
        if elapsed >= 60_000 { self.active = false; return false; }
        self.current_phase = (elapsed / 20_000) as usize;
        let metric = &mut self.phases[self.current_phase];
        metric.blocks += 1;
        if let Some(previous) = self.previous {
            let gap = now.duration_since(previous).as_nanos() as u64;
            let idle = self.end.map_or(0, |end| now.duration_since(end).as_nanos() as u64);
            let period = frames as u64 * 1_000_000_000 / u64::from(rate.max(1));
            metric.gap_count += 1;
            metric.over_period += u64::from(gap > period);
            metric.over_half += u64::from(gap > period + period / 2);
            metric.gap_peak = metric.gap_peak.max(gap);
            metric.idle_peak = metric.idle_peak.max(idle);
            let event = Gap { ms: elapsed, phase: self.current_phase, previous_phase: self.previous_phase,
                gap, work: self.previous_work, idle, requests: self.requests };
            let smallest = self.gaps.iter().enumerate().min_by_key(|(_,entry)| entry.gap).unwrap().0;
            if gap > self.gaps[smallest].gap { self.gaps[smallest] = event; }
        }
        self.requests = 0; self.previous = Some(now);
        self.current_phase == 1
    }
    pub fn finish(&mut self) {
        if !self.active { return; }
        self.finish_at(Instant::now());
    }
    fn finish_at(&mut self, now: Instant) {
        let work = now.duration_since(self.previous.unwrap()).as_nanos() as u64;
        let metric = &mut self.phases[self.current_phase];
        metric.work_sum += work; metric.work_peak = metric.work_peak.max(work);
        self.previous_work = work; self.previous_phase = self.current_phase; self.end = Some(now);
    }
    pub fn request(&mut self, start: Option<Instant>) {
        if self.active { if let Some(start) = start { self.requests += start.elapsed().as_nanos() as u64; } }
    }
    pub fn status(&self) -> String {
        use std::fmt::Write;
        let mut output = format!(" idleprobe={},{}", self.active as u8, self.aborted as u8);
        for phase in &self.phases {
            let _ = write!(output,";{},{},{},{},{},{},{},{}", phase.blocks,phase.gap_count,
                phase.over_period,phase.over_half,phase.gap_peak/1000,
                phase.work_sum/phase.blocks.max(1)/1000,phase.work_peak/1000,phase.idle_peak/1000);
        }
        // Export bounded evidence only after collection, avoiding extra live status traffic.
        if !self.active { for gap in &self.gaps { if gap.gap != 0 {
            let _ = write!(output,";{},{},{},{},{},{},{}",gap.ms,gap.phase,gap.previous_phase,
                gap.gap/1000,gap.work/1000,gap.idle/1000,gap.requests/1000);
        } } }
        output
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn boundaries_restore_without_ui_and_preserve_transition_attribution() {
        let start=Instant::now(); let mut probe=IdleProbe::default();probe.start();probe.origin=Some(start);
        for (ms,minimal) in [(0,false),(19999,false),(20000,true),(39999,true),(40000,false),(59999,false),(60000,false)] {
            let now=start+Duration::from_millis(ms);
            assert_eq!(probe.begin_at(now,128,44100),minimal);
            if probe.active { probe.finish_at(now+Duration::from_micros(100)); }
        }
        assert!(!probe.active);assert!(!probe.aborted);
        assert!(probe.gaps.iter().any(|gap|gap.phase==1 && gap.previous_phase==0));
        assert!(probe.gaps.iter().any(|gap|gap.phase==2 && gap.previous_phase==1));
        assert_eq!(probe.phases[1].blocks,2);
        probe.stop();assert!(!probe.aborted);
        probe.start();probe.stop();assert!(probe.aborted);
        assert!(!probe.begin_at(start+Duration::from_secs(21),128,44100));
    }
    #[test]
    fn retains_largest_gaps_and_pairs_previous_work_with_idle() {
        let start=Instant::now();let mut probe=IdleProbe::default();probe.start();probe.origin=Some(start);
        for index in 0..100 {
            let now=start+Duration::from_millis(index*3);
            probe.begin_at(now,128,44100);probe.finish_at(now+Duration::from_micros(100));
        }
        assert_eq!(probe.phases[0].gap_count,99);
        assert_eq!(probe.phases[0].over_period,99);
        assert_eq!(probe.phases[0].over_half,0);
        for gap in probe.gaps { assert_eq!(gap.gap,3_000_000);assert_eq!(gap.work,100_000);assert_eq!(gap.idle,2_900_000); }
    }
}
