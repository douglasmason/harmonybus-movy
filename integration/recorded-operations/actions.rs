//! Immutable note-relative operation outcomes; exact u64 words never visit JS.
pub const LANES:usize=37;
pub type Actions = [u64;LANES+1];
pub fn operation(word:u64)->u64{((word>>32)&31)|((word>>46)&32)}
pub fn parse(message:&str)->Option<(u8,Actions)>{
    let mut fields=message.split(',');
    if !matches!(fields.next()?,"ra1"|"ra2"|"ra3") {return None;}
    let pitch=fields.next()?.parse::<u8>().ok()?;
    if pitch>127{return None;}
    let mut actions=[0;LANES+1];
    let words=fields.map(|word|word.parse::<u64>().ok()).collect::<Option<Vec<_>>>()?;
    if words.len()!=17 && words.len()!=34 && words.len()!=LANES+1{return None;}
    if words.len()<LANES+1 {
        let old_lanes=words.len()-1;
        actions[..old_lanes].copy_from_slice(&words[..old_lanes]);
        actions[LANES]=words[old_lanes]|2048;
        for word in &mut actions[..old_lanes] {if *word>>63!=0&&operation(*word)==26 {*word=(*word&!((31u64<<32)|(1u64<<51)))|(31u64<<32);}}
    } else {actions.copy_from_slice(&words);}
    if actions[LANES]&!8063!=0 || (actions[LANES]>>2)&3>2 || (((actions[LANES]>>4)&7)|((actions[LANES]>>5)&8))>10{return None;}
    for word in &actions[..LANES] {
        if word>>63==0 && *word>u32::MAX as u64 {return None;}
        if word>>63!=0 && ((operation(*word)>34 || operation(*word)==20) || ((word>>37)&15)>8){return None;}
    }
    Some((pitch,actions))
}
pub fn payload(pitch:u8,actions:Actions)->String{
    let mut output=pitch.to_string();
    for word in actions {output.push(',');output.push_str(&word.to_string());}
    output
}
#[cfg(test)] mod tests{
    use super::*;
    #[test] fn preserves_64_bit_words_and_rejects_partial(){
        let actions=[1u64<<63;LANES+1];let mut valid=actions;valid[LANES]=2;
        assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),Some((60,valid)));
        valid[0]=(1u64<<63)|(19u64<<32)|12000;
        assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),Some((60,valid)));
        valid[0]=(1u64<<63)|(20u64<<32)|12000;
        assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),None);
        for operation in 21..=30u64 {
            valid[0]=(1u64<<63)|(operation<<32)|12000;
            for secondary in 0..=7u64 {for alias in 0..=2u64 {
                valid[LANES]=(secondary<<4)|(alias<<2)|3;
                assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),Some((60,valid)));
            }}
        }
        for invalid in [12,15,124,127,128] {
            valid[LANES]=invalid;
            assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),None);
        }
        for op in 31..=34u64 {
            let mut current=[0u64;LANES+1];
            current[36]=(1u64<<63)|((op&31)<<32)|((op&32)<<46)|1000;
            for role in 0..=10u64 {for flags in [0,512,4608,1024,2048] {
                current[LANES]=((role&7)<<4)|((role&8)<<5)|flags;
                assert_eq!(parse(&format!("ra3,{}",payload(60,current))),Some((60,current)));
            }}
        }
        let mut previous=vec![0u64;34];previous[18]=(1u64<<63)|(26u64<<32)|1000;previous[33]=3;
        let migrated=parse(&format!("ra2,60,{}",previous.iter().map(u64::to_string).collect::<Vec<_>>().join(","))).unwrap().1;
        assert_eq!(operation(migrated[18]),31);assert_eq!(migrated[LANES],2051);assert_eq!(migrated[33],0);
        let legacy=format!("ra1,60,{}",[0u64;17].iter().map(u64::to_string).collect::<Vec<_>>().join(","));
        assert_eq!(parse(&legacy),Some((60,{let mut expected=[0;LANES+1];expected[LANES]=2048;expected})));
        assert_eq!(parse("ra1,60,1,2"),None);
        assert_eq!(parse(&format!("ra1,{},3",payload(60,valid))),None);
    }
}

/// A clip-reader gesture is timed rather than attached to an input note.
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Interval {pub start:u32,pub length:u32,pub origin:u32,pub age:u64,pub lane:u8,pub operation:u8,pub amount:i32,pub grid:u32}
impl Interval {
    pub fn window(&self,position:u32,clip:usize,start:u32,span:u32)->Option<crate::hb_clip_performance::ReadWindow>{
        if position<self.start||position-self.start>=self.length{return None;}
        let mut performance=crate::hb_clip_performance::Performance::default();
        performance.slots[self.lane as usize]=Some(crate::hb_clip_performance::Gesture{
            operation:self.operation,amount:self.amount,grid:self.grid,origin:self.origin,clip,order:1,age:self.age+(position-self.start) as u64});
        performance.advance(clip,start,span,position)
    }
}
