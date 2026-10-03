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
    if value.on && match kind {0=>!(0..12).contains(&value.a)||!(1..=0xfffffff).contains(&value.b)||value.b&4095==0||!(0..=0x3ffffff).contains(&value.c),1=>!(1..21).contains(&value.a),_=>!(1..20).contains(&value.a)} {return None;}
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
