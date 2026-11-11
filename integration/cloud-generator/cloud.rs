//! A spatial source for the existing follower recipe scheduler. No independent clock.
use crate::{clip::Note, follower_input::InputKey, generator::Config, TICKS_PER_STEP};
pub const TAIL_STEPS:i32=16;
pub const MAX_CONTACTS:usize=16;
pub const MAX_STROKE_VERTICES:usize=8;
pub const MAX_POINTS:usize=MAX_CONTACTS*(256+TAIL_STEPS as usize);
pub const XY_MAX:u16=16383;
pub const XY_LEGACY_SCALE:u16=129;
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Activity {Probability,Rate}
impl Activity {
    pub fn parse(value:u32)->Option<Self> {match value {0=>Some(Self::Probability),1=>Some(Self::Rate),_=>None}}
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Point {pub step:i32,pub x:u16,pub y:u16,pub pressure:u8,pub activity:Activity}
impl Point {
    pub fn legacy(step:i32,x:u8,y:u8,pressure:u8,activity:Activity)->Self {
        Self{step,x:u16::from(x)*XY_LEGACY_SCALE,y:u16::from(y)*XY_LEGACY_SCALE,pressure,activity}
    }
    pub fn legacy_xy(self)->bool {self.x%XY_LEGACY_SCALE==0&&self.y%XY_LEGACY_SCALE==0}
    pub fn wire(self)->String {
        if self.legacy_xy() {format!("{},{},{},{}{}",self.step,self.x/XY_LEGACY_SCALE,self.y/XY_LEGACY_SCALE,self.pressure,if self.activity==Activity::Rate {",1"}else{""})}
        else {format!("{},{},{},{},{},14",self.step,self.x,self.y,self.pressure,self.activity as u8)}
    }
    pub fn parse(text:&str)->Option<Self> {
        let fields:Vec<i32>=text.split(',').map(str::parse).collect::<Result<_,_>>().ok()?;
        if !matches!(fields.len(),4|5|6){return None;}
        let precise=fields.len()==6;
        if precise&&fields[5]!=14{return None;}
        let maximum=if precise {i32::from(XY_MAX)}else{127};
        if !(-TAIL_STEPS..256).contains(&fields[0])||fields[1..3].iter().any(|value|!(0..=maximum).contains(value))||!(1..=127).contains(&fields[3]){return None;}
        let scale=if precise {1}else{XY_LEGACY_SCALE};
        Some(Self{step:fields[0],x:fields[1] as u16*scale,y:fields[2] as u16*scale,pressure:fields[3] as u8,activity:Activity::parse(*fields.get(4).unwrap_or(&0) as u32)?})
    }
}
#[derive(Clone,Copy,Debug)]
pub struct Contact {pub id:u8,pub point:Point,pub refreshed:u64,pub frame:u64,pub precise:bool}
/// A short polyline between clock samples, with no per-move heap allocation.
#[derive(Clone,Debug)]
pub struct Stroke {
    pub contact:Contact,
    vertices:[Point;MAX_STROKE_VERTICES],
    count:usize,
    open:bool,
}
impl Stroke {
    fn new(contact:Contact,previous:Option<Point>)->Self {
        let mut stroke=Self{contact,vertices:[previous.unwrap_or(contact.point);MAX_STROKE_VERTICES],count:1,open:true};
        stroke.push(contact);
        stroke
    }
    fn push(&mut self,contact:Contact) {
        self.contact=contact;
        let last=&mut self.vertices[self.count-1];
        if (last.x,last.y)==(contact.point.x,contact.point.y) {*last=contact.point;return;}
        if self.count==MAX_STROKE_VERTICES {
            // Thin older vertices while preserving both ends and the latest turn.
            self.vertices[1]=self.vertices[2];self.vertices[2]=self.vertices[4];
            self.vertices[3]=self.vertices[6];self.vertices[4]=self.vertices[7];self.count=5;
        }
        self.vertices[self.count]=contact.point;self.count+=1;
    }
    fn distance(start:Point,end:Point)->u32 {u32::from(start.x.abs_diff(end.x).max(start.y.abs_diff(end.y)))}
    fn interior(&self,index:usize)->Option<Point> {
        let unit=if self.contact.precise {1}else{u32::from(XY_LEGACY_SCALE)};
        let distance:u32=self.vertices[..self.count].windows(2).map(|pair|Self::distance(pair[0],pair[1])/unit).sum();
        let count=(distance as usize/(16*usize::from(XY_LEGACY_SCALE)/unit as usize)).min(MAX_STROKE_VERTICES);
        if index>=count {return None;}
        let mut remaining=distance*index as u32/count as u32;
        for pair in self.vertices[..self.count].windows(2) {
            let length=Self::distance(pair[0],pair[1])/unit;
            if remaining<=length&&length>0 {
                let interpolate=|start:u16,end:u16| (i64::from(start)+(i64::from(end)-i64::from(start))*i64::from(remaining)/i64::from(length)) as u16;
                let coordinate=|start:u16,end:u16|interpolate(start/unit as u16,end/unit as u16)*unit as u16;
                return Some(Point{step:0,x:coordinate(pair[0].x,pair[1].x),y:coordinate(pair[0].y,pair[1].y),pressure:interpolate(u16::from(pair[0].pressure),u16::from(pair[1].pressure)) as u8,activity:self.contact.point.activity});
            }
            remaining=remaining.saturating_sub(length);
        }
        None
    }
}
#[derive(Clone,Debug,Default)]
pub struct Runtime {
    pub contacts:Vec<Contact>,pub pending_touches:Vec<Stroke>,pub points:Vec<Point>,pub field:bool,
    pub view:Vec<Point>,pub grains:Vec<Point>,pub last_sample:Option<u64>,pub overridden:Vec<u16>,pub pending:Vec<(u8,Point)>,
    /// Reused step candidates; never persisted or exposed as display ordering.
    pub(crate) work:Vec<Point>,
    pub(crate) held:Vec<Point>,pub(crate) held_cursor:usize,
}
impl Runtime {
    pub fn holding(&self)->bool {!self.held.is_empty()}
    /// Freeze a bounded set of emitters, without advancing the musical sampler.
    /// Pending short strokes count even when captured between clock ticks.
    pub fn hold(&mut self,enabled:bool,tick:u64)->bool {
        if !enabled {self.held.clear();self.held_cursor=0;return true;}
        if self.holding(){return true;}
        let step=(tick/TICKS_PER_STEP as u64) as i32;
        let mut fresh=Self{contacts:self.contacts.clone(),pending_touches:self.pending_touches.clone(),..Default::default()};
        fresh.sample(tick);
        let candidates:Vec<_>=self.points.iter().filter(|point|point.step<=step&&step-point.step<TAIL_STEPS).chain(fresh.points.iter()).copied().collect();
        let count=candidates.len().min(MAX_CONTACTS);
        if count==0{return false;}
        self.held=(0..count).map(|index|candidates[if count==1 {0}else{index*(candidates.len()-1)/(count-1)}]).collect();
        self.held_cursor=0;self.field=true;true
    }
    pub fn touch(&mut self,id:u8,x:u8,y:u8,pressure:u8,activity:Activity,tick:u64,frame:u64)->bool {
        self.touch_xy(id,u16::from(x)*XY_LEGACY_SCALE,u16::from(y)*XY_LEGACY_SCALE,pressure,activity,tick,frame,false)
    }
    pub fn touch_xy(&mut self,id:u8,x:u16,y:u16,pressure:u8,activity:Activity,tick:u64,frame:u64,precise:bool)->bool {
        if x>XY_MAX||y>XY_MAX||pressure>127{return false;}
        let held=self.contacts.iter().position(|contact|contact.id==id);
        if pressure==0 {
            if let Some(index)=held {self.contacts.remove(index);}
            for stroke in &mut self.pending_touches {if stroke.contact.id==id {stroke.open=false;}}
            return true;
        }
        if held.is_none()&&self.contacts.len()>=MAX_CONTACTS {return false;}
        let previous=held.map(|index|self.contacts[index]).filter(|contact|contact.precise==precise&&contact.point.activity==activity&&tick.saturating_sub(contact.refreshed)<192);
        if previous.is_none() {for stroke in &mut self.pending_touches {if stroke.contact.id==id {stroke.open=false;}}}
        let contact=Contact{id,point:Point{step:0,x,y,pressure,activity},refreshed:tick,frame,precise};
        if let Some(index)=held {self.contacts[index]=contact;}else{self.contacts.push(contact);}
        self.field=true;
        if let Some(stroke)=self.pending_touches.iter_mut().find(|stroke|stroke.open&&stroke.contact.id==id) {stroke.push(contact);}
        else if self.pending_touches.len()<MAX_CONTACTS {self.pending_touches.push(Stroke::new(contact,previous.map(|contact|contact.point)));}
        true
    }
    pub fn sample(&mut self,tick:u64) {
        let step=tick/TICKS_PER_STEP as u64;
        if self.last_sample==Some(step){return;}self.last_sample=Some(step);
        self.contacts.retain(|contact|tick.saturating_sub(contact.refreshed)<192);
        self.pending_touches.retain(|stroke|tick.saturating_sub(stroke.contact.refreshed)<192);
        self.points.retain(|point|step.saturating_sub(point.step as u64)<TAIL_STEPS as u64);
        let before=self.points.len();let mut selected=[false;MAX_CONTACTS];
        for contact in &self.contacts {self.points.push(Point{step:step as i32,..contact.point});}
        for (index,stroke) in self.pending_touches.iter().enumerate() {
            if stroke.open&&self.contacts.iter().any(|held|held.id==stroke.contact.id) {selected[index]=true;}
            else if self.points.len()-before<MAX_CONTACTS {
                self.points.push(Point{step:step as i32,..stroke.contact.point});selected[index]=true;
            }
        }
        // All held contacts and short-tap endpoints get priority. Remaining
        // deposits are shared across paths; the existing 16/step cap stays fixed.
        for sample in 0..MAX_STROKE_VERTICES {
            for (index,stroke) in self.pending_touches.iter().enumerate() {
                if self.points.len()-before>=MAX_CONTACTS {break;}
                if selected[index] {if let Some(point)=stroke.interior(sample) {self.points.push(Point{step:step as i32,..point});}}
            }
        }
        self.pending_touches.clear();
        // Live endpoints and stroke interiors win. Rotate held emitters through
        // any remaining capacity so mixed live/held input cannot starve one end.
        let count=(MAX_CONTACTS-(self.points.len()-before)).min(self.held.len());
        for _ in 0..count {
            self.points.push(Point{step:step as i32,..self.held[self.held_cursor]});
            self.held_cursor=(self.held_cursor+1)%self.held.len();
        }
    }
}
#[cfg(test)]
mod stroke_tests {
    use super::*;
    #[test]
    fn hold_captures_pending_paths_without_advancing_and_releases_into_existing_decay() {
        let mut runtime=Runtime::default();
        assert!(!runtime.hold(true,0));
        touch(&mut runtime,96,0,0,100,0);touch(&mut runtime,96,127,0,100,0);
        touch(&mut runtime,96,127,127,100,0);touch(&mut runtime,96,127,127,0,0);
        assert!(runtime.hold(true,0));assert!(runtime.holding());
        assert_eq!(runtime.last_sample,None);assert!(runtime.points.is_empty());
        assert!(runtime.held.len()>3&&runtime.held.len()<=MAX_CONTACTS);
        let captured=runtime.held.clone();assert!(runtime.hold(true,0));assert_eq!(runtime.held,captured,"repeated desired state is idempotent");
        for step in 0..40 {runtime.sample(step*24);}
        assert!(runtime.contacts.is_empty());assert!(!runtime.points.is_empty());
        assert!(runtime.points.iter().all(|point|point.y==0||point.x==XY_MAX));
        let before=runtime.points.clone();runtime.hold(false,40*24);
        assert!(!runtime.holding());assert_eq!(runtime.points,before,"release does not abruptly erase the existing tail");
        runtime.sample(56*24);assert!(runtime.points.is_empty());
        assert!(!runtime.hold(true,56*24),"expired history cannot be recaptured");
    }
    #[test]
    fn live_input_has_priority_and_held_emitters_rotate_within_fixed_bounds() {
        let mut runtime=Runtime::default();
        for id in 0..16 {touch(&mut runtime,id,id*8,0,100,0);}
        assert!(runtime.hold(true,0));assert_eq!(runtime.held.len(),MAX_CONTACTS);
        runtime.contacts.clear();runtime.pending_touches.clear();
        let mut seen=std::collections::BTreeSet::new();
        for step in 0..32 {
            for id in 0..15 {touch(&mut runtime,id,id*8,127,100,step*24);}
            runtime.sample(step*24);
            let fresh:Vec<_>=runtime.points.iter().filter(|point|point.step==step as i32).collect();
            assert_eq!(fresh.len(),MAX_CONTACTS);assert_eq!(fresh.iter().filter(|point|point.y==XY_MAX).count(),15);
            seen.insert(fresh.iter().find(|point|point.y==0).unwrap().x);
            assert!(runtime.points.len()<=MAX_CONTACTS*TAIL_STEPS as usize);
        }
        assert_eq!(seen.len(),16);assert_eq!(runtime.held.len(),16,"live touches do not replace the captured cloud");
    }
    fn touch(runtime:&mut Runtime,id:u8,x:u8,y:u8,pressure:u8,tick:u64) {
        assert!(runtime.touch(id,x,y,pressure,Activity::Rate,tick,tick*250));
    }
    #[test]
    fn fast_corner_and_release_leave_a_polyline_not_a_diagonal() {
        let mut runtime=Runtime::default();
        touch(&mut runtime,96,0,0,80,0);touch(&mut runtime,96,127,0,100,0);
        touch(&mut runtime,96,127,127,120,0);touch(&mut runtime,96,127,127,0,0);
        runtime.sample(0);
        assert!(runtime.contacts.is_empty());assert!(runtime.pending_touches.is_empty());
        assert!(runtime.points.len()>3&&runtime.points.len()<=MAX_CONTACTS);
        assert!(runtime.points.iter().all(|point|point.y==0||point.x==XY_MAX));
        assert!(runtime.points.iter().any(|point|point.x==XY_MAX&&point.y==0));
        assert!(runtime.points.iter().any(|point|point.x>0&&point.x<XY_MAX&&point.y==0));
        assert!(runtime.points.iter().any(|point|point.y>0&&point.y<XY_MAX&&point.x==XY_MAX));
        assert!(runtime.points.iter().all(|point|point.activity==Activity::Rate&&(80..=120).contains(&point.pressure)));
    }
    #[test]
    fn fingers_and_reused_contact_ids_never_connect_unrelated_strokes() {
        let mut runtime=Runtime::default();
        touch(&mut runtime,96,0,0,100,0);touch(&mut runtime,96,0,0,0,0);
        touch(&mut runtime,96,127,127,100,0);touch(&mut runtime,96,127,127,0,0);
        runtime.sample(0);assert_eq!(runtime.points.len(),2);
        let mut runtime=Runtime::default();
        touch(&mut runtime,96,0,0,100,0);touch(&mut runtime,97,127,127,100,0);
        touch(&mut runtime,96,127,0,100,0);touch(&mut runtime,97,0,127,100,0);
        runtime.sample(0);assert_eq!(runtime.points.len(),MAX_CONTACTS);
        assert_eq!(runtime.points.iter().filter(|point|point.y==0).count(),8);
        assert_eq!(runtime.points.iter().filter(|point|point.y==XY_MAX).count(),8);
    }
    #[test]
    fn heartbeat_holds_keep_one_deposit_and_movement_crosses_clock_boundaries() {
        let mut runtime=Runtime::default();
        for step in 0..4 {touch(&mut runtime,96,0,0,100,step*24);runtime.sample(step*24);}
        assert_eq!(runtime.points.len(),4);
        touch(&mut runtime,96,127,127,100,96);runtime.sample(96);
        let fresh:Vec<_>=runtime.points.iter().filter(|point|point.step==4).collect();
        assert_eq!(fresh.len(),8);assert!(fresh.iter().all(|point|point.x==point.y));
        assert!(fresh.iter().any(|point|point.x==0));assert!(fresh.iter().any(|point|point.x==XY_MAX));
        touch(&mut runtime,96,0,0,100,288);runtime.sample(288);
        assert_eq!(runtime.points.iter().filter(|point|point.step==12).count(),1,"expired input cannot bridge a later gesture");
    }
    #[test]
    fn path_floods_preserve_every_held_endpoint_and_existing_history_bounds() {
        let mut runtime=Runtime::default();
        for step in 0..20 {
            for movement in 0..100 {for id in 0..MAX_CONTACTS as u8 {
                touch(&mut runtime,id,((movement+u32::from(id))%128) as u8,((movement*3)%128) as u8,100,step*24);
            }}
            assert_eq!(runtime.pending_touches.len(),MAX_CONTACTS);
            assert!(runtime.pending_touches.iter().all(|stroke|stroke.count<=MAX_STROKE_VERTICES));
            runtime.sample(step*24);
            let fresh:Vec<_>=runtime.points.iter().filter(|point|point.step==step as i32).collect();
            assert_eq!(fresh.len(),MAX_CONTACTS);
            assert!(runtime.contacts.iter().all(|contact|fresh.iter().any(|point|(point.x,point.y)==(contact.point.x,contact.point.y))));
            assert!(runtime.points.len()<=MAX_CONTACTS*TAIL_STEPS as usize);
        }
    }
    #[test]
    fn an_activity_change_breaks_the_path_without_reinterpreting_prior_points() {
        let mut runtime=Runtime::default();
        assert!(runtime.touch(96,0,0,100,Activity::Probability,0,0));
        touch(&mut runtime,96,127,127,100,0);runtime.sample(0);
        assert_eq!(runtime.points.len(),2);
        assert!(runtime.points.iter().any(|point|point.x==0&&point.activity==Activity::Probability));
        assert!(runtime.points.iter().any(|point|point.x==XY_MAX&&point.activity==Activity::Rate));
    }
}
/// A seeded, bounded cloud in abstract C-major input space. HB projects it into
/// the actor's input key and resolves each attack against the current conductor.
pub fn notes(config:Config,step:u16,points:&[Point],field:bool)->Vec<Note> {grains(config,step,points,field).into_iter().map(|(note,_)|note).collect()}
pub fn grains(config:Config,step:u16,points:&[Point],field:bool)->Vec<(Note,Point)> {
    grains_in_place(config,step,&mut points.to_vec(),field).into_iter().flatten().collect()
}
/// The live scheduler owns this scratch vector. Four voices fit on the stack;
/// offline Bake retains the owned wrapper above and shares the same renderer.
pub fn grains_in_place(config:Config,step:u16,points:&mut Vec<Point>,field:bool)->[Option<(Note,Point)>;4] {
    let mut result=std::array::from_fn(|_|None);
    if config.end>0&&u32::from(step)*TICKS_PER_STEP>=config.end{return result;}
    let rates=[8,6,4,3,2,1];
    let fastest=usize::from(config.cloud[0])*rates.len()/128;
    if config.complexity==0{return result;}
    if !field {points.clear();points.push(Point::legacy(step as i32,64,64,127,Activity::Probability));}
    if step%rates[fastest]!=0&&!points.iter().any(|point|point.activity==Activity::Rate&&step%rates[usize::from(point.x)*(fastest+1)/(128*usize::from(XY_LEGACY_SCALE))]==0){return result;}
    points.retain(|point|point.step<=step as i32&&step as i32-point.step<TAIL_STEPS);
    // Overdubbing merges recent contacts with untouched clip history. Seeded
    // selection must depend on that history, never on the storage/merge order.
    // Every Point field participates in the key, so equal keys are identical.
    // Unstable sorting therefore preserves musical selection without allocating.
    points.sort_unstable_by_key(|point|(point.step,point.x,point.y,point.pressure,point.activity as u8));
    if points.is_empty(){return result;}
    let mut count=0;
    for voice in 0..if config.bass(){1}else{4} {
        let random=crate::humanize::Humanize::seed(config.seed as usize,voice,(step%256) as u32);
        if random%128>=config.complexity as u32 {continue;}
        let point=&points[(random as usize/128)%points.len()];
        let age=step as i32-point.step;
        if (random>>16)%TAIL_STEPS as u32>=(TAIL_STEPS-age) as u32 {continue;}
        // Each deposit owns its musical interpretation. Switching the surface
        // affects new strokes, never old trails, recorded clips or saved recipes.
        let interval=match point.activity {
            Activity::Probability=>{if (random>>8)%128>32+u32::from(point.x)*3/(4*u32::from(XY_LEGACY_SCALE)) {continue;}rates[fastest]},
            Activity::Rate=>rates[usize::from(point.x)*(fastest+1)/(128*usize::from(XY_LEGACY_SCALE))],
        };
        if step%interval!=0 {continue;}
        let spread=i32::from(config.cloud[3])*14/127;
        let scatter=((random>>20)%29) as i32-14;
        let contour=(i32::from(config.cloud[4])-64)*((step%16) as i32-8)/128;
        let variation=scatter*i32::from(config.cloud[5])/127;
        let degree=((i32::from(point.y)-64*i32::from(XY_LEGACY_SCALE))*14/i32::from(XY_MAX)+(i32::from(config.cloud[2])-64)*21/64+variation*spread/14+contour).clamp(-28,28);
        let pitch=(if config.bass(){36}else{60})+degree.div_euclid(7)*12+[0,2,4,5,7,9,11][degree.rem_euclid(7) as usize];
        let pitch=pitch.clamp(0,127) as u8;
        if result.iter().flatten().any(|(note,_):&(Note,Point)|note.pitch==pitch){continue;}
        let velocity=((40+u32::from(config.intensity)*87/127)*u32::from(point.pressure)/127*(TAIL_STEPS-age) as u32/TAIL_STEPS as u32).clamp(1,127) as u8;
        result[count]=Some((Note{tick:u32::from(step)*TICKS_PER_STEP,step,gate:3+u32::from(config.cloud[1])*93/127,pitch,vel:velocity,input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false},Point{step:step as i32,x:point.x,y:(i32::from(point.y)+(variation*spread/2+contour*8)*i32::from(XY_LEGACY_SCALE)).clamp(0,i32::from(XY_MAX)) as u16,pressure:velocity,activity:point.activity}));
        count+=1;
    }
    result
}
