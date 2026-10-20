//! Known source -> production stereo mixer -> final Movy callback-buffer oracle.
//! Does not observe the host mix, DAC, speakers, or MIDI-rendered native tracks.
use crate::mixer::mix_into_gains;
#[derive(Default)]
pub struct ToneCheck {
    pub state: u8, // 0 idle, 1 running, 2 completed, 3 cancelled/invalid
    frame: u64,
    rate: u32,
    phase: u32,
    checked: u64,
    bad: u64,
    max_error: u32,
    block_start: u64,
    block_frames: usize,
}
fn triangle(phase: u32) -> i16 {
    let position = (phase >> 16) as i32;
    let folded = if position < 32768 { position } else { 65535 - position };
    ((folded - 16384) / 4) as i16
}
impl ToneCheck {
    pub fn start(&mut self) { *self = Self { state: 1, ..Self::default() }; }
    pub fn cancel(&mut self) { if self.state == 1 { self.state = 3; } self.block_frames = 0; }
    fn step(&self) -> u32 { ((220u64 << 32) / u64::from(self.rate)) as u32 }
    /// Thirty seconds, with 10 ms crossfades. No allocations, I/O, or per-sample clocks.
    pub fn render(&mut self, output: &mut [i16], rate: u32) {
        self.block_frames = 0;
        if self.state != 1 { return; }
        if rate == 0 || output.len() % 2 != 0 || (self.rate != 0 && rate != self.rate) { self.cancel(); return; }
        self.rate = rate;
        let total = u64::from(rate) * 30;
        self.block_start = self.frame;
        self.block_frames = (output.len()/2).min((total-self.frame) as usize);
        let fade = u64::from((rate/100).max(1));
        let step = self.step();
        for (chunk_index, chunk) in output[..self.block_frames*2].chunks_mut(256).enumerate() {
            let mut source = [0i16; 256];
            let mut mixed = [0i16; 256];
            for frame in source[..chunk.len()].chunks_exact_mut(2) {
                let value = triangle(self.phase);
                frame[0] = value; frame[1] = -value;
                self.phase = self.phase.wrapping_add(step);
            }
            // Exercise the same gain/rounding/saturation core as tracks and sends.
            mix_into_gains(&mut mixed[..chunk.len()], &source[..chunk.len()], 0.5, 0.25);
            for (index, sample) in chunk.iter_mut().enumerate() {
                let absolute = self.block_start + (chunk_index*128+index/2) as u64;
                let weight = absolute.min(total-1-absolute).min(fade) as i64;
                *sample = ((i64::from(*sample)*(fade as i64-weight)+i64::from(mixed[index])*weight)/fade as i64) as i16;
            }
        }
        self.frame += self.block_frames as u64;
        if self.frame == total { self.state = 2; }
    }
    /// Called on the final PCM buffer before the callback returns. Reference phase derives
    /// from the absolute frame count, independently of the generator accumulator.
    pub fn verify(&mut self, output: &[i16]) {
        if self.block_frames == 0 || self.rate == 0 { return; }
        let fade = u64::from((self.rate/100).max(1));
        let total = u64::from(self.rate)*30;
        for (index, pair) in output.chunks_exact(2).take(self.block_frames).enumerate() {
            let absolute = self.block_start + index as u64;
            if absolute < fade || absolute >= total-fade { continue; }
            let position = ((absolute.wrapping_mul(u64::from(self.step())) & 0xffff_ffff) >> 16) as i32;
            let value = (if position < 32768 { position-16384 } else { 49151-position })/4;
            let expected = [value/2, -value/4];
            for channel in 0..2 {
                let error = (i32::from(pair[channel])-expected[channel]).unsigned_abs();
                self.checked += 1;
                if error > 0 { self.bad += 1; self.max_error = self.max_error.max(error); }
            }
        }
        self.block_frames = 0;
    }
    pub fn status(&self) -> String {
        format!(" tonecheck={},{},{},{},{}", self.state,self.checked,self.bad,self.max_error,self.frame)
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn variable_blocks_keep_stereo_phase_and_complete_without_set_or_notes() {
        for rate in [44100,48000] {
            let mut probe = ToneCheck::default(); probe.start();
            for count in [64,128,17,512].into_iter().cycle().take(20000) {
                let mut audio = vec![1234; count*2];
                probe.render(&mut audio, rate); probe.verify(&audio);
                if probe.state == 2 { break; }
            }
            assert_eq!(probe.state,2); assert!(probe.checked>200000); assert_eq!(probe.bad,0);
            let mut untouched = [1234;256]; probe.render(&mut untouched,rate);
            assert_eq!(untouched,[1234;256]);
        }
    }
    #[test]
    fn oracle_detects_corruption_repetition_missing_samples_and_channel_swap() {
        for fault in 0..4 {
            let mut probe=ToneCheck::default();probe.start();
            let mut previous=[0i16;256];
            for block in 0..12 {
                let mut audio=[0i16;256];probe.render(&mut audio,44100);
                if block==10 {
                    match fault {
                        0 => audio[80]=i16::MAX,
                        1 => audio=previous,
                        2 => audio.fill(0),
                        _ => for pair in audio.chunks_exact_mut(2) { pair.swap(0,1); },
                    }
                }
                probe.verify(&audio);previous=audio;
            }
            assert!(probe.bad>0,"fault {fault}");
        }
    }
    #[test]
    fn cancel_and_rate_change_cannot_report_pass_or_keep_replacing_audio() {
        let mut probe=ToneCheck::default();probe.start();
        let mut audio=[1;256];probe.render(&mut audio,44100);probe.verify(&audio);
        probe.render(&mut audio,48000);assert_eq!(probe.state,3);
        audio.fill(7);probe.render(&mut audio,48000);assert_eq!(audio,[7;256]);
        probe.start();probe.cancel();assert_eq!(probe.state,3);
    }
}
