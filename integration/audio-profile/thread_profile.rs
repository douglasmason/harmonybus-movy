//! Paired wall/thread CPU measurements. No allocation or I/O while collecting.
use std::time::Instant;
#[derive(Clone, Copy)]
pub struct Stamp { wall: Instant, cpu: Option<u64> }
#[derive(Clone, Copy, Default)]
struct Metric {
    count: u64, valid_cpu: u64, wall_sum: u64, cpu_sum: u64,
    wall_peak: u64, cpu_at_wall_peak: u64, wall_peak_cpu_valid: bool,
    cpu_peak: u64, wall_at_cpu_peak: u64, off_cpu_peak: u64,
    key: [u8; 32], key_len: usize,
}
#[repr(C)]
struct Timespec { seconds: std::os::raw::c_long, nanoseconds: std::os::raw::c_long }
#[cfg(target_os = "linux")]
extern "C" { fn clock_gettime(clock: std::os::raw::c_int, value: *mut Timespec) -> std::os::raw::c_int; }
fn thread_cpu_ns() -> Option<u64> {
    #[cfg(target_os = "linux")]
    {
        let mut value = Timespec { seconds: 0, nanoseconds: 0 };
        // Linux CLOCK_THREAD_CPUTIME_ID, valid for both device aarch64 and CI x86_64.
        if unsafe { clock_gettime(3, &mut value) } != 0 || value.seconds < 0 || value.nanoseconds < 0 { return None; }
        Some(value.seconds as u64 * 1_000_000_000 + value.nanoseconds as u64)
    }
    #[cfg(not(target_os = "linux"))]
    { None }
}
pub const CALLBACK: usize = 0;
pub const CHAINS: usize = 1;
pub const MIDI_TICKS: usize = 2;
pub const PREPARE: usize = 3;
pub const TONE_RENDER: usize = 4;
pub const TONE_VERIFY: usize = 5;
pub const READ: usize = 6;
pub const WRITE: usize = 7;
pub const MIDI: usize = 8;
#[derive(Default)]
pub struct ThreadProfile { pub enabled: bool, metrics: [Metric; 9] }
impl ThreadProfile {
    pub fn start(&mut self) { *self = Self { enabled: true, ..Self::default() }; }
    pub fn stop(&mut self) { self.enabled = false; }
    pub fn stamp(&self) -> Option<Stamp> {
        self.enabled.then(|| Stamp { wall: Instant::now(), cpu: thread_cpu_ns() })
    }
    pub fn done(&mut self, kind: usize, started: Option<Stamp>, key: &str) {
        let Some(started) = started else { return };
        if !self.enabled { return; }
        let cpu = started.cpu.zip(thread_cpu_ns()).and_then(|(start,end)| end.checked_sub(start));
        self.record(kind, started.wall.elapsed().as_nanos() as u64, cpu, key);
    }
    fn record(&mut self, kind: usize, wall: u64, cpu: Option<u64>, key: &str) {
        let metric = &mut self.metrics[kind];
        metric.count += 1; metric.wall_sum += wall;
        if let Some(cpu) = cpu {
            metric.valid_cpu += 1; metric.cpu_sum += cpu;
            metric.off_cpu_peak = metric.off_cpu_peak.max(wall.saturating_sub(cpu));
            if cpu > metric.cpu_peak { metric.cpu_peak = cpu; metric.wall_at_cpu_peak = wall; }
        }
        if wall > metric.wall_peak {
            metric.wall_peak = wall; metric.cpu_at_wall_peak = cpu.unwrap_or(0);
            metric.wall_peak_cpu_valid = cpu.is_some();
            metric.key_len = key.len().min(32);
            for (output, input) in metric.key[..metric.key_len].iter_mut().zip(key.bytes()) {
                *output = if input.is_ascii_graphic() && !b",;|".contains(&input) { input } else { b'_' };
            }
        }
    }
    pub fn status(&self) -> String {
        use std::fmt::Write;
        let mut output = format!(" threadprof={}", self.enabled as u8);
        for metric in &self.metrics {
            let key = std::str::from_utf8(&metric.key[..metric.key_len]).unwrap_or("?");
            let _ = write!(output, ";{},{},{},{},{},{},{},{},{},{},{}", metric.count, metric.valid_cpu,
                metric.wall_sum/metric.count.max(1)/1000, metric.cpu_sum/metric.valid_cpu.max(1)/1000,
                metric.wall_peak/1000, metric.cpu_at_wall_peak/1000, metric.wall_peak_cpu_valid as u8,
                metric.cpu_peak/1000, metric.wall_at_cpu_peak/1000, metric.off_cpu_peak/1000,
                if key.is_empty() { "-" } else { key });
        }
        output
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn paired_peaks_do_not_mix_unrelated_calls_and_missing_clocks_are_explicit() {
        let mut profile = ThreadProfile::default(); profile.start();
        profile.record(READ, 2_000_000, Some(100_000), "sleep");
        profile.record(READ, 1_000_000, Some(900_000), "compute");
        let metric = profile.metrics[READ];
        assert_eq!(metric.cpu_at_wall_peak, 100_000);
        assert_eq!(metric.wall_at_cpu_peak, 1_000_000);
        assert_eq!(metric.off_cpu_peak, 1_900_000);
        profile.record(READ, 3_000_000, None, "failed");
        assert!(!profile.metrics[READ].wall_peak_cpu_valid);
        assert_eq!(profile.metrics[READ].valid_cpu, 2);
        profile.stop(); profile.done(READ, None, "disabled");
        assert!(profile.stamp().is_none());
    }
    #[test]
    #[cfg(target_os = "linux")]
    fn thread_clock_excludes_sleep_and_observes_busy_work() {
        let mut profile = ThreadProfile::default(); profile.start();
        let started = profile.stamp();
        std::thread::sleep(std::time::Duration::from_millis(20));
        profile.done(READ, started, "sleep");
        assert_eq!(profile.metrics[READ].valid_cpu, 1);
        assert!(profile.metrics[READ].off_cpu_peak > 10_000_000);
        let started = profile.stamp();
        let until = Instant::now();
        while until.elapsed().as_millis() < 10 { std::hint::black_box(42u64.wrapping_mul(333)); }
        profile.done(WRITE, started, "compute");
        assert!(profile.metrics[WRITE].cpu_sum > 0);
    }
}
