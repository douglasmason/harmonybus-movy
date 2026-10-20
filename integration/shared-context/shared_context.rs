//! Sparse clip-owned contributions. State is evaluated on the circular clip
//! timeline; a wrap is never synthesized as an operation release.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct Value { pub on: bool, pub a: i32, pub b: i32, pub c: i32 }
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Event { pub tick: u32, pub kind: u8, pub value: Value }
pub const LIMIT: usize = 512;

pub fn parse(text: &str) -> Option<(usize,u8,Value)> {
    let mut fields=text.strip_prefix("sc1,")?.split(',');
    let track=fields.next()?.parse::<usize>().ok()?;
    let kind=fields.next()?.parse::<u8>().ok()?;
    let on=fields.next()?.parse::<u8>().ok()?;
    let value=Value {on:on==1,a:fields.next()?.parse().ok()?,b:fields.next()?.parse().ok()?,c:fields.next()?.parse().ok()?};
    if fields.next().is_some() || track>=16 || kind>=3 || on>1 {return None;}
    if value.on && match kind {0=>!valid_key(value),1=>!(1..21).contains(&value.a),_=>!(1..20).contains(&value.a)} {return None;}
    Some((track,kind,value))
}
pub fn record(events: &mut Vec<Event>, event: Event) {
    match events.binary_search_by_key(&(event.kind,event.tick),|old|(old.kind,old.tick)) {
        Ok(index)=>events[index]=event,
        Err(index) if events.len()<LIMIT=>events.insert(index,event),
        _=>{}
    }
}
/// Binary lookup on the circular timeline. Playback never walks the full
/// automation list every tick; insertion/editing keeps (kind,tick) sorted.
pub fn at(events: &[Event],kind: u8,position:u32,start:u32,length:u32)->Option<(Event,u32)> {
    if length==0 {return None;}
    let begin=events.partition_point(|event|(event.kind,event.tick)<(kind,start));
    let end=events.partition_point(|event|(event.kind,event.tick)<(kind,start.saturating_add(length)));
    let window=&events[begin..end];if window.is_empty(){return None;}
    let after=window.partition_point(|event|event.tick<=position);
    let event=window[if after==0 {window.len()-1}else{after-1}];
    Some((event,(position+length-event.tick)%length))
}
#[cfg(test)] mod tests {
    use super::*;
    #[test] fn held_across_wrap_and_mid_loop_start(){
        let on=Value{on:true,a:2,b:0,c:0};let off=Value::default();
        let events=[Event{tick:40,kind:1,value:off},Event{tick:350,kind:1,value:on}];
        assert_eq!(at(&events,1,0,0,384).unwrap().0.value,on);
        assert_eq!(at(&events,1,39,0,384).unwrap().0.value,on);
        assert_eq!(at(&events,1,40,0,384).unwrap().0.value,off);
        assert_eq!(at(&events,1,349,0,384).unwrap().0.value,off);
        assert_eq!(at(&events,1,350,0,384).unwrap().0.value,on);
        assert!(at(&events,0,0,0,384).is_none());
    }
    #[test] fn edits_replace_same_tick_without_growing(){
        let mut events=Vec::new();for scale in 1..20 {record(&mut events,Event{tick:10,kind:1,value:Value{on:true,a:scale,b:0,c:0}});}
        assert_eq!(events.len(),1);assert_eq!(events[0].value.a,19);
        assert!(parse("sc1,16,1,1,2,0,0").is_none());assert!(parse("sc1,0,0,1,12,4095,0").is_none());
    }
}

/// Bounded modulation history. Packed keys retain tonic, all twelve scale bits
/// and the blues flag. This fits below the existing recorded-note event payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct KeySequence {
    pub valid: bool, pub count: u8, pub depth: u8,
    pub origin: u32, pub current: u32, pub history: [u32;64],
}
impl Default for KeySequence {
    fn default()->Self {Self{valid:false,count:0,depth:0,origin:0,current:0,history:[0;64]}}
}
fn packed(root:i32,mask:i32,blues:i32)->u32 {(root|(mask<<4)|(blues<<16)) as u32}
impl KeySequence {
    pub fn apply(&mut self,event:Value)->Value {
        if !event.on {return event;}
        if !self.valid {
            let mask=(event.c>>13)&4095;
            self.origin=if mask!=0 {packed((event.c>>9)&15,mask,(event.c>>25)&1)} else {packed(event.a,event.b&4095,event.c&1)};
            self.current=self.origin;self.valid=true;
        }
        let before=self.current;let action=(event.c>>26)&3;
        if action==3||(action==1&&event.a>>5>0&&self.count as i32>=event.a>>5){
            self.current=self.origin;self.count=0;self.depth=0;
        }else if action==2 {
            if self.depth>0 {self.depth-=1;self.current=self.history[self.depth as usize];self.count=self.count.saturating_sub(1);}
        }else{
            if self.depth==64 {self.history.copy_within(1..64,0);self.depth-=1;}
            self.history[self.depth as usize]=self.current;self.depth+=1;self.count=self.count.saturating_add(1).min(64);
            if action==1 {
                let shift=((event.a&31)-12).rem_euclid(12) as u32;
                let root=((self.current&15)+shift)%12;let mask=(self.current>>4)&4095;
                self.current=root|((((mask<<shift)|(mask>>(12-shift)))&4095)<<4)|(self.current&65536);
            }else{self.current=packed(event.a,event.b&4095,event.c&1);}
        }
        Value{on:true,a:(self.current&15) as i32,b:(event.b&!4095)|((self.current>>4)&4095) as i32,
            // An absolute landing uses its recorded pre-change input frame,
            // even when a previous loop has already reached its destination.
            c:if action==0 {event.c} else {(event.c&510)|((self.current>>16)&1) as i32|(((before&15)<<9)|(((before>>4)&4095)<<13)|(((before>>16)&1)<<25)) as i32}}
    }
    pub fn wire(&self,track:u8)->String {
        use std::fmt::Write;
        let mut text=format!("{},{},{},{},{},{}",track,self.valid as u8,self.count,self.depth,self.origin,self.current);
        for key in &self.history[..self.depth as usize]{let _=write!(text,",{}",key);}
        text
    }
}

/// Only event crossings mutate the sequence. Ordinary ticks use two binary
/// bounds; key-event snapshots are compared only when the caller invalidates
/// its cached timeline (edit, Undo, clip switch or transport restart).
#[derive(Debug,Clone,Default)]
pub struct KeyPlayback {
    pub sequence:KeySequence,
    slot:Option<usize>,events:Vec<Event>,position:u32,master:u64,cycle:u32,
    pub value:Value,
}
impl KeyPlayback {
    pub fn reset(&mut self){*self=Self::default();}
    /// Reconstruct skipped loops only on attach/seek/edit. Repeated bounded
    /// states let even a far-away song position skip whole cycles at once.
    fn apply_cycles(&mut self,events:&[Event],cycles:u32){
        if cycles==0||events.is_empty(){return;}
        let mut seen=std::collections::HashMap::new();let mut completed=0;
        while completed<cycles {
            if let Some(previous)=seen.insert(self.sequence,completed){
                let period=completed-previous;
                if period>0 {let skip=(cycles-completed)/period;if skip>0{completed+=skip*period;continue;}}
            }
            for event in events {self.value=self.sequence.apply(event.value);}
            completed+=1;
        }
    }
    pub fn resolve(&mut self,events:&[Event],slot:usize,position:u32,start:u32,length:u32,master:u64,cycle:u32,invalidate:bool)->bool {
        let begin=events.partition_point(|event|(event.kind,event.tick)<(0,start));
        let end=events.partition_point(|event|(event.kind,event.tick)<(0,start.saturating_add(length)));
        let keys=&events[begin..end];
        let restart=self.slot!=Some(slot)||master<self.master||cycle<self.cycle||(invalidate&&self.events!=keys);
        let previous=self.value;let mut applied=false;
        if restart {
            self.reset();self.slot=Some(slot);self.events.extend_from_slice(keys);
            // A new sequence starts at its stored anchor, never at the final
            // event of an imaginary previous loop.
            if let Some(first)=keys.first(){
                let mask=(first.value.c>>13)&4095;
                if mask!=0 {self.value=Value{on:true,a:(first.value.c>>9)&15,b:mask,c:(first.value.c>>25)&1};}
            }
            self.apply_cycles(keys,cycle.saturating_sub(1));
            for event in keys.iter().take_while(|event|event.tick<=position){self.value=self.sequence.apply(event.value);applied=true;}
            // Old absolute-only clips retain their circular pre-first-event value.
            if cycle<=1&&!applied&&keys.iter().all(|event|event.value.c>>26==0){
                if let Some(last)=keys.last(){self.value=self.sequence.apply(last.value);applied=true;}
            }
        }else if master!=self.master||position!=self.position {
            if cycle>self.cycle||position<self.position {
                for event in keys[keys.partition_point(|event|event.tick<=self.position)..].iter(){self.value=self.sequence.apply(event.value);applied=true;}
                self.apply_cycles(keys,cycle.saturating_sub(self.cycle).saturating_sub(1));
                for event in keys.iter().take_while(|event|event.tick<=position){self.value=self.sequence.apply(event.value);applied=true;}
            }else{
                for event in keys[keys.partition_point(|event|event.tick<=self.position)..keys.partition_point(|event|event.tick<=position)].iter(){self.value=self.sequence.apply(event.value);applied=true;}
            }
        }
        self.position=position;self.master=master;self.cycle=cycle;
        restart||applied||previous!=self.value
    }
}

fn valid_key(value:Value)->bool {
    if !(1..=0xfffffff).contains(&value.b)||value.b&4095==0||!(0..=0xfffffff).contains(&value.c){return false;}
    let action=(value.c>>26)&3;
    if action>0&&(((value.c>>9)&15)>11||((value.c>>13)&4095)==0){return false;}
    match action {0=>(0..12).contains(&value.a),1=>value.a>=0&&(value.a&31)<=24&&(value.a>>5)<=64,_=>value.a==0}
}

#[cfg(test)] mod key_sequence_tests {
    use super::*;
    fn shift(semitones:i32,after:i32)->Value {Value{on:true,a:(semitones+12)|(after<<5),b:2741,c:(2741<<13)|(1<<26)}}
    #[test] fn signed_steps_restore_scale_and_return_after_last_section(){
        let mut state=KeySequence::default();
        for root in 1..=4 {assert_eq!(state.apply(shift(1,4)).a,root);}
        assert_eq!(state.apply(shift(1,4)).a,0);assert_eq!(state.depth,0);
        assert_eq!(state.apply(shift(-2,0)).a,10);
        let major=state.current;
        state.apply(Value{on:true,a:7,b:1453,c:(2741<<13)});
        assert_eq!(state.apply(Value{on:true,a:0,b:2741,c:(2741<<13)|(2<<26)}).a,10);
        assert_eq!(state.current,major);
        assert_eq!(state.apply(Value{on:true,a:0,b:2741,c:(2741<<13)|(3<<26)}).b&4095,2741);
    }
    #[test] fn distant_seek_skips_repeating_history(){
        let events=[Event{tick:0,kind:0,value:shift(1,0)}];let mut playback=KeyPlayback::default();
        playback.resolve(&events,0,0,0,384,384_000_000,1_000_001,true);
        assert_eq!(playback.value.a,1_000_001%12);assert_eq!(playback.sequence.depth,64);
    }
    #[test] fn absolute_landing_retains_input_frame_across_loops(){
        let landing=Value{on:true,a:2,b:2774|(2741<<16),c:126|(2741<<13)};
        let events=[Event{tick:10,kind:0,value:landing}];
        let mut playback=KeyPlayback::default();
        for tick in 0..100 {
            playback.resolve(&events,0,tick%40,0,40,tick as u64,tick/40+1,false);
            assert_eq!(playback.value,landing);
        }
    }
    #[test] fn bounded_history_and_input_validation(){
        let mut state=KeySequence::default();for _ in 0..1000{state.apply(shift(1,0));}
        assert_eq!(state.depth,64);assert_eq!(state.count,64);
        assert!(parse(&format!("sc1,0,0,1,{},2741,{}",13|(64<<5),(2741<<13)|(1<<26))).is_some());
        assert!(parse(&format!("sc1,0,0,1,{},2741,{}",25,(2741<<13)|(1<<26))).is_none());
        assert!(parse(&format!("sc1,0,0,1,13,2741,{}",1<<26)).is_none());
    }
    #[test] fn loop_events_advance_once_and_midloop_restart_uses_anchor(){
        let events=[Event{tick:10,kind:0,value:shift(1,0)},Event{tick:30,kind:0,value:shift(2,0)}];
        let mut playback=KeyPlayback::default();
        playback.resolve(&events,0,0,0,40,0,1,true);assert_eq!(playback.value.a,0);
        for tick in 1..=90 {playback.resolve(&events,0,tick%40,0,40,tick as u64,tick/40+1,false);}
        assert_eq!(playback.value.a,7);assert_eq!(playback.sequence.count,5);
        for _ in 0..100{assert!(!playback.resolve(&events,0,10,0,40,90,3,false));}
        playback.resolve(&events,0,20,0,40,0,1,true);assert_eq!(playback.value.a,1);
        playback.resolve(&events,1,35,0,40,100,1,true);assert_eq!(playback.value.a,3);
    }
}
