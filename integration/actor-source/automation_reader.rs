//! Fractional readers over existing locks and note-step base resets.
//! No new sequence store, clock, allocations or output owner.
use crate::clip::Clip;
use crate::source_route::ClipRef;
use crate::TICKS_PER_STEP;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Segment { pub start:f64, pub end:f64, pub first:u8, pub last:u8 }
impl Segment {
    pub fn contains(self,position:f64)->bool {position>=self.start && position<self.end}
    pub fn sample(self,position:f64)->u8 {
        let fraction=((position-self.start)/(self.end-self.start).max(1.0e-12)).clamp(0.0,1.0);
        (f64::from(self.first)+(f64::from(self.last)-f64::from(self.first))*fraction).round().clamp(0.0,127.0) as u8
    }
}

/// Locks win over base resets on the same step, matching Clip::effective_at.
/// Sparse points connect across the selected loop boundary, ignoring outsiders.
pub fn segment(clip:&Clip,lane:u8,base:u8,position:f64)->Segment {
    segment_mode(clip,lane,base,position,false)
}
fn segment_mode(clip:&Clip,lane:u8,base:u8,position:f64,clamp:bool)->Segment {
    let length=f64::from(clip.length_ticks().max(1));
    let start=clip.loop_start_steps;let end=start.saturating_add(clip.length_steps);
    let mut previous:Option<(f64,u8)>=None;let mut next:Option<(f64,u8)>=None;
    let mut offer=|step:u16,value:u8| {
        if step<start || step>=end {return;}
        let tick=f64::from(u32::from(step-start)*TICKS_PER_STEP);
        let left=if tick<=position {tick} else {tick-length};
        let right=if tick>position {tick} else {tick+length};
        if (!clamp||tick<=position)&&previous.is_none_or(|point|left>=point.0) {previous=Some((left,value));}
        if (!clamp||tick>position)&&next.is_none_or(|point|right<=point.0) {next=Some((right,value));}
    };
    for note in clip.notes.iter().take(crate::clip::MAX_NOTES) {offer(note.step,base);}
    for lock in clip.locks.iter().take(crate::clip::MAX_LOCKS) {if lock.lane==lane {offer(lock.step,lock.val);}}
    match (previous,next) {
        (Some(first),Some(last))=>Segment{start:first.0,end:last.0,first:first.1,last:last.1},
        (Some(first),None)=>Segment{start:first.0,end:length,first:first.1,last:first.1},
        (None,Some(last))=>Segment{start:0.0,end:last.0,first:last.1,last:last.1},
        _=>Segment{start:0.0,end:length,first:base,last:base},
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Key { source:ClipRef,lane:u8,base:u8,start:u16,length:u16,notes:usize,locks:usize,clamp:bool }
#[derive(Clone, Copy, Debug)]
pub struct Cache {
    key:Key,
    pub segment:Segment,
    #[cfg(test)] pub rebuilds:usize,
}
pub fn read(cache:&mut Option<Cache>,clip:&Clip,source:ClipRef,lane:u8,base:u8,position:f64,refresh:bool)->u8 {
    read_mode(cache,clip,source,lane,base,position,refresh,false)
}
pub fn read_mode(cache:&mut Option<Cache>,clip:&Clip,source:ClipRef,lane:u8,base:u8,position:f64,refresh:bool,clamp:bool)->u8 {
    if !position.is_finite() || !clip.exists() {return base;}
    let key=Key{source,lane,base,start:clip.loop_start_steps,length:clip.length_steps,notes:clip.notes.len(),locks:clip.locks.len(),clamp};
    let relative=position-f64::from(clip.loop_start_ticks());
    let relative=if clamp {relative.clamp(0.0,f64::from(clip.length_ticks().saturating_sub(TICKS_PER_STEP)))} else {relative.rem_euclid(f64::from(clip.length_ticks().max(1)))};
    if refresh || cache.as_ref().is_none_or(|cached|cached.key!=key || !cached.segment.contains(relative)) {
        #[cfg(test)] let rebuilds=cache.as_ref().map_or(1,|cached|cached.rebuilds+1);
        *cache=Some(Cache{key,segment:segment_mode(clip,lane,base,relative,clamp),#[cfg(test)] rebuilds});
    }
    cache.as_ref().unwrap().segment.sample(relative)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn clamped_sparse_reader_holds_endpoints_and_does_not_reuse_wrap_cache() {
        let mut clip=Clip::default();clip.set_loop(16,16);clip.set_lock(0,20,20);clip.set_lock(0,24,100);
        let source=ClipRef{track:0,slot:0};let mut cache=None;
        assert_eq!(read_mode(&mut cache,&clip,source,0,5,384.0,false,true),20);
        assert_eq!(read_mode(&mut cache,&clip,source,0,5,528.0,false,true),60);
        assert_eq!(read_mode(&mut cache,&clip,source,0,5,744.0,false,true),100);
        assert_ne!(read(&mut cache,&clip,source,0,5,744.0,false),100);
        assert_eq!(read_mode(&mut cache,&clip,source,0,5,744.0,false,true),100);
    }
    #[test]
    fn sparse_curve_uses_fractional_position_wrap_and_note_resets() {
        let mut clip=Clip::default();clip.set_loop(0,16);
        clip.set_lock(0,0,0);clip.set_lock(0,8,100);
        let mut cache=None;let source=ClipRef{track:0,slot:0};
        assert_eq!(read(&mut cache,&clip,source,0,20,96.0,false),50);
        assert_eq!(read(&mut cache,&clip,source,0,20,97.5,false),51);
        assert_eq!(cache.unwrap().rebuilds,1);
        assert_eq!(read(&mut cache,&clip,source,0,20,288.0,false),50);
        assert_eq!(read(&mut cache,&clip,source,0,20,0.0,false),0);
        clip.add_note_raw(4,96,24,60,100);
        assert_eq!(read(&mut cache,&clip,source,0,20,96.0,false),20);
        assert_eq!(read(&mut cache,&clip,source,0,20,144.0,false),60);
        clip.set_lock(0,4,80);
        assert_eq!(read(&mut cache,&clip,source,0,20,96.0,false),80);
    }
    #[test]
    fn trimmed_single_empty_and_reverse_reads_stay_in_window() {
        let mut clip=Clip::default();clip.set_loop(16,16);
        clip.set_lock(0,0,127);clip.set_lock(0,16,30);
        let mut cache=None;let source=ClipRef{track:0,slot:0};
        for tick in [384.0,500.0,767.0,600.0,384.0] {assert_eq!(read(&mut cache,&clip,source,0,11,tick,false),30);}
        clip.set_lock(0,24,90);
        assert_eq!(read(&mut cache,&clip,source,0,11,480.0,false),60);
        assert_eq!(read(&mut cache,&clip,source,0,11,432.0,false),45);
        clip.locks.clear();assert_eq!(read(&mut cache,&clip,source,0,11,432.0,false),11);
        assert_eq!(read(&mut cache,&clip,source,0,11,f64::NAN,false),11);
        clip.length_steps=0;assert_eq!(read(&mut cache,&clip,source,0,11,0.0,false),11);
    }
}
