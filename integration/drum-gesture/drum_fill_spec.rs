//! Shared drum fill pattern for clip edits and one-shot performance.
use crate::clip::{Clip,Note};
use crate::TICKS_PER_STEP;
#[derive(Clone,Copy,Debug)]
pub struct Spec {pub track:usize,pub pitch:u8,pub span:u32,pub grid:u32,pub velocity:u8}
impl Spec {
    pub fn parse(message:&str)->Option<Self>{
        let mut fields=message.split_whitespace();
        let spec=Self{track:fields.next()?.parse().ok()?,pitch:fields.next()?.parse().ok()?,span:fields.next()?.parse().ok()?,grid:fields.next()?.parse().ok()?,velocity:fields.next()?.parse().ok()?};
        (fields.next().is_none()&&spec.track<16&&spec.pitch<128&&(1..=127).contains(&spec.velocity)&&matches!(spec.span,96|192|384)&&matches!(spec.grid,24|48|96|192|384)).then_some(spec)
    }
    pub fn window(self,clip:&Clip)->(u32,u32){let end=clip.loop_end_ticks();(end.saturating_sub(self.span).max(clip.loop_start_ticks()),end)}
    pub fn note(self,tick:u32,end:u32)->Note{
        Note{tick,gate:(self.grid/2).min(12).min(end-tick).max(1),pitch:self.pitch,vel:self.velocity,step:(tick/TICKS_PER_STEP) as u16,suppress:false,fired:false,actions:None,input_key:None,rendered:false,pressure:Vec::new()}
    }
}
