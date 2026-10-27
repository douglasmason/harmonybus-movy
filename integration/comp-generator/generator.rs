//! A bounded source of mapped comp attacks, consumed by the ordinary scheduler.
use crate::{clip::{Clip,Note},follower_input::InputKey,TICKS_PER_STEP};
pub const LABELS:[&str;3]=["generator:complexity","generator:intensity","generator:style"];
pub fn internal(label:&str)->bool {LABELS.contains(&label)}
pub fn lane_value(clip:&Clip,lane:u8,step:u16,base:u8)->u8 {
    clip.locks.iter().filter(|lock|lock.lane==lane&&lock.step>=clip.loop_start_steps&&lock.step<=step)
        .max_by_key(|lock|lock.step).map_or(base,|lock|lock.val)
}
pub struct Style {pub name:&'static str,pub catalog:usize,pub optional:&'static [(u16,u32,u8,u8)]}
include!("generator_styles.rs");
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Config {pub style:u8,pub complexity:u8,pub intensity:u8,pub seed:u16,pub end:u32}
impl Default for Config {fn default()->Self {Self {style:0,complexity:32,intensity:64,seed:1,end:0}}}
impl Config {
    pub fn parse(text:&str)->Option<Self> {
        let fields:Vec<u32>=text.split_whitespace().map(str::parse).collect::<Result<_,_>>().ok()?;
        if !matches!(fields.len(),4|5)||fields[0]>=STYLES.len() as u32||fields[1]>127||fields[2]>127||!(1..=65535).contains(&fields[3])||fields.get(4).is_some_and(|end|*end>6144) {return None;}
        Some(Self {style:fields[0] as u8,complexity:fields[1] as u8,intensity:fields[2] as u8,seed:fields[3] as u16,end:*fields.get(4).unwrap_or(&0)})
    }
    pub fn wire(self)->String {format!("{} {} {} {} {}",self.style,self.complexity,self.intensity,self.seed,self.end)}
    pub fn values(self)->[u8;3] {[self.complexity,self.intensity,self.style]}
    /// A fixed threshold per authored optional attack. More complexity retains
    /// earlier details; repainting, block size and transport cycles do not reroll.
    pub fn note(self,step:u16)->Option<Note> {
        if self.end>0&&step as u32*TICKS_PER_STEP>=self.end {return None;}
        let style=STYLES.get(self.style as usize)?;
        let local=step%16;
        let essential=crate::part_catalog::comp_source_notes(style.catalog).iter().find(|note|note.0==local);
        let (gate,pitch,velocity)=if let Some(&(_,gate,pitch,velocity))=essential {(gate,pitch,velocity)} else {
            let &(_,gate,velocity,threshold)=style.optional.iter().find(|note|note.0==local)?;
            let random=crate::humanize::Humanize::seed(self.style as usize,self.seed as usize,(step%64) as u32);
            let threshold=(threshold as i16+(random%17) as i16-8).clamp(1,127) as u8;
            if self.complexity<threshold {return None;}
            (gate,60,velocity)
        };
        let velocity=((velocity as u32*(64+self.intensity as u32)+64)/128).clamp(1,127) as u8;
        Some(Note {tick:step as u32*TICKS_PER_STEP,step,gate,pitch,vel:velocity,
            input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false})
    }
    /// The same named locks drive replay and Bake. Generator clips have no
    /// note-triggered resets: each control holds until its next lock.
    pub fn at(self,clip:&Clip,labels:&[String;8],step:u16)->Self {
        let mut result=self;
        for (field,label) in LABELS.iter().enumerate() {
            let Some(lane)=labels.iter().position(|name|name==label) else {continue;};
            let boundary=if field==2 {step/16*16} else {step};
            let value=lane_value(clip,lane as u8,boundary,result.values()[field]);
            match field {0=>result.complexity=value,1=>result.intensity=value,2=>result.style=value.min(STYLES.len() as u8-1),_=>{}}
        }
        result
    }
}
#[derive(Clone,Copy,Debug)]
pub struct Explore {pub track:usize,pub desired:Config,pub current:Config,pub take:Option<usize>}
