//! A spatial source for the existing follower recipe scheduler. No independent clock.
use crate::{clip::Note, follower_input::InputKey, generator::Config, TICKS_PER_STEP};
pub const TAIL_STEPS:i32=16;
pub const MAX_CONTACTS:usize=16;
pub const MAX_POINTS:usize=MAX_CONTACTS*(256+TAIL_STEPS as usize);
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Point {pub step:i32,pub x:u8,pub y:u8,pub pressure:u8}
impl Point {
    pub fn wire(self)->String {format!("{},{},{},{}",self.step,self.x,self.y,self.pressure)}
    pub fn parse(text:&str)->Option<Self> {
        let fields:Vec<i32>=text.split(',').map(str::parse).collect::<Result<_,_>>().ok()?;
        if fields.len()!=4||!(-TAIL_STEPS..256).contains(&fields[0])||fields[1..].iter().any(|value|!(0..=127).contains(value))||fields[3]==0{return None;}
        Some(Self{step:fields[0],x:fields[1] as u8,y:fields[2] as u8,pressure:fields[3] as u8})
    }
}
#[derive(Clone,Copy,Debug)]
pub struct Contact {pub id:u8,pub point:Point,pub refreshed:u64,pub frame:u64}
#[derive(Clone,Debug,Default)]
pub struct Runtime {
    pub contacts:Vec<Contact>,pub pending_touches:Vec<Contact>,pub points:Vec<Point>,pub field:bool,
    pub view:Vec<Point>,pub grains:Vec<Point>,pub last_sample:Option<u64>,pub overridden:Vec<u16>,pub pending:Vec<(u8,Point)>,
}
impl Runtime {
    pub fn touch(&mut self,id:u8,x:u8,y:u8,pressure:u8,tick:u64,frame:u64)->bool {
        if let Some(index)=self.contacts.iter().position(|contact|contact.id==id){
            if pressure==0 {self.contacts.remove(index);return true;}
            self.contacts[index]=Contact{id,point:Point{step:0,x,y,pressure},refreshed:tick,frame};
        }else if pressure>0 {
            if self.contacts.len()>=MAX_CONTACTS{return false;}
            self.contacts.push(Contact{id,point:Point{step:0,x,y,pressure},refreshed:tick,frame});
        }
        if pressure>0{
            self.field=true;
            let contact=Contact{id,point:Point{step:0,x,y,pressure},refreshed:tick,frame};
            if let Some(previous)=self.pending_touches.iter_mut().find(|previous|previous.id==id){*previous=contact;}
            else if self.pending_touches.len()<MAX_CONTACTS {self.pending_touches.push(contact);}
        } true
    }
    pub fn sample(&mut self,tick:u64) {
        let step=tick/TICKS_PER_STEP as u64;
        if self.last_sample==Some(step){return;}self.last_sample=Some(step);
        self.contacts.retain(|contact|tick.saturating_sub(contact.refreshed)<192);
        self.points.retain(|point|step.saturating_sub(point.step as u64)<TAIL_STEPS as u64);
        for contact in &self.contacts {self.points.push(Point{step:step as i32,..contact.point});}
        let available=MAX_CONTACTS.saturating_sub(self.contacts.len());
        for contact in self.pending_touches.iter().filter(|pending|!self.contacts.iter().any(|held|held.id==pending.id)).take(available){self.points.push(Point{step:step as i32,..contact.point});}
        self.pending_touches.clear();
    }
}
/// A seeded, bounded cloud in abstract C-major input space. HB projects it into
/// the actor's input key and resolves each attack against the current conductor.
pub fn notes(config:Config,step:u16,points:&[Point],field:bool)->Vec<Note> {grains(config,step,points,field).into_iter().map(|(note,_)|note).collect()}
pub fn grains(config:Config,step:u16,points:&[Point],field:bool)->Vec<(Note,Point)> {
    if config.end>0&&u32::from(step)*TICKS_PER_STEP>=config.end{return Vec::new();}
    let rate=[8,6,4,3,2,1][usize::from(config.cloud[0])*6/128];
    if step%rate!=0||config.complexity==0{return Vec::new();}
    let center=[Point{step:step as i32,x:64,y:64,pressure:127}];
    let sources=if field {points}else{&center};
    let mut candidates:Vec<_>=sources.iter().filter(|point|point.step<=step as i32&&step as i32-point.step<TAIL_STEPS).collect();
    // Overdubbing merges recent contacts with untouched clip history. Seeded
    // selection must depend on that history, never on the storage/merge order.
    candidates.sort_by_key(|point|(point.step,point.x,point.y,point.pressure));
    if candidates.is_empty(){return Vec::new();}
    let mut result=Vec::with_capacity(4);
    for voice in 0..if config.bass(){1}else{4} {
        let random=crate::humanize::Humanize::seed(config.seed as usize,voice,(step%256) as u32);
        if random%128>=config.complexity as u32 {continue;}
        let point=candidates[(random as usize/128)%candidates.len()];
        let age=step as i32-point.step;
        if (random>>16)%TAIL_STEPS as u32>=(TAIL_STEPS-age) as u32 {continue;}
        // Horizontal movement changes rhythmic probability; vertical movement
        // selects the register. Neither assumes per-note pan on shared MIDI.
        if (random>>8)%128>32+u32::from(point.x)*3/4 {continue;}
        let spread=i32::from(config.cloud[3])*14/127;
        let scatter=((random>>20)%29) as i32-14;
        let contour=(i32::from(config.cloud[4])-64)*((step%16) as i32-8)/128;
        let variation=scatter*i32::from(config.cloud[5])/127;
        let degree=((i32::from(point.y)-64)*14/127+(i32::from(config.cloud[2])-64)*21/64+variation*spread/14+contour).clamp(-28,28);
        let pitch=(if config.bass(){36}else{60})+degree.div_euclid(7)*12+[0,2,4,5,7,9,11][degree.rem_euclid(7) as usize];
        let pitch=pitch.clamp(0,127) as u8;
        if result.iter().any(|(note,_):&(Note,Point)|note.pitch==pitch){continue;}
        let velocity=((40+u32::from(config.intensity)*87/127)*u32::from(point.pressure)/127*(TAIL_STEPS-age) as u32/TAIL_STEPS as u32).clamp(1,127) as u8;
        result.push((Note{tick:u32::from(step)*TICKS_PER_STEP,step,gate:3+u32::from(config.cloud[1])*93/127,pitch,vel:velocity,input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false},Point{step:step as i32,x:point.x,y:(i32::from(point.y)+variation*spread/2+contour*8).clamp(0,127) as u8,pressure:velocity}));
    }
    result
}
