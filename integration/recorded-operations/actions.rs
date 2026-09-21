//! Immutable note-relative operation outcomes; exact u64 words never visit JS.
pub type Actions = [u64;17];
pub fn parse(message:&str)->Option<(u8,Actions)>{
    let mut fields=message.split(',');
    if fields.next()? != "ra1" {return None;}
    let pitch=fields.next()?.parse::<u8>().ok()?;
    if pitch>127{return None;}
    let mut actions=[0;17];
    for word in &mut actions {*word=fields.next()?.parse().ok()?;}
    if fields.next().is_some() || actions[16]>2{return None;}
    for word in &actions[..16] {
        if word>>63==0 && *word>u32::MAX as u64 {return None;}
        if word>>63!=0 && (((word>>32)&31)>18 || ((word>>37)&15)>8){return None;}
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
        let actions=[1u64<<63;17];let mut valid=actions;valid[16]=2;
        assert_eq!(parse(&format!("ra1,{}",payload(60,valid))),Some((60,valid)));
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
