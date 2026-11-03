//! Low-overhead physical Move audio-input tap for Scale Finding.
//! RT callback: at most 16 atomic mono writes for a 128-frame block.
//! Worker: bounded 36-frequency Goertzel bank and harmonic-residual chroma, never on the callback.
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
    // Incremented whenever Sample toggles, invalidating analysis calculated
    // from a prior listening session without blocking the SPI callback.
    capture_epoch: AtomicU64,
    shutdown: AtomicBool,
    worker_ready: AtomicBool,
    result_seq: AtomicU64,
    // Quantized dBFS: 0=undetectable, 1..96 => -95..0 dBFS.
    // Published by the demoted analysis worker, never computed on SPI RT.
    raw_rms: AtomicU8,
    raw_peak: AtomicU8,
    result: [AtomicU8; BINS],
}
impl Shared {
    fn new() -> Self {
        Self { pcm: std::array::from_fn(|_| AtomicI16::new(0)),
            write_pos: AtomicU64::new(0), active: AtomicBool::new(false),
            capture_epoch: AtomicU64::new(0),
            shutdown: AtomicBool::new(false), worker_ready: AtomicBool::new(false),
            result_seq: AtomicU64::new(0),
            raw_rms: AtomicU8::new(0), raw_peak: AtomicU8::new(0),
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
        self.worker.is_some() && self.shared.worker_ready.load(Ordering::Acquire)
            && crate::host::audio_input_available()
    }
    pub fn listening(&self) -> bool {
        self.shared.active.load(Ordering::Acquire)
    }
    pub fn set_listening(&self, next: bool) {
        let enabled = next && self.available();
        if self.listening() == enabled { return; }
        // No locks/joins/memory clearing on the SPI callback. First disarm
        // capture, then invalidate any worker analysis from an older session.
        self.shared.active.store(false, Ordering::Release);
        self.shared.capture_epoch.fetch_add(1, Ordering::AcqRel);
        if enabled {
            // Reset input history only on START. On STOP the UI retains
            // its accumulated chroma evidence until an explicit X.
            self.shared.write_pos.store(0, Ordering::Release);
            for value in &self.shared.result { value.store(0, Ordering::Relaxed); }
            self.shared.raw_rms.store(0, Ordering::Relaxed);
            self.shared.raw_peak.store(0, Ordering::Relaxed);
            self.shared.result_seq.fetch_add(1, Ordering::Release);
            self.shared.active.store(true, Ordering::Release);
        }
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
    /// Schwung's get_param/status ALSO runs on its SPI realtime callback.
    /// Append to the already-created engine status string instead of
    /// allocating a second String and formatting it on every UI poll.
    /// This removes our redundant allocation; the upstream status
    /// serialization itself remains a separate realtime-safety concern.
    pub fn append_status(&self, status: &mut String) {
        use std::fmt::Write;
        let _ = write!(status, " mca={} mcs={} mcv={}.",
            self.available() as u8, self.listening() as u8,
            self.shared.result_seq.load(Ordering::Acquire));
        for value in &self.shared.result {
            let _ = write!(status, "{:02x}", value.load(Ordering::Relaxed));
        }
        let _ = write!(status, " mcg={:02x}{:02x}",
            self.shared.raw_rms.load(Ordering::Relaxed),
            self.shared.raw_peak.load(Ordering::Relaxed));
    }
}
impl Drop for MicMonitor {
    fn drop(&mut self) {
        self.shared.active.store(false, Ordering::Release);
        self.shared.capture_epoch.fetch_add(1, Ordering::AcqRel);
        self.shared.shutdown.store(true, Ordering::Release);
        // The plugin's destroy_instance may run on Schwung's SPI RT thread.
        // Never join a worker from that callback. Its Arc owns the ring until
        // it notices shutdown and exits; unpark makes its exit prompt.
        if let Some(worker) = self.worker.take() { worker.thread().unpark(); }
    }
}

#[cfg(target_os = "linux")]
fn demote_worker() -> bool {
    // A child thread inherits Move's SCHED_FIFO 70 from the SPI callback.
    // The first action MUST be SCHED_OTHER, before any DSP or allocations.
    #[repr(C)]
    struct SchedParam { sched_priority: i32 }
    unsafe extern "C" {
        fn sched_setscheduler(pid: i32, policy: i32, param: *const SchedParam) -> i32;
        fn sched_setaffinity(pid: i32, len: usize, mask: *const u64) -> i32;
        fn nice(increment: i32) -> i32;
    }
    unsafe {
        let parameter = SchedParam { sched_priority: 0 };
        if sched_setscheduler(0, 0, &parameter) != 0 {
            // Fail CLOSED: inherited SCHED_FIFO workers starve Move audio.
            return false;
        } // SCHED_OTHER = 0
        let mut cpuset = [0u64; 16];
        cpuset[0] = 0b0000_0111; // cores 0-2; leave core 3 for SPI
        let _ = sched_setaffinity(0, std::mem::size_of_val(&cpuset), cpuset.as_ptr());
        let _ = nice(10);
    }
    true
}
#[cfg(not(target_os = "linux"))]
fn demote_worker() -> bool { true }

fn worker_loop(shared: Arc<Shared>) {
    if !demote_worker() { return; }
    shared.worker_ready.store(true, Ordering::Release);
    let mut samples = [0f32; WINDOW];
    let mut window = [0f32; WINDOW];
    for (index, coefficient) in window.iter_mut().enumerate() {
        *coefficient = 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (WINDOW - 1) as f32).cos();
    }
    loop {
        // Park permits nonblocking teardown from an RT destroy callback.
        thread::park_timeout(Duration::from_millis(160));
        if shared.shutdown.load(Ordering::Acquire) { break; }
        if !shared.active.load(Ordering::Acquire) { continue; }
        let session_epoch = shared.capture_epoch.load(Ordering::Acquire);
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
        let (rms_level, peak_level) = measure_input_levels(&samples);
        let result = analyze(&samples, &window, crate::host::sample_rate() as f32 / DECIMATION as f32);
        if !shared.active.load(Ordering::Acquire) ||
            shared.capture_epoch.load(Ordering::Acquire) != session_epoch {
            continue;
        }
        shared.raw_rms.store(rms_level, Ordering::Relaxed);
        shared.raw_peak.store(peak_level, Ordering::Relaxed);
        for (index, value) in result.iter().enumerate() {
            shared.result[index].store(*value, Ordering::Relaxed);
        }
        // The explicit epoch guard also covers a rapid STOP→START while the
        // background worker was processing the previous session's window.
        if shared.active.load(Ordering::Acquire) &&
            shared.capture_epoch.load(Ordering::Acquire) == session_epoch {
            shared.result_seq.fetch_add(1, Ordering::Release);
        }
    }
}
/// Estimate actual input RMS and peak independently of pitch classification.
/// This is on the SCHED_OTHER worker; no log, float operations or extra
/// iteration is added to the Move SPI callback.
fn measure_input_levels(samples: &[f32; WINDOW]) -> (u8, u8) {
    let mut sum_squares = 0.0f32;
    let mut peak = 0.0f32;
    for sample in samples {
        let magnitude = sample.abs();
        if !magnitude.is_finite() { return (0, 0); }
        sum_squares += magnitude * magnitude;
        peak = peak.max(magnitude);
    }
    let rms = (sum_squares / WINDOW as f32).sqrt();
    fn dbfs_code(amplitude: f32) -> u8 {
        if !amplitude.is_finite() || amplitude <= 0.0 { return 0; }
        // One-dB reference ladder, rounded to the nearest integer dB.
        // No log10f: the ARM cross linker's recent libm exports a GLIBC_2.43
        // symbol, whereas the physical Move is on glibc 2.35.
        // Run only on the background analysis worker (~6 Hz).
        const HALF_DB_BELOW_FULL_SCALE: f32 = 0.94406086;
        const ONE_DB_RATIO: f32 = 0.89125094;
        let mut threshold = HALF_DB_BELOW_FULL_SCALE;
        for code in (1u8..=96u8).rev() {
            if amplitude >= threshold { return code; }
            threshold *= ONE_DB_RATIO;
        }
        1
    }
    (dbfs_code(rms), dbfs_code(peak))
}

const LOWEST_MIDI: usize = 48;
const HIGHEST_MIDI_EXCLUSIVE: usize = 84;
const PITCH_BINS: usize = HIGHEST_MIDI_EXCLUSIVE - LOWEST_MIDI;
// A loud fundamental can masquerade as the fifth (its third partial)
// or third (its fifth partial) at a *higher octave*. Suppress predicted
// overtone energy at those exact upper-note bins, then fold to 12 classes.
// Subtract from the raw spectrum (not the residual) to avoid cascades.
const THIRD_PARTIAL_SEMITONES: usize = 19;
const FIFTH_PARTIAL_SEMITONES: usize = 28;
const THIRD_PARTIAL_LEAKAGE: f32 = 0.28;
const FIFTH_PARTIAL_LEAKAGE: f32 = 0.20;

fn measured_pitch_spectrum(
    samples: &[f32; WINDOW], window: &[f32; WINDOW], sample_rate: f32,
) -> [f32; PITCH_BINS] {
    let mean_square: f32 = samples.iter().map(|sample| sample * sample).sum::<f32>() / WINDOW as f32;
    if !mean_square.is_finite() || mean_square < 0.000004 || sample_rate <= 0.0 {
        return [0.0; PITCH_BINS]; // -54 dBFS; preserve silence
    }
    let mut pitch_spectrum = [0.0f32; PITCH_BINS];
    for midi in LOWEST_MIDI..HIGHEST_MIDI_EXCLUSIVE {
        let frequency = 440.0 * 2.0f32.powf((midi as f32 - 69.0) / 12.0);
        let omega = std::f32::consts::TAU * frequency / sample_rate;
        let coefficient = 2.0 * omega.cos();
        let mut prior = 0.0f32;
        let mut older = 0.0f32;
        for (sample, weight) in samples.iter().zip(window.iter()) {
            let current = sample * weight + coefficient * prior - older;
            older = prior;
            prior = current;
        }
        let power = (prior * prior + older * older - coefficient * prior * older).max(0.0);
        pitch_spectrum[midi - LOWEST_MIDI] = power.sqrt();
    }
    pitch_spectrum
}

/// Twelve pitch classes from measured fundamentals. For every potential
/// harmonic we subtract only what a *lower, measured fundamental* could
/// explain. This is an evidence heuristic, not a polyphonic transcription.
/// It cannot resolve a quiet true fifth beneath a loud root's third partial.
fn project_pitch_classes(
    pitch_spectrum: &[f32; PITCH_BINS], suppress_harmonics: bool,
) -> [u8; BINS] {
    let mut chroma_peak = [0.0f32; BINS];
    for (index, raw_magnitude) in pitch_spectrum.iter().copied().enumerate() {
        let third_leakage = if suppress_harmonics && index >= THIRD_PARTIAL_SEMITONES {
            THIRD_PARTIAL_LEAKAGE * pitch_spectrum[index - THIRD_PARTIAL_SEMITONES]
        } else { 0.0 };
        let fifth_leakage = if suppress_harmonics && index >= FIFTH_PARTIAL_SEMITONES {
            FIFTH_PARTIAL_LEAKAGE * pitch_spectrum[index - FIFTH_PARTIAL_SEMITONES]
        } else { 0.0 };
        let remaining = (raw_magnitude - third_leakage - fifth_leakage).max(0.0);
        let pitch_class = (index + LOWEST_MIDI) % BINS;
        chroma_peak[pitch_class] = chroma_peak[pitch_class].max(remaining);
    }
    let maximum = chroma_peak.iter().copied().fold(0.0f32, f32::max);
    if maximum < 0.01 || !maximum.is_finite() { return [0; BINS]; }
    std::array::from_fn(|index| (127.0 * (chroma_peak[index] / maximum).clamp(0.0, 1.0)).round() as u8)
}

fn analyze(samples: &[f32; WINDOW], window: &[f32; WINDOW], sample_rate: f32) -> [u8; BINS] {
    let spectrum = measured_pitch_spectrum(samples, window, sample_rate);
    project_pitch_classes(&spectrum, true)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn test_window() -> [f32; WINDOW] {
        std::array::from_fn(|index| 0.5 - 0.5 * (std::f32::consts::TAU * index as f32 / (WINDOW-1) as f32).cos())
    }
    #[test] fn raw_input_level_has_independent_rms_and_peak() {
        assert_eq!(measure_input_levels(&[0.0; WINDOW]), (0, 0));
        let constant = [0.1; WINDOW];
        let (rms, peak) = measure_input_levels(&constant);
        assert!((75..=77).contains(&rms), "-20dBFS RMS should encode near 76");
        assert_eq!(rms, peak, "DC constant has equal RMS and peak");
        let impulse = std::array::from_fn(|index| if index == 0 { 0.8 } else { 0.0 });
        let (rms, peak) = measure_input_levels(&impulse);
        assert!(peak > rms + 30, "peak must distinguish a transient from its RMS");
        let noise = [0.001; WINDOW];
        assert!(measure_input_levels(&noise).0 > 0,
            "weak input remains measurable even when pitch detector gates it");
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
    /// Deterministic harmonic-rich instrument; no external test audio or
    /// library licensing requirement in the portable test suite.
    fn synth(notes: &[(i32, f32)]) -> [f32; WINDOW] {
        let sample_rate = 44100.0 / DECIMATION as f32;
        std::array::from_fn(|frame_index| {
            let elapsed = frame_index as f32 / sample_rate;
            notes.iter().map(|(midi, amplitude)| {
                let fundamental = 440.0 * 2.0f32.powf((*midi as f32 - 69.0) / 12.0);
                (1..=8).map(|partial| {
                    let frequency = fundamental * partial as f32;
                    if frequency >= sample_rate * 0.5 { return 0.0; }
                    amplitude * (std::f32::consts::TAU * frequency * elapsed
                        + 0.06 * partial as f32).sin() / partial as f32
                }).sum::<f32>()
            }).sum::<f32>() * 0.2
        })
    }
    #[test] fn a_complex_c_does_not_invent_a_g() {
        let audio = synth(&[(48, 1.0)]);
        let spectrum = measured_pitch_spectrum(&audio, &test_window(), 44100.0/8.0);
        let old = project_pitch_classes(&spectrum, false);
        let corrected = project_pitch_classes(&spectrum, true);
        assert!(old[7] >= 25, "old detector hears the third harmonic as G: {old:?}");
        assert!(corrected[7] <= 12, "harmonic residual suppresses false G: {corrected:?}");
        assert_eq!(corrected[0], 127, "C remains a strong fundamental");
    }
    #[test] fn major_and_minor_triads_retain_real_chord_tones() {
        for (notes, expected, unwanted) in [
            ([(48,1.0),(52,1.0),(55,1.0)], [0,4,7], [2,11]),
            ([(50,1.0),(53,1.0),(57,1.0)], [2,5,9], [0,4]),
        ] {
            let audio = synth(&notes);
            let result = analyze(&audio, &test_window(), 44100.0/8.0);
            for pitch_class in expected {
                assert!(result[pitch_class]>=75, "missed true chord tone {pitch_class}: {result:?}");
            }
            for pitch_class in unwanted {
                assert!(result[pitch_class]<=22, "retained overtone {pitch_class}: {result:?}");
            }
        }
    }
    #[test] fn present_g4_is_not_erased_under_c3() {
        let audio = synth(&[(48,1.0),(67,0.7)]);
        let corrected = analyze(&audio, &test_window(), 44100.0/8.0);
        assert!(corrected[7]>=32, "genuine G4 must remain visible: {corrected:?}");
        assert_eq!(corrected[0],127);
    }
    #[test] fn a_quiet_real_g4_survives_a_loud_c3() {
        let audio = synth(&[(48,1.0),(67,0.3)]);
        let corrected = analyze(&audio, &test_window(), 44100.0/8.0);
        assert!(corrected[7]>=25, "quiet but independent G4 must not be erased: {corrected:?}");
    }
    #[test] fn a_bright_c3_does_not_become_a_false_fifth() {
        let sample_rate = 44100.0 / DECIMATION as f32;
        let samples: [f32; WINDOW] = std::array::from_fn(|frame_index| {
            (1..=8).map(|partial| {
                let frequency=440.0*2.0f32.powf((48.0-69.0)/12.0)*partial as f32;
                if frequency>=sample_rate*0.5 { return 0.0; }
                (0.2 / (partial as f32).powf(0.7))
                    * (std::f32::consts::TAU*frequency*frame_index as f32/sample_rate
                       + 0.06*partial as f32).sin()
            }).sum::<f32>()
        });
        let corrected=analyze(&samples,&test_window(),sample_rate);
        assert!(corrected[7]<26,"bright C harmonic must not look like G: {corrected:?}");
    }
    #[test] #[ignore] fn chroma_cpu_comparison_benchmark() {
        use std::time::Instant;
        let audio = synth(&[(48,1.0),(52,1.0),(55,1.0)]);
        let window = test_window();
        let mut checksum = 0u64;
        let now = Instant::now();
        for _ in 0..128 {
            checksum += analyze(&audio, &window, 44100.0/8.0)[0] as u64;
        }
        let us_per_frame = now.elapsed().as_micros() as f64 / 128.0;
        println!("chroma_harmonic_sieve_us_per_frame={us_per_frame:.1} checksum={checksum}");
        let spectrum = measured_pitch_spectrum(&audio, &window, 44100.0/8.0);
        let now = Instant::now();
        for _ in 0..4096 {
            checksum += project_pitch_classes(&spectrum, false)[0] as u64;
        }
        let legacy_us = now.elapsed().as_micros() as f64 / 4096.0;
        let now = Instant::now();
        for _ in 0..4096 {
            checksum += project_pitch_classes(&spectrum, true)[0] as u64;
        }
        let residual_us = now.elapsed().as_micros() as f64 / 4096.0;
        println!("chroma_projection_legacy_us={legacy_us:.3} harmonic_us={residual_us:.3} checksum={checksum}");
    }

    #[test] fn status_appends_without_allocating_a_second_string() {
        let monitor = MicMonitor::new();
        let mut status = String::with_capacity(256);
        status.push_str("play=0");
        let original_ptr = status.as_ptr();
        monitor.append_status(&mut status);
        assert_eq!(status.as_ptr(), original_ptr,
            "mic append must use existing capacity, not allocate a second String");
        assert!(status.contains(" mca="));
        assert!(status.contains(" mcs=0"));
        assert!(status.contains(" mcv=0.000000000000000000000000"));
        assert!(status.ends_with(" mcg=0000"));
    }
    #[test] fn session_epoch_invalidates_old_worker_snapshots() {
        let monitor = MicMonitor::new();
        let previous_epoch = monitor.shared.capture_epoch.load(Ordering::Acquire);
        // A STOP from the disabled state is a no-op, not a false restart.
        monitor.set_listening(false);
        assert_eq!(monitor.shared.capture_epoch.load(Ordering::Acquire), previous_epoch);
        // A worker that sampled before an explicit session transition has a
        // different epoch, even if active toggles back on.
        monitor.shared.active.store(true, Ordering::Release);
        monitor.shared.capture_epoch.fetch_add(1, Ordering::AcqRel);
        assert_ne!(monitor.shared.capture_epoch.load(Ordering::Acquire), previous_epoch);
        monitor.set_listening(false);
        assert!(!monitor.listening());
    }
    #[test] fn disabled_has_no_capture() {
        let monitor=MicMonitor::new();
        monitor.capture(128);
        assert_eq!(monitor.shared.write_pos.load(Ordering::Relaxed),0);
    }
}
