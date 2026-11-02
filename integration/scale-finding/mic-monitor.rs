//! Low-overhead physical Move audio-input tap for Scale Finding.
//! RT callback: at most 16 atomic mono writes for a 128-frame block.
//! Worker: bounded 36-frequency Goertzel bank, never on the callback.
//! This is the host's already-routed AUDIO_IN (mic or line); it does not
//! configure hardware input routing and NEVER records audio to a file.
use std::sync::atomic::{AtomicBool, AtomicI16, AtomicU8, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread::{self, JoinHandle};
use std::time::Duration;

const RING: usize = 8192;
const WINDOW: usize = 4096;
const DECIMATION: usize = 8;
const BINS: usize = 12;

struct Shared {
    pcm: [AtomicI16; RING],
    write_pos: AtomicU64,
    active: AtomicBool,
    shutdown: AtomicBool,
    result_seq: AtomicU64,
    result: [AtomicU8; BINS],
}
impl Shared {
    fn new() -> Self {
        Self { pcm: std::array::from_fn(|_| AtomicI16::new(0)),
            write_pos: AtomicU64::new(0), active: AtomicBool::new(false),
            shutdown: AtomicBool::new(false), result_seq: AtomicU64::new(0),
            result: std::array::from_fn(|_| AtomicU8::new(0)) }
    }
}

pub struct MicMonitor {
    shared: Arc<Shared>,
    worker: Option<JoinHandle<()>>,
}
impl MicMonitor {
    pub fn new() -> Self {
        let shared = Arc::new(Shared::new());
        let second = Arc::clone(&shared);
        let worker = thread::Builder::new().name("movy-mic-chroma".into())
            .spawn(move || worker_loop(second)).ok();
        Self { shared, worker }
    }
    pub fn available(&self) -> bool {
        self.worker.is_some() && crate::host::audio_input_available()
    }
    pub fn listening(&self) -> bool {
        self.shared.active.load(Ordering::Acquire)
    }
    pub fn set_listening(&self, next: bool) {
        let enabled = next && self.available();
        // Invalidate the old history on each START, but not on STOP, where
        // the UI must retain its existing accumulated chroma.
        if enabled && !self.listening() {
            self.shared.write_pos.store(0, Ordering::Release);
            for value in &self.shared.result { value.store(0, Ordering::Relaxed); }
            self.shared.result_seq.fetch_add(1, Ordering::Release);
        }
        self.shared.active.store(enabled, Ordering::Release);
    }
    /// No alloc, no I/O, no locks, no FFT, no host parameter reads.
    pub fn capture(&self, frames: usize) {
        if !self.listening() || frames < DECIMATION { return; }
        let Some(input) = crate::host::audio_input_block(frames) else { return; };
        let count = frames / DECIMATION;
        let pos = self.shared.write_pos.load(Ordering::Relaxed);
        for index in 0..count {
            let mut sum: i32 = 0;
            for part in 0..DECIMATION {
                let offset = (index * DECIMATION + part) * 2;
                sum += (i32::from(input[offset]) + i32::from(input[offset + 1])) / 2;
            }
            let mono = (sum / DECIMATION as i32) as i16;
            self.shared.pcm[((pos as usize) + index) & (RING - 1)]
                .store(mono, Ordering::Relaxed);
        }
        self.shared.write_pos.store(pos + count as u64, Ordering::Release);
    }
    /// Called only by normal status GET, which already runs outside render.
    pub fn report(&self) -> String {
        let mut out = format!(" mca={} mcs={} mcv={}.",
            self.available() as u8, self.listening() as u8,
            self.shared.result_seq.load(Ordering::Acquire));
        for value in &self.shared.result {
            use std::fmt::Write;
            let _ = write!(out, "{:02x}", value.load(Ordering::Relaxed));
        }
        out
    }
}
impl Drop for MicMonitor {
    fn drop(&mut self) {
        self.shared.active.store(false, Ordering::Release);
        self.shared.shutdown.store(true, Ordering::Release);
        if let Some(worker) = self.worker.take() { let _ = worker.join(); }
    }
}

#[cfg(target_os = "linux")]
fn demote_worker() {
    // A child thread inherits Move's SCHED_FIFO 70 from the SPI callback.
    // The first action MUST be SCHED_OTHER, before any DSP or allocations.
    #[repr(C)]
    struct SchedParam { sched_priority: i32 }
    unsafe extern "C" {
        fn sched_setscheduler(pid: i32, policy: i32, param: *const SchedParam) -> i32;
        fn sched_setaffinity(pid: i32, len: usize, mask: *const u8) -> i32;
        fn nice(increment: i32) -> i32;
    }
    unsafe {
        let parameter = SchedParam { sched_priority: 0 };
        let _ = sched_setscheduler(0, 0, &parameter); // SCHED_OTHER = 0
        let mut cpuset = [0u8; 128];
        cpuset[0] = 0b0000_0111; // cores 0-2; leave core 3 for SPI
        let _ = sched_setaffinity(0, cpuset.len(), cpuset.as_ptr());
        let _ = nice(10);
    }
}
#[cfg(not(target_os = "linux"))]
fn demote_worker() {}

fn worker_loop(shared: Arc<Shared>) {
    demote_worker();
    let mut samples = [0f32; WINDOW];
    let mut window = [0f32; WINDOW];
    for (index, coefficient) in window.iter_mut().enumerate() {
        *coefficient = 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (WINDOW - 1) as f32).cos();
    }
    loop {
        thread::sleep(Duration::from_millis(160));
        if shared.shutdown.load(Ordering::Acquire) { break; }
        if !shared.active.load(Ordering::Acquire) { continue; }
        let position = shared.write_pos.load(Ordering::Acquire);
        if position < WINDOW as u64 { continue; }
        for (index, sample) in samples.iter_mut().enumerate() {
            let slot = ((position as usize - WINDOW + index) & (RING - 1));
            *sample = f32::from(shared.pcm[slot].load(Ordering::Relaxed)) / 32768.0;
        }
        // Skip a torn window if the audio producer lapped it during the copy.
        if shared.write_pos.load(Ordering::Acquire).saturating_sub(position) > (RING-WINDOW) as u64 {
            continue;
        }
        let result = analyze(&samples, &window, crate::host::sample_rate() as f32 / DECIMATION as f32);
        if !shared.active.load(Ordering::Acquire) { continue; }
        for (index, value) in result.iter().enumerate() {
            shared.result[index].store(*value, Ordering::Relaxed);
        }
        shared.result_seq.fetch_add(1, Ordering::Release);
    }
}
fn analyze(samples: &[f32; WINDOW], window: &[f32; WINDOW], sample_rate: f32) -> [u8; BINS] {
    let mut peak = [0f32; BINS];
    let mean_square: f32 = samples.iter().map(|sample| sample * sample).sum::<f32>() / WINDOW as f32;
    if mean_square < 0.000004 { return [0; BINS]; } // <-54 dBFS
    for midi in 48..84 {
        let frequency = 440.0 * 2.0f32.powf((midi as f32 - 69.0) / 12.0);
        let omega = std::f32::consts::TAU * frequency / sample_rate;
        let coefficient = 2.0 * omega.cos();
        let mut prior = 0f32;
        let mut older = 0f32;
        for (sample, weight) in samples.iter().zip(window.iter()) {
            let current = sample * weight + coefficient * prior - older;
            older = prior;
            prior = current;
        }
        let power = (prior * prior + older * older - coefficient * prior * older).max(0.0);
        let note = midi as usize % BINS;
        peak[note] = peak[note].max(power.sqrt());
    }
    let maximum = peak.iter().copied().fold(0f32, f32::max);
    if maximum < 0.01 { return [0; BINS]; }
    std::array::from_fn(|index| (127.0 * (peak[index] / maximum).clamp(0.0, 1.0)).round() as u8)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_window() -> [f32; WINDOW] {
        std::array::from_fn(|index| 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (WINDOW-1) as f32).cos())
    }
    #[test] fn silence_is_zero() {
        assert_eq!(analyze(&[0.0; WINDOW], &test_window(), 44100.0/8.0), [0; BINS]);
    }
    #[test] fn a440_scores_a() {
        let pcm = std::array::from_fn(|index| (std::f32::consts::TAU *
            440.0 * index as f32 / (44100.0/8.0)).sin() * 0.4);
        let bins = analyze(&pcm, &test_window(), 44100.0/8.0);
        assert_eq!(bins.iter().position(|value| *value == *bins.iter().max().unwrap()), Some(9));
        assert!(bins[9]>90);
    }
    #[test] fn disabled_has_no_capture() {
        let monitor=MicMonitor::new();
        monitor.capture(128);
        assert_eq!(monitor.shared.write_pos.load(Ordering::Relaxed),0);
    }
}
