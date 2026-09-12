//! Per-track generated MIDI, produced by one chain lane and drained after join.
use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize,Ordering};

const TRACKS:usize=16;
const CAPACITY:usize=128;
pub struct RecordQueue {
    messages:[UnsafeCell<[(u8,u8,u8);CAPACITY]>;TRACKS],
    lengths:[AtomicUsize;TRACKS],
}
// Each chain's MIDI FX has exactly one producer per block. The consumer runs
// only after all chain lanes join, so no reader races the producer.
unsafe impl Sync for RecordQueue {}
impl RecordQueue {
    const fn new()->Self {Self{
        messages:[const {UnsafeCell::new([(0,0,0);CAPACITY])};TRACKS],
        lengths:[const {AtomicUsize::new(0)};TRACKS],
    }}
    pub fn push(&self,track:usize,status:u8,pitch:u8,velocity:u8)->bool{
        if track>=TRACKS{return false;}
        let index=self.lengths[track].load(Ordering::Relaxed);
        if index>=CAPACITY{return false;}
        unsafe {(*self.messages[track].get())[index]=(status,pitch,velocity);}
        self.lengths[track].store(index+1,Ordering::Release);
        true
    }
    pub fn drain(&self,mut receive:impl FnMut(usize,u8,u8,u8)){
        for track in 0..TRACKS {
            let count=self.lengths[track].swap(0,Ordering::AcqRel);
            for index in 0..count {
                let (status,pitch,velocity)=unsafe{(*self.messages[track].get())[index]};
                receive(track,status,pitch,velocity);
            }
        }
    }
}
pub static QUEUE:RecordQueue=RecordQueue::new();

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn preserves_timed_on_off_and_track_order(){
        let queue=RecordQueue::new();
        assert!(queue.push(3,0x90,62,105));
        assert!(queue.push(3,0x80,62,0));
        assert!(queue.push(1,0x90,60,90));
        let mut notes=Vec::new();
        queue.drain(|track,status,pitch,velocity|notes.push((track,status,pitch,velocity)));
        assert_eq!(notes,vec![(1,0x90,60,90),(3,0x90,62,105),(3,0x80,62,0)]);
        queue.drain(|_,_,_,_|panic!("already consumed"));
    }
}
