//! Opt-in worker timing. Fixed-size observations; no callback I/O or allocation.
#[derive(Clone, Copy, Default, Debug)]
pub struct RoundTiming {
    pub parallel: bool,
    pub main_ns: u64,
    pub join_ns: u64,
    pub delay_ns: [u64; 2],
    pub work_ns: [u64; 2],
}

#[derive(Default)]
pub struct WorkerProfile {
    pub enabled: bool,
    pub serial: bool,
    pub aborted: bool,
    blocks: u64,
    serial_blocks: u64,
    rounds: u64,
    main_sum: u64,
    main_max: u64,
    join_sum: u64,
    join_max: u64,
    delay_max: [u64; 2],
    work_max: [u64; 2],
    consecutive_over: u32,
}
impl WorkerProfile {
    pub fn start(&mut self, serial: bool) {
        *self = Self { enabled: true, serial, ..Self::default() };
    }
    pub fn stop(&mut self) { self.enabled = false; self.serial = false; }
    pub fn round(&mut self, value: RoundTiming) {
        if !self.enabled { return; }
        self.rounds += u64::from(value.parallel);
        self.main_sum += value.main_ns;
        self.main_max = self.main_max.max(value.main_ns);
        self.join_sum += value.join_ns;
        self.join_max = self.join_max.max(value.join_ns);
        for lane in 0..2 {
            self.delay_max[lane] = self.delay_max[lane].max(value.delay_ns[lane]);
            self.work_max[lane] = self.work_max[lane].max(value.work_ns[lane]);
        }
    }
    /// Protect the temporary serial experiment; retain an explicit invalid flag.
    pub fn block(&mut self, elapsed_ns: u64, budget_ns: u64, serial_ns: u64) {
        if !self.enabled { return; }
        self.blocks += 1;
        if self.serial {
            self.serial_blocks += 1;
            self.main_sum += serial_ns;
            self.main_max = self.main_max.max(serial_ns);
            self.consecutive_over = if elapsed_ns > budget_ns { self.consecutive_over + 1 } else { 0 };
            if elapsed_ns > budget_ns.saturating_mul(2) || self.consecutive_over >= 2 {
                self.aborted = true; self.serial = false;
            }
        }
    }
    pub fn status(&self) -> String {
        format!(" workerprof={},{},{},{},{},{},{},{},{},{},{},{},{},{}",
            self.enabled as u8, self.serial as u8, self.aborted as u8,
            self.blocks, self.serial_blocks, self.rounds,
            self.main_sum / self.blocks.max(1) / 1000, self.main_max / 1000,
            self.join_sum / self.blocks.max(1) / 1000, self.join_max / 1000,
            self.delay_max[0]/1000, self.work_max[0]/1000,
            self.delay_max[1]/1000, self.work_max[1]/1000)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn serial_watchdog_restores_without_hiding_failure() {
        let mut profile = WorkerProfile::default();
        profile.start(true);
        profile.block(3000, 2900, 2000);
        assert!(profile.serial);
        profile.block(3000, 2900, 2000);
        assert!(!profile.serial); assert!(profile.aborted);
        profile.stop(); assert!(profile.aborted);
        profile.start(false); assert!(!profile.aborted); assert_eq!(profile.blocks, 0);
        profile.start(true); profile.block(6000,2900,4000);
        assert!(profile.aborted);
    }
    #[test]
    fn worker_peaks_and_wait_are_separate_and_disabled_is_noop() {
        let mut profile=WorkerProfile::default();
        let round=RoundTiming {parallel:true,main_ns:100000,join_ns:300000,delay_ns:[20000,40000],work_ns:[90000,200000]};
        profile.round(round); assert_eq!(profile.rounds,0);
        profile.start(false); profile.round(round); profile.block(500000,2902000,0);
        assert_eq!(profile.status()," workerprof=1,0,0,1,0,1,100,100,300,300,20,90,40,200");
    }
}
