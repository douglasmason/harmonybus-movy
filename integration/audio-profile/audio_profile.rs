//! Opt-in callback timing. Fixed storage; formatting happens only on status reads.
use std::time::Instant;
const STAGES: usize = 7;
#[derive(Clone, Copy)]
pub enum Request { Read = 0, Write = 1, Midi = 2 }
#[derive(Clone, Copy)]
struct RequestPeak { ns: u64, key: [u8; 64], length: usize }
impl Default for RequestPeak {
    fn default() -> Self { Self { ns: 0, key: [0; 64], length: 0 } }
}
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
    worst_track: (usize, u64),
    requests: [RequestPeak; 3],
    pending_ns: u64,
    pending_count: u64,
    burst_ns: u64,
    burst_count: u64,
    previous_start: Option<Instant>,
    previous_end: Option<Instant>,
    previous_budget: u64,
    intervals: u64,
    long_intervals: u64,
    cadence_peak: u64,
    cadence_idle: u64,
    cadence_render: u64,
    cadence_requests: u64,
    cadence_block: u64,
    pending_request: RequestPeak,
    cadence_request: RequestPeak,
    short_intervals: u64,
    late_groups: u64,
    group_start: Option<Instant>,
    last_late: Option<Instant>,
    group_count: u64,
    largest_group: u64,
    largest_group_span: u64,
    capture_limit_ns: u64,
    capture_start: Option<Instant>,
    duration_ns: u64,
}
impl AudioProfile {
    pub fn start(&mut self) { *self = Self { enabled: true, ..Self::default() }; }
    /// Engine-owned deadline: a stalled or closed UI cannot prolong the capture.
    pub fn start_capture(&mut self) { self.start(); self.capture_limit_ns = 35_000_000_000; }
    pub fn stamp(&self) -> Option<Instant> { self.enabled.then(Instant::now) }
    /// Timestamp at the render boundary. No clocks when profiling is disabled.
    pub fn begin(&mut self) -> Option<Instant> {
        let now = self.stamp()?;
        self.begin_at(now);
        Some(now)
    }
    fn begin_at(&mut self, now: Instant) {
        if !self.enabled { return; }
        if self.capture_start.is_none() { self.capture_start = Some(now); }
        if let (Some(start), Some(end)) = (self.previous_start, self.previous_end) {
            let interval = now.duration_since(start).as_nanos().min(u64::MAX as u128) as u64;
            self.intervals = self.intervals.saturating_add(1);
            // Observed cadence, NOT proof of a driver underrun. Host buffering
            // and batching can legitimately change intervals between calls.
            self.long_intervals = self.long_intervals.saturating_add(u64::from(
                self.previous_budget > 0 && interval > self.previous_budget.saturating_mul(3) / 2));
            self.short_intervals = self.short_intervals.saturating_add(u64::from(
                self.previous_budget > 0 && interval < self.previous_budget / 2));
            if self.previous_budget > 0 && interval > self.previous_budget.saturating_mul(3) / 2 {
                // Group threshold crossings separated by no more than 100 ms.
                // These are timing clusters, never audible-glitch counts.
                let same_group = self.last_late.is_some_and(|last| now.duration_since(last).as_nanos() <= 100_000_000);
                if !same_group {
                    self.late_groups = self.late_groups.saturating_add(1);
                    self.group_start = Some(now); self.group_count = 0;
                }
                self.last_late = Some(now);
                self.group_count = self.group_count.saturating_add(1);
                let span = now.duration_since(self.group_start.unwrap()).as_nanos().min(u64::MAX as u128) as u64;
                if self.group_count >= self.largest_group {
                    self.largest_group = self.group_count; self.largest_group_span = span;
                }
            }
            if interval > self.cadence_peak {
                self.cadence_peak = interval;
                self.cadence_idle = now.duration_since(end).as_nanos().min(u64::MAX as u128) as u64;
                self.cadence_render = end.duration_since(start).as_nanos().min(u64::MAX as u128) as u64;
                self.cadence_requests = self.pending_ns;
                self.cadence_block = self.blocks + 1;
                self.cadence_request = self.pending_request;
            }
        }
        self.previous_start = Some(now);
        self.previous_end = None;
        self.pending_ns = 0;
        self.pending_count = 0;
        self.pending_request = RequestPeak::default();
    }
    pub fn mark(&self, last: &mut Option<Instant>, spans: &mut [u64; STAGES], stage: usize) {
        if let Some(previous) = *last {
            let now = Instant::now();
            spans[stage] = now.duration_since(previous).as_nanos().min(u64::MAX as u128) as u64;
            *last = Some(now);
        }
    }
    /// Measure an external module entry, not nested internal routing calls.
    /// No formatting, allocation, locks, or logging on the measured path.
    pub fn request_done(&mut self, request: Request, key: &str, started: Option<Instant>) {
        if let Some(started) = started {
            self.request_ns(request, key, started.elapsed().as_nanos().min(u64::MAX as u128) as u64);
        }
    }
    fn request_ns(&mut self, request: Request, key: &str, elapsed: u64) {
        if !self.enabled { return; }
        self.pending_ns = self.pending_ns.saturating_add(elapsed);
        self.pending_count = self.pending_count.saturating_add(1);
        if self.pending_ns > self.burst_ns {
            self.burst_ns = self.pending_ns;
            self.burst_count = self.pending_count;
        }
        let peak = &mut self.requests[request as usize];
        if elapsed <= peak.ns && elapsed <= self.pending_request.ns { return; }
        let mut observation = RequestPeak { ns: elapsed, ..RequestPeak::default() };
        observation.length = key.len().min(observation.key.len());
        for (destination, source) in observation.key[..observation.length].iter_mut().zip(key.bytes()) {
            // Status is whitespace/comma delimited. Names are diagnostic only.
            *destination = if source.is_ascii_graphic() && source != b',' { source } else { b'_' };
        }
        if elapsed > peak.ns { *peak = observation; }
        if elapsed > self.pending_request.ns { self.pending_request = observation; }
    }
    pub fn finish(&mut self, spans: [u64; STAGES], frames: usize, rate: u32, top_track: (usize, u64)) {
        if !self.enabled || rate == 0 { return; }
        self.finish_at(spans, frames, rate, top_track, Instant::now());
    }
    fn finish_at(&mut self, spans: [u64; STAGES], frames: usize, rate: u32, top_track: (usize, u64), now: Instant) {
        if !self.enabled || rate == 0 { return; }
        // A request burst is bounded by successive render calls. It is NOT a
        // host callback measurement and is never added to unrelated render peaks.
        self.previous_end = Some(now);
        self.budget = (frames as u64).saturating_mul(1_000_000_000) / u64::from(rate);
        self.previous_budget = self.budget;
        let total: u64 = spans.iter().sum();
        self.blocks = self.blocks.saturating_add(1);
        self.over = self.over.saturating_add(u64::from(total > self.budget));
        self.near = self.near.saturating_add(u64::from(total > self.budget * 7 / 10));
        for (peak, value) in self.maxima.iter_mut().zip(spans) { *peak = (*peak).max(value); }
        if total > self.peak { self.peak = total; self.worst = spans; self.worst_track = top_track; }
        if let Some(start) = self.capture_start {
            self.duration_ns = now.duration_since(start).as_nanos().min(u64::MAX as u128) as u64;
            if self.capture_limit_ns > 0 && self.duration_ns >= self.capture_limit_ns { self.enabled = false; }
        }
    }
    pub fn status(&self) -> String {
        use std::fmt::Write;
        let mut result = format!(" aprof={},{},{},{},{},{}", self.enabled as u8,
            self.blocks, self.over, self.near, self.peak / 1000, self.budget / 1000);
        for value in self.worst { let _ = write!(result, ",{}", value / 1000); }
        for value in self.maxima { let _ = write!(result, ",{}", value / 1000); }
        let _ = write!(result, ",{},{}", if self.worst_track.1 > 0 { self.worst_track.0 + 1 } else { 0 }, self.worst_track.1 / 1000);
        let _ = write!(result, ",{},{},{},{},{},{},{}", self.intervals, self.long_intervals,
            self.cadence_peak / 1000, self.cadence_idle / 1000, self.cadence_render / 1000,
            self.cadence_requests / 1000, self.cadence_block);
        let name = std::str::from_utf8(&self.cadence_request.key[..self.cadence_request.length]).unwrap_or("?");
        let _ = write!(result, ",{},{},{},{},{},{},{}", self.short_intervals, self.late_groups,
            self.largest_group, self.largest_group_span / 1000, self.cadence_request.ns / 1000,
            if name.is_empty() { "-" } else { name }, self.duration_ns / 1_000_000);
        let _ = write!(result, " rprof={},{},{}", self.enabled as u8, self.burst_ns / 1000, self.burst_count);
        for peak in &self.requests {
            let name = std::str::from_utf8(&peak.key[..peak.length]).unwrap_or("?");
            let _ = write!(result, ",{},{}", peak.ns / 1000, if name.is_empty() { "-" } else { name });
        }
        result
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn retains_coincident_worst_block_and_counts_thresholds() {
        let mut meter = AudioProfile::default();
        meter.finish([2_000_000,0,0,0,0,0,0],48,48000,(2,2_000_000));
        assert_eq!(meter.blocks,0);
        meter.start();
        meter.finish([800_000,0,0,0,0,0,0],48,48000,(4,300_000));
        meter.finish([100_000,1_100_000,0,0,0,0,0],48,48000,(2,200_000));
        meter.finish([100_000,0,0,0,0,0,0],48,48000,(7,50_000));
        assert_eq!((meter.blocks,meter.over,meter.near),(3,1,2));
        assert_eq!(meter.worst[0],100_000);
        assert_eq!(meter.maxima[0],800_000);
        assert_eq!(meter.worst_track,(2,200_000));
        assert!(meter.status().starts_with(" aprof=1,3,1,2,1200,1000,100,1100"));
        meter.start();
        assert_eq!((meter.blocks,meter.peak),(0,0));
    }
    #[test]
    fn request_peaks_names_and_bursts_are_bounded_and_reset_independently() {
        let mut meter = AudioProfile::default();
        meter.request_ns(Request::Read,"ignored",10_000_000);
        assert_eq!(meter.burst_ns,0);
        meter.start();
        meter.request_ns(Request::Read,"ch4:midi_fx1:surface_frame",900_000);
        meter.request_ns(Request::Write,"surface_events",300_000);
        meter.request_ns(Request::Midi,"note_on",50_000);
        assert!(meter.status().contains(" rprof=1,1250,3,900,ch4:midi_fx1:surface_frame,300,surface_events,50,note_on"));
        meter.finish([100_000,0,0,0,0,0,0],128,44100,(0,0));
        meter.begin();
        meter.request_ns(Request::Read,"small",100_000);
        assert_eq!((meter.burst_ns,meter.burst_count),(1_250_000,3));
        // Do not add a previous request burst to the render peak.
        assert_eq!(meter.peak,100_000);
        meter.request_ns(Request::Write,&"bad, key".repeat(20),2_000_000);
        assert_eq!(meter.requests[1].length,64);
        assert!(!std::str::from_utf8(&meter.requests[1].key).unwrap().contains([',',' ']));
        meter.start();
        assert_eq!((meter.burst_ns,meter.burst_count,meter.requests[0].ns),(0,0,0));
    }
}

#[cfg(test)]
mod cadence_tests {
    use super::*;
    use std::time::Duration;
    #[test]
    fn distinguishes_render_work_from_time_between_calls_and_resets() {
        let origin = Instant::now();
        let mut meter = AudioProfile::default();
        assert!(meter.begin().is_none());
        meter.start();
        meter.begin_at(origin);
        assert_eq!(meter.intervals, 0); // Never count time before enabling.
        meter.previous_end = Some(origin + Duration::from_micros(800));
        meter.previous_budget = 1_000_000;
        meter.blocks = 1;
        meter.request_ns(Request::Read, "status", 100_000);
        meter.begin_at(origin + Duration::from_micros(1000));
        assert_eq!((meter.intervals, meter.long_intervals), (1, 0));
        meter.previous_end = Some(origin + Duration::from_micros(1400));
        meter.blocks = 2;
        meter.request_ns(Request::Read, "pad_view", 200_000);
        meter.begin_at(origin + Duration::from_micros(5000));
        assert_eq!((meter.intervals, meter.long_intervals), (2, 1));
        assert_eq!((meter.cadence_peak, meter.cadence_idle, meter.cadence_render),
            (4_000_000, 3_600_000, 400_000));
        assert_eq!((meter.cadence_requests, meter.cadence_block), (200_000, 3));
        assert_eq!(meter.pending_ns, 0);
        assert!(meter.status().contains(",2,1,4000,3600,400,200,3,"));
        meter.enabled = false;
        meter.begin_at(origin + Duration::from_secs(2));
        assert_eq!(meter.intervals, 2);
        meter.start();
        meter.begin_at(origin + Duration::from_secs(3));
        assert_eq!((meter.intervals, meter.cadence_peak), (0, 0));
    }
    #[test]
    fn captures_clusters_catchup_coincident_request_and_engine_deadline() {
        let origin=Instant::now();
        let mut meter=AudioProfile::default();meter.start_capture();
        meter.begin_at(origin);
        meter.finish_at([200_000,0,0,0,0,0,0],48,48000,(0,0),origin+Duration::from_micros(200));
        // An unrelated earlier request peak must not be blamed on the worst gap.
        meter.request_ns(Request::Read,"earlier",900_000);
        meter.begin_at(origin+Duration::from_micros(2000));
        meter.finish_at([200_000,0,0,0,0,0,0],48,48000,(0,0),origin+Duration::from_micros(2200));
        meter.request_ns(Request::Read,"same_gap",700_000);
        meter.begin_at(origin+Duration::from_micros(5000));
        meter.finish_at([100_000,0,0,0,0,0,0],48,48000,(0,0),origin+Duration::from_micros(5100));
        meter.begin_at(origin+Duration::from_micros(5200));
        assert_eq!((meter.long_intervals,meter.late_groups,meter.largest_group,meter.short_intervals),(2,1,2,1));
        assert_eq!(meter.largest_group_span,3_000_000);
        assert_eq!(meter.cadence_request.ns,700_000);
        assert_eq!(&meter.cadence_request.key[..meter.cadence_request.length],b"same_gap");
        meter.finish_at([100_000,0,0,0,0,0,0],48,48000,(0,0),origin+Duration::from_micros(5300));
        meter.begin_at(origin+Duration::from_millis(200));
        assert_eq!(meter.late_groups,2);
        meter.finish_at([100_000,0,0,0,0,0,0],48,48000,(0,0),origin+Duration::from_secs(35));
        assert!(!meter.enabled);assert_eq!(meter.duration_ns,35_000_000_000);
        let snapshot=meter.status();meter.begin_at(origin+Duration::from_secs(36));
        meter.request_ns(Request::Write,"ignored",99_000_000);
        assert_eq!(meter.status(),snapshot);
    }
}
