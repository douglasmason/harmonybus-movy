//! Opt-in callback timing. Fixed storage; formatting happens only on status reads.
use std::time::Instant;
const STAGES: usize = 7;
#[derive(Clone, Copy)]
pub enum Request { Read = 0, Write = 1, Midi = 2 }
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
        if elapsed <= peak.ns { return; }
        peak.ns = elapsed;
        peak.length = key.len().min(peak.key.len());
        for (destination, source) in peak.key[..peak.length].iter_mut().zip(key.bytes()) {
            // Status is whitespace/comma delimited. Names are diagnostic only.
            *destination = if source.is_ascii_graphic() && source != b',' { source } else { b'_' };
        }
    }
    pub fn finish(&mut self, spans: [u64; STAGES], frames: usize, rate: u32, top_track: (usize, u64)) {
        if !self.enabled || rate == 0 { return; }
        // A request burst is bounded by successive render calls. It is NOT a
        // host callback measurement and is never added to unrelated render peaks.
        self.pending_ns = 0;
        self.pending_count = 0;
        self.budget = (frames as u64).saturating_mul(1_000_000_000) / u64::from(rate);
        let total: u64 = spans.iter().sum();
        self.blocks = self.blocks.saturating_add(1);
        self.over = self.over.saturating_add(u64::from(total > self.budget));
        self.near = self.near.saturating_add(u64::from(total > self.budget * 7 / 10));
        for (peak, value) in self.maxima.iter_mut().zip(spans) { *peak = (*peak).max(value); }
        if total > self.peak { self.peak = total; self.worst = spans; self.worst_track = top_track; }
    }
    pub fn status(&self) -> String {
        use std::fmt::Write;
        let mut result = format!(" aprof={},{},{},{},{},{}", self.enabled as u8,
            self.blocks, self.over, self.near, self.peak / 1000, self.budget / 1000);
        for value in self.worst { let _ = write!(result, ",{}", value / 1000); }
        for value in self.maxima { let _ = write!(result, ",{}", value / 1000); }
        let _ = write!(result, ",{},{}", if self.worst_track.1 > 0 { self.worst_track.0 + 1 } else { 0 }, self.worst_track.1 / 1000);
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
