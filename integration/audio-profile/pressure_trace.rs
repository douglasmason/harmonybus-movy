//! Bounded diagnostic; no allocations, file I/O or blocking locks in event paths.
use std::sync::{Mutex, atomic::{AtomicBool, AtomicU64, Ordering}};
use std::time::Instant;
const CAP: usize = 96;
const END_MS: u64 = 85_000;
static ACTIVE: AtomicBool = AtomicBool::new(false);
static LOST: AtomicU64 = AtomicU64::new(0);
static TRACE: Mutex<Trace> = Mutex::new(Trace::new());
#[derive(Clone, Copy)]
struct Event { ms: u64, kind: u8, channel: u8, pitch: u8, value: u8 }
const EMPTY: Event = Event { ms: 0, kind: 0, channel: 0, pitch: 0, value: 0 };
struct Trace {
    start: Option<Instant>, counts: [[u64; 8]; 4], events: [Event; CAP], total: usize,
    previous_block: Option<u64>, gap_us: [u64; 4], held: [bool; 32],
    duplicate_on: u64, unmatched_off: u64,
}
impl Trace {
    const fn new() -> Self { Self { start: None, counts: [[0;8];4], events: [EMPTY;CAP], total: 0,
        previous_block: None, gap_us: [0;4], held: [false;32], duplicate_on: 0, unmatched_off: 0 } }
    fn phase(ms: u64) -> usize { ((ms/20_000) as usize).min(3) }
    fn event(&mut self, ms: u64, kind: u8, channel: u8, pitch: u8, value: u8) {
        self.counts[Self::phase(ms)][kind as usize] += 1;
        // Pressure is counted, not stored per report, so it cannot evict note edges.
        if kind==4 || kind==5 { return; }
        if kind<2 && (68..100).contains(&pitch) {
            let held=&mut self.held[(pitch-68) as usize];
            if kind==0 { if *held { self.duplicate_on+=1; } *held=true; }
            else { if !*held { self.unmatched_off+=1; } *held=false; }
        }
        self.events[self.total%CAP]=Event {ms,kind,channel,pitch,value}; self.total+=1;
    }
}
pub fn start() {
    if let Ok(mut trace)=TRACE.try_lock() {
        *trace=Trace::new(); trace.start=Some(Instant::now()); LOST.store(0,Ordering::Relaxed);
        ACTIVE.store(true,Ordering::Release);
    }
}
pub fn stop() { ACTIVE.store(false,Ordering::Release); }
fn access(default: bool, action: impl FnOnce(&mut Trace,u64)->bool) -> bool {
    if !ACTIVE.load(Ordering::Acquire) { return default; }
    let Ok(mut trace)=TRACE.try_lock() else { LOST.fetch_add(1,Ordering::Relaxed); return default; };
    let Some(start)=trace.start else { return default; };
    let micros=start.elapsed().as_micros() as u64;
    if micros/1000>=END_MS { stop(); return default; }
    action(&mut trace,micros)
}
pub fn note(kind_on: u8, channel: u8, status: u8, pitch: u8, value: u8) {
    let status=status&0xf0;
    if status!=0x80 && status!=0x90 { return; }
    let kind=kind_on+u8::from(status==0x80 || value==0);
    access(true,|trace,us|{trace.event(us/1000,kind,channel,pitch,value);true});
}
pub fn pressure(channel: u8, pitch: u8, value: u8) -> bool {
    access(true,|trace,us|{
        let ms=us/1000; trace.event(ms,4,channel,pitch,value);
        let forward=Trace::phase(ms)!=1;
        if forward { trace.event(ms,5,channel,pitch,value); }
        forward
    })
}
pub fn block() {
    access(true,|trace,us|{
        let phase=Trace::phase(us/1000);
        if let Some(previous)=trace.previous_block { trace.gap_us[phase]=trace.gap_us[phase].max(us-previous); }
        trace.previous_block=Some(us);true
    });
}
pub fn status() -> String {
    use std::fmt::Write;
    let Ok(trace)=TRACE.try_lock() else { return " pressuretrace=busy".into(); };
    let mut text=format!(" pressuretrace={},{},{},{},{}",ACTIVE.load(Ordering::Acquire) as u8,
        LOST.load(Ordering::Relaxed),trace.total.saturating_sub(CAP),trace.duplicate_on,trace.unmatched_off);
    for phase in 0..4 {
        let _=write!(text,";{}",trace.gap_us[phase]);
        for count in trace.counts[phase] { let _=write!(text,",{}",count); }
    }
    // Export the event ring only once collection has stopped.
    if !ACTIVE.load(Ordering::Acquire) {
        for index in trace.total.saturating_sub(CAP)..trace.total {
            let event=trace.events[index%CAP];
            let _=write!(text,";{},{},{},{},{}",event.ms,event.kind,event.channel,event.pitch,event.value);
        }
    }
    text
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn boundaries_edges_and_bounded_storage() {
        assert_eq!([0,19999,20000,39999,40000,59999,60000,84999].map(Trace::phase),[0,0,1,1,2,2,3,3]);
        let mut trace=Trace::new();
        for strike in 0..10000 {
            trace.event(strike,0,0,68,100);
            trace.event(strike,4,0,68,0);
            trace.event(strike,1,0,68,0);
        }
        assert_eq!(trace.total,20000);assert_eq!(trace.duplicate_on,0);assert_eq!(trace.unmatched_off,0);
        assert!(!trace.held[0]);assert_eq!(trace.counts[0][4],10000);
        trace.event(0,1,0,68,0);assert_eq!(trace.unmatched_off,1);
    }
    #[test] fn bypass_restores_on_cancel_and_deadline_without_ui() {
        start();assert!(pressure(0,60,80));
        TRACE.lock().unwrap().start=Some(Instant::now()-std::time::Duration::from_secs(25));
        assert!(!pressure(0,60,0));
        stop();assert!(pressure(0,60,80));
        start();
        TRACE.lock().unwrap().start=Some(Instant::now()-std::time::Duration::from_secs(86));
        assert!(pressure(0,60,80));assert!(!ACTIVE.load(Ordering::Acquire));
    }
}
