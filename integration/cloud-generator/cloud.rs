//! A spatial source for the existing follower recipe scheduler. No independent clock.
use crate::{clip::Note, follower_input::InputKey, generator::Config, TICKS_PER_STEP};
pub const TAIL_STEPS:i32=16;
pub const MAX_CONTACTS:usize=16;
pub const MAX_STROKE_VERTICES:usize=8;
pub const MAX_POINTS:usize=MAX_CONTACTS*(256+TAIL_STEPS as usize);
pub const XY_MAX:u16=16383;
pub const XY_LEGACY_SCALE:u16=129;
const RATES:[u16;6]=[8,6,4,3,2,1];
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum Activity {Probability,Rate}
impl Activity {
    pub fn parse(value:u32)->Option<Self> {match value {0=>Some(Self::Probability),1=>Some(Self::Rate),_=>None}}
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub enum PressureTarget {Velocity,Length,Spread,Probability,Rate}
impl PressureTarget {
    pub fn parse(value:u32)->Option<Self> {match value {0=>Some(Self::Velocity),1=>Some(Self::Length),2=>Some(Self::Spread),3=>Some(Self::Probability),4=>Some(Self::Rate),_=>None}}
}
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Point {pub step:i32,pub x:u16,pub y:u16,pub pressure:u8,pub activity:Activity,pub pressure_target:PressureTarget}
impl Point {
    /// Pressure may slow the existing subdivision, never exceed its ceiling.
    fn interval(self,fastest:usize)->u16 {
        let ceiling=match self.activity {Activity::Probability=>fastest,Activity::Rate=>usize::from(self.x)*(fastest+1)/(128*usize::from(XY_LEGACY_SCALE))};
        RATES[if self.pressure_target==PressureTarget::Rate {ceiling*usize::from(self.pressure)/127}else{ceiling}]
    }
    pub fn legacy(step:i32,x:u8,y:u8,pressure:u8,activity:Activity)->Self {
        Self{step,x:u16::from(x)*XY_LEGACY_SCALE,y:u16::from(y)*XY_LEGACY_SCALE,pressure,activity,pressure_target:PressureTarget::Velocity}
    }
    pub fn legacy_xy(self)->bool {self.x%XY_LEGACY_SCALE==0&&self.y%XY_LEGACY_SCALE==0}
    pub fn wire(self)->String {
        if self.pressure_target!=PressureTarget::Velocity {return format!("{},{},{},{},{},14,{}",self.step,self.x,self.y,self.pressure,self.activity as u8,self.pressure_target as u8);}
        if self.legacy_xy() {format!("{},{},{},{}{}",self.step,self.x/XY_LEGACY_SCALE,self.y/XY_LEGACY_SCALE,self.pressure,if self.activity==Activity::Rate {",1"}else{""})}
        else {format!("{},{},{},{},{},14",self.step,self.x,self.y,self.pressure,self.activity as u8)}
    }
    pub fn parse(text:&str)->Option<Self> {
        let fields:Vec<i32>=text.split(',').map(str::parse).collect::<Result<_,_>>().ok()?;
        if !matches!(fields.len(),4|5|6|7){return None;}
        let precise=fields.len()>=6;
        if precise&&fields[5]!=14{return None;}
        let maximum=if precise {i32::from(XY_MAX)}else{127};
        if !(-TAIL_STEPS..256).contains(&fields[0])||fields[1..3].iter().any(|value|!(0..=maximum).contains(value))||!(1..=127).contains(&fields[3]){return None;}
        let scale=if precise {1}else{XY_LEGACY_SCALE};
        Some(Self{step:fields[0],x:fields[1] as u16*scale,y:fields[2] as u16*scale,pressure:fields[3] as u8,activity:Activity::parse(*fields.get(4).unwrap_or(&0) as u32)?,pressure_target:PressureTarget::parse(*fields.get(6).unwrap_or(&0) as u32)?})
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
                return Some(Point{step:0,x:coordinate(pair[0].x,pair[1].x),y:coordinate(pair[0].y,pair[1].y),pressure:interpolate(u16::from(pair[0].pressure),u16::from(pair[1].pressure)) as u8,..self.contact.point});
            }
            remaining=remaining.saturating_sub(length);
        }
        None
    }
}
/// Effective operation contribution; manual position and capture have separate owners.
#[derive(Clone,Copy,Debug,Default,PartialEq,Eq)]
pub struct Operation {pub hold:bool,pub shift:[i32;2]}
impl Operation {
    pub fn parse(message:&str)->Option<Self> {
        let mut fields=message.split(',');if fields.next()?!="co1"{return None;}
        let hold=fields.next()?.parse::<u16>().ok()?!=0;
        let horizontal=fields.next()?.parse::<i32>().ok()?;
        let vertical=fields.next()?.parse::<i32>().ok()?;
        if fields.next().is_some()||![horizontal,vertical].iter().all(|value|(-16383..=16383).contains(value)){return None;}
        Some(Self{hold,shift:[horizontal,vertical]})
    }
}
#[derive(Clone,Debug,Default)]
pub struct Runtime {
    pub contacts:Vec<Contact>,pub pending_touches:Vec<Stroke>,pub points:Vec<Point>,pub field:bool,
    pub view:Vec<Point>,pub grains:Vec<Point>,pub last_sample:Option<u64>,pub overridden:Vec<u16>,pub pending:Vec<(u8,Point)>,
    /// Reused step candidates; never persisted or exposed as display ordering.
    pub(crate) work:Vec<Point>,
    pub(crate) held:Vec<Point>,pub(crate) held_cursor:usize,
    pub held_shift:[i32;2],pub held_wrap:bool,pub capture_id:u32,
    pub operation_shift:[i32;2],
    pub(crate) manual_hold:bool,pub(crate) operation_hold:bool,
}
impl Runtime {
    pub fn holding(&self)->bool {!self.held.is_empty()}
    /// Freeze a bounded set of emitters, without advancing the musical sampler.
    /// Pending short strokes count even when captured between clock ticks.
    pub fn hold(&mut self,enabled:bool,tick:u64)->bool {
        if enabled {if !self.capture_hold(tick){return false;}self.manual_hold=true;}
        else {self.manual_hold=false;self.release_hold();}true
    }
    /// Independent owners share the capture. Ending one cannot erase the other.
    pub fn hold_operation(&mut self,enabled:bool,tick:u64)->bool {
        self.operation_hold=enabled;
        if enabled {self.capture_hold(tick)}else{self.release_hold();true}
    }
    fn release_hold(&mut self) {
        if !self.manual_hold&&!self.operation_hold {self.held.clear();self.held_cursor=0;self.held_shift=[0;2];self.held_wrap=false;}
    }
    fn capture_hold(&mut self,tick:u64)->bool {
        if self.holding(){return true;}
        if self.contacts.is_empty()&&self.pending_touches.is_empty()&&self.points.is_empty(){return false;}
        let step=(tick/TICKS_PER_STEP as u64) as i32;
        let mut fresh=Self{contacts:self.contacts.clone(),pending_touches:self.pending_touches.clone(),..Default::default()};
        fresh.sample(tick);
        let candidates:Vec<_>=self.points.iter().filter(|point|point.step<=step&&step-point.step<TAIL_STEPS).chain(fresh.points.iter()).copied().collect();
        let count=candidates.len().min(MAX_CONTACTS);
        if count==0{return false;}
        self.held=(0..count).map(|index|candidates[if count==1 {0}else{index*(candidates.len()-1)/(count-1)}]).collect();
        // Process-wide identity survives runtime/track resets and Engine replacement.
        static NEXT_CAPTURE:std::sync::atomic::AtomicU32=std::sync::atomic::AtomicU32::new(1);
        self.capture_id=NEXT_CAPTURE.fetch_add(1,std::sync::atomic::Ordering::Relaxed);
        if self.capture_id==0 {self.capture_id=NEXT_CAPTURE.fetch_add(1,std::sync::atomic::Ordering::Relaxed);}
        self.held_cursor=0;self.held_shift=[0;2];self.held_wrap=false;self.field=true;true
    }
    /// Move emitters from their original coordinates; clipping never erases the shape.
    pub fn shift_held(&mut self,axis:usize,value:i32,relative:bool,wrap:bool)->bool {
        let maximum=i32::from(XY_MAX);
        if !self.holding()||axis>1||!(-maximum..=maximum).contains(&value){return false;}
        let mut next=if relative {self.held_shift[axis]+value}else{value};
        if wrap {if next>maximum {next-=maximum+1;}else if next< -maximum {next+=maximum+1;}}
        self.held_shift[axis]=next.clamp(-maximum,maximum);
        self.held_wrap=wrap;true
    }
    pub fn center_held(&mut self)->bool {
        if !self.holding(){return false;}self.held_shift=[0;2];true
    }
    fn moved_held(&self,point:Point)->Point {
        let coordinate=|value:u16,offset:i32| {
            let shifted=i32::from(value)+offset;
            if self.held_wrap {shifted.rem_euclid(i32::from(XY_MAX)+1) as u16}else{shifted.clamp(0,i32::from(XY_MAX)) as u16}
        };
        Point{x:coordinate(point.x,self.held_shift[0]+self.operation_shift[0]),y:coordinate(point.y,self.held_shift[1]+self.operation_shift[1]),..point}
    }
    pub fn touch(&mut self,id:u8,x:u8,y:u8,pressure:u8,activity:Activity,tick:u64,frame:u64)->bool {
        self.touch_xy(id,u16::from(x)*XY_LEGACY_SCALE,u16::from(y)*XY_LEGACY_SCALE,pressure,activity,tick,frame,false)
    }
    pub fn touch_xy(&mut self,id:u8,x:u16,y:u16,pressure:u8,activity:Activity,tick:u64,frame:u64,precise:bool)->bool {
        self.touch_expression(id,x,y,pressure,activity,PressureTarget::Velocity,tick,frame,precise)
    }
    pub fn touch_expression(&mut self,id:u8,x:u16,y:u16,pressure:u8,activity:Activity,pressure_target:PressureTarget,tick:u64,frame:u64,precise:bool)->bool {
        if x>XY_MAX||y>XY_MAX||pressure>127{return false;}
        let held=self.contacts.iter().position(|contact|contact.id==id);
        if pressure==0 {
            if let Some(index)=held {self.contacts.remove(index);}
            for stroke in &mut self.pending_touches {if stroke.contact.id==id {stroke.open=false;}}
            return true;
        }
        if held.is_none()&&self.contacts.len()>=MAX_CONTACTS {return false;}
        let previous=held.map(|index|self.contacts[index]).filter(|contact|contact.precise==precise&&contact.point.activity==activity&&contact.point.pressure_target==pressure_target&&tick.saturating_sub(contact.refreshed)<192);
        if previous.is_none() {for stroke in &mut self.pending_touches {if stroke.contact.id==id {stroke.open=false;}}}
        let contact=Contact{id,point:Point{step:0,x,y,pressure,activity,pressure_target},refreshed:tick,frame,precise};
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
            self.points.push(Point{step:step as i32,..self.moved_held(self.held[self.held_cursor])});
            self.held_cursor=(self.held_cursor+1)%self.held.len();
        }
    }
}
#[cfg(test)]
mod stroke_tests {
    use super::*;
    #[test]
    fn held_translation_preserves_shape_pressure_history_and_subpixel_motion() {
        let mut runtime=Runtime::default();
        for (id,x,y,target) in [(96,10001,8193,PressureTarget::Rate),(97,16383,0,PressureTarget::Spread)] {
            assert!(runtime.touch_expression(id,x,y,77,Activity::Rate,target,0,0,true));
        }
        assert!(runtime.hold(true,0));let original=runtime.held.clone();
        runtime.contacts.clear();runtime.pending_touches.clear();runtime.sample(0);let history=runtime.points.clone();
        assert!(runtime.shift_held(0,1,true,false));assert!(runtime.shift_held(1,-1,true,false));runtime.sample(24);
        let moved:Vec<_>=runtime.points.iter().filter(|point|point.step==1).copied().collect();
        assert_eq!((moved[0].x,moved[0].y),(10002,8192));assert_eq!((moved[1].x,moved[1].y),(16383,0));
        for (point,base) in moved.iter().zip(&original){assert_eq!((point.pressure,point.activity,point.pressure_target),(base.pressure,base.activity,base.pressure_target));}
        assert_eq!(&runtime.points[..history.len()],history.as_slice());assert_eq!(runtime.held,original);
        assert!(runtime.hold(true,24));assert_eq!(runtime.held_shift,[1,-1],"idempotent capture retains movement");
        assert!(runtime.shift_held(0,16383,false,true));assert!(runtime.shift_held(0,1,true,true));assert_eq!(runtime.held_shift[0],0);
        assert!(runtime.shift_held(0,-1,true,true));runtime.sample(48);
        assert_eq!(runtime.points.last().unwrap().x,16382);assert_eq!(runtime.points.last().unwrap().y,16383);
        assert!(runtime.shift_held(0,-16383,true,true));assert_eq!(runtime.held_shift[0],0);
        assert!(runtime.center_held());runtime.sample(72);
        let centered:Vec<_>=runtime.points.iter().filter(|point|point.step==3).map(|point|Point{step:0,..*point}).collect();assert_eq!(centered,original);
        assert!(runtime.contacts.is_empty(),"moving consequences never invents direct contacts");
        assert!(!runtime.shift_held(2,1,true,false));assert!(!runtime.shift_held(0,i32::MAX,true,false));
        runtime.hold(false,72);assert_eq!(runtime.held_shift,[0,0]);assert!(!runtime.held_wrap);
        assert!(!runtime.shift_held(0,1,true,false));assert!(!runtime.center_held());
        assert!(runtime.hold(true,72));assert_eq!(runtime.held_shift,[0,0]);
    }
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
    let fastest=usize::from(config.cloud[0])*RATES.len()/128;
    if config.complexity==0{return result;}
    if !field {points.clear();points.push(Point::legacy(step as i32,64,64,127,Activity::Probability));}
    if step%RATES[fastest]!=0&&!points.iter().any(|point|step%point.interval(fastest)==0){return result;}
    points.retain(|point|point.step<=step as i32&&step as i32-point.step<TAIL_STEPS);
    // Overdubbing merges recent contacts with untouched clip history. Seeded
    // selection must depend on that history, never on the storage/merge order.
    // Every Point field participates in the key, so equal keys are identical.
    // Unstable sorting therefore preserves musical selection without allocating.
    points.sort_unstable_by_key(|point|(point.step,point.x,point.y,point.pressure,point.activity as u8,point.pressure_target as u8));
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
        if point.activity==Activity::Probability&&(random>>8)%128>32+u32::from(point.x)*3/(4*u32::from(XY_LEGACY_SCALE)){continue;}
        if step%point.interval(fastest)!=0 {continue;}
        // A separate seeded gate makes each lighter-pressure result a subset
        // of the stronger one, with full pressure retaining every eligible grain.
        if point.pressure_target==PressureTarget::Probability&&random.rotate_left(13)%127>=u32::from(point.pressure){continue;}
        let spread=i32::from(config.cloud[3])*14/127;
        let spread=if point.pressure_target==PressureTarget::Spread {spread*i32::from(point.pressure)/127}else{spread};
        let scatter=((random>>20)%29) as i32-14;
        let contour=(i32::from(config.cloud[4])-64)*((step%16) as i32-8)/128;
        let variation=scatter*i32::from(config.cloud[5])/127;
        let degree=((i32::from(point.y)-64*i32::from(XY_LEGACY_SCALE))*14/i32::from(XY_MAX)+(i32::from(config.cloud[2])-64)*21/64+variation*spread/14+contour).clamp(-28,28);
        let pitch=(if config.bass(){36}else{60})+degree.div_euclid(7)*12+[0,2,4,5,7,9,11][degree.rem_euclid(7) as usize];
        let pitch=pitch.clamp(0,127) as u8;
        if result.iter().flatten().any(|(note,_):&(Note,Point)|note.pitch==pitch){continue;}
        let velocity_pressure=if point.pressure_target==PressureTarget::Velocity {point.pressure}else{127};
        let velocity=((40+u32::from(config.intensity)*87/127)*u32::from(velocity_pressure)/127*(TAIL_STEPS-age) as u32/TAIL_STEPS as u32).clamp(1,127) as u8;
        let length=u32::from(config.cloud[1])*93/127;
        let gate=3+if point.pressure_target==PressureTarget::Length {length*u32::from(point.pressure)/127}else{length};
        result[count]=Some((Note{tick:u32::from(step)*TICKS_PER_STEP,step,gate,pitch,vel:velocity,input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false},Point{step:step as i32,y:(i32::from(point.y)+(variation*spread/2+contour*8)*i32::from(XY_LEGACY_SCALE)).clamp(0,i32::from(XY_MAX)) as u16,pressure:velocity,..*point}));
        count+=1;
    }
    result
}

#[cfg(test)]
mod pressure_tests {
    use super::*;
    #[test]
    fn pressure_targets_shape_only_the_selected_dimension() {
        let mut changed_spreads=0;
        for seed in 1..64 {
            let config=Config{style:17,seed,complexity:127,intensity:100,cloud:[127,127,64,127,64,127],..Default::default()};
            let point=Point::legacy(0,127,64,127,Activity::Rate);
            let full=notes(config,0,&[point],true);
            for target in [PressureTarget::Velocity,PressureTarget::Length,PressureTarget::Spread] {
                let maximum=notes(config,0,&[Point{pressure_target:target,..point}],true);
                assert_eq!(format!("{maximum:?}"),format!("{full:?}"),"full pressure retains the existing control ceiling");
                let soft=notes(config,0,&[Point{pressure:1,pressure_target:target,..point}],true);
                assert_eq!(soft.len(),full.len());
                for (soft,full) in soft.iter().zip(&full) {
                    assert_eq!(soft.tick,full.tick);assert_eq!(soft.step,full.step);
                    match target {
                        PressureTarget::Velocity=>{assert!(soft.vel<full.vel);assert_eq!(soft.gate,full.gate);assert_eq!(soft.pitch,full.pitch);},
                        PressureTarget::Length=>{assert_eq!(soft.vel,full.vel);assert_eq!(soft.gate,3);assert_eq!(full.gate,96);assert_eq!(soft.pitch,full.pitch);},
                        PressureTarget::Spread=>{assert_eq!(soft.vel,full.vel);assert_eq!(soft.gate,full.gate);assert_eq!(soft.pitch,36);changed_spreads+=usize::from(soft.pitch!=full.pitch);},
                        PressureTarget::Probability|PressureTarget::Rate=>unreachable!("rhythmic targets have separate clock/gate tests"),
                    }
                }
            }
        }
        assert!(changed_spreads>20,"a squeeze audibly expands the seeded pitch scatter");
    }
    #[test]
    fn target_changes_split_strokes_and_hold_retains_both_interpretations() {
        let mut runtime=Runtime::default();
        assert!(runtime.touch_expression(96,0,0,100,Activity::Rate,PressureTarget::Length,0,0,true));
        assert!(runtime.touch_expression(96,XY_MAX,XY_MAX,100,Activity::Rate,PressureTarget::Spread,0,0,true));
        assert!(runtime.hold(true,0));runtime.sample(0);
        assert!(runtime.points.iter().all(|point|(point.x,point.y)==(0,0)||(point.x,point.y)==(XY_MAX,XY_MAX)),"no connecting diagonal across a target change");
        assert_eq!(runtime.held.len(),2);
        assert!(runtime.held.iter().any(|point|point.pressure_target==PressureTarget::Length));
        assert!(runtime.held.iter().any(|point|point.pressure_target==PressureTarget::Spread));
        assert!(runtime.touch(96,0,0,0,Activity::Probability,0,0));assert!(runtime.contacts.is_empty());
    }
    #[test]
    fn pressure_probability_thins_eligible_grains_without_changing_their_notes() {
        let mut counts=[0;5];
        for activity in [Activity::Probability,Activity::Rate] {for density in [40,127] {for seed in 1..64 {for step in 0..32 {
            let config=Config{style:17,seed,complexity:density,intensity:96,cloud:[127,80,64,100,75,110],..Default::default()};
            let point=Point::legacy(step as i32-3,80,64,127,activity);
            let baseline=notes(config,step,&[point],true);
            let mut previous=false;
            for (index,pressure) in [1,32,64,96,127].into_iter().enumerate() {
                let actual=notes(config,step,&[Point{pressure,pressure_target:PressureTarget::Probability,..point}],true);
                assert!(!previous||!actual.is_empty(),"stronger pressure must retain a previously eligible attack");
                if !actual.is_empty(){assert_eq!(format!("{actual:?}"),format!("{baseline:?}"),"pressure probability leaves velocity, gate and pitch unchanged");}
                if pressure==127 {assert_eq!(format!("{actual:?}"),format!("{baseline:?}"));}
                previous=!actual.is_empty();counts[index]+=actual.len();
            }
        }}}}
        assert!(counts.windows(2).all(|pair|pair[0]<pair[1]));
        assert!(counts[0]>0&&counts[0]*20<counts[4],"light pressure is sparse, full pressure preserves the existing density ceiling");
    }
    #[test]
    fn pressure_rate_uses_shared_clock_subdivisions_and_respects_both_ceilings() {
        // Expected intervals in sixteenths. Dotted intervals must not be gated
        // by the Rate knob's faster clock (e.g. interval 8 under a ceiling of 6).
        let cases=[
            (127,Activity::Probability,64,vec![(1,8),(26,6),(51,4),(77,3),(102,2),(127,1)]),
            (32,Activity::Probability,127,vec![(1,8),(64,8),(127,6)]),
            (48,Activity::Probability,127,vec![(1,8),(64,6),(127,4)]),
            (127,Activity::Rate,60,vec![(1,8),(64,6),(127,4)]),
            (127,Activity::Rate,0,vec![(1,8),(64,8),(127,8)]),
        ];
        let mut attacks=0;
        for (rate,activity,position,expected) in cases {for (pressure,interval) in expected {for seed in 1..16 {for step in 0..48 {
            let config=Config{style:17,seed,complexity:127,intensity:96,cloud:[rate,80,64,100,75,110],..Default::default()};
            let point=Point{pressure_target:PressureTarget::Rate,..Point::legacy(step as i32,position,64,pressure,activity)};
            let actual=notes(config,step,&[point],true);
            assert!(actual.iter().all(|note|note.step%interval==0));
            let mut reference=config;
            reference.cloud[0]=match interval {8=>0,6=>22,4=>43,3=>64,2=>86,1=>107,_=>unreachable!()};
            let reference_point=Point{pressure:127,pressure_target:PressureTarget::Velocity,x:if activity==Activity::Rate {XY_MAX}else{point.x},..point};
            let expected=notes(reference,step,&[reference_point],true);
            assert_eq!(format!("{actual:?}"),format!("{expected:?}"),"rate={rate} activity={activity:?} position={position} pressure={pressure} step={step}");
            attacks+=actual.len();
        }}}}
        assert!(attacks>100);
    }
    #[test]
    fn mixed_targets_are_deterministic_independent_of_storage_order() {
        let point=Point::legacy(0,127,64,64,Activity::Rate);
        let points=[point,Point{pressure_target:PressureTarget::Spread,..point},Point{pressure_target:PressureTarget::Length,..point},Point{pressure_target:PressureTarget::Probability,..point},Point{pressure_target:PressureTarget::Rate,..point}];
        let mut reversed=points;reversed.reverse();
        for seed in 1..64 {
            let config=Config{style:16,seed,complexity:127,cloud:[127;6],..Default::default()};
            assert_eq!(format!("{:?}",grains(config,0,&points,true)),format!("{:?}",grains(config,0,&reversed,true)));
        }
    }
}

#[cfg(test)] mod operation_hold_tests {
    use super::*;
    #[test] fn independent_hold_owners_preserve_capture_and_precise_movement() {
        for manual_first in [true,false] {
            let mut runtime=Runtime::default();runtime.touch_xy(1,8193,10001,100,Activity::Rate,0,0,true);
            if manual_first {assert!(runtime.hold(true,0));}else{assert!(runtime.hold_operation(true,0));}
            runtime.shift_held(0,1,true,false);
            if manual_first {assert!(runtime.hold_operation(true,0));runtime.hold(false,0);}else{assert!(runtime.hold(true,0));runtime.hold_operation(false,0);}
            assert!(runtime.holding());assert_eq!(runtime.held_shift,[1,0]);assert_eq!(runtime.held[0].x,8193);
            if manual_first {runtime.hold_operation(false,0);}else{runtime.hold(false,0);}
            assert!(!runtime.holding());assert_eq!(runtime.held_shift,[0,0]);
        }
    }
    #[test] fn unsuccessful_manual_capture_does_not_acquire_a_hold_owner() {
        let mut runtime=Runtime::default();assert!(!runtime.hold(true,0));
        runtime.touch_xy(1,8193,10001,100,Activity::Rate,0,0,true);
        assert!(runtime.hold_operation(true,0));runtime.hold_operation(false,0);assert!(!runtime.holding());
    }
}

#[cfg(test)] mod operation_shift_tests {
    use super::*;
    #[test] fn operation_offsets_preserve_manual_edits_and_precise_shape() {
        let mut runtime=Runtime::default();runtime.touch_xy(1,8193,10001,100,Activity::Rate,0,0,true);assert!(runtime.hold(true,0));
        let original=runtime.held[0];runtime.shift_held(0,1,true,false);runtime.operation_shift=[4096,-4096];
        let moved=runtime.moved_held(original);assert_eq!((moved.x,moved.y),(12290,5905));
        runtime.shift_held(0,2,true,false);runtime.operation_shift=[0;2];
        assert_eq!(runtime.moved_held(original).x,8196);assert_eq!(runtime.held[0],original);assert!(runtime.holding());
        runtime.operation_shift=[16383,-16383];assert_eq!((runtime.moved_held(original).x,runtime.moved_held(original).y),(16383,0));
        runtime.held_wrap=true;assert_eq!((runtime.moved_held(original).x,runtime.moved_held(original).y),(8195,10002));
        runtime.center_held();assert_eq!(runtime.held_shift,[0,0]);assert_eq!(runtime.operation_shift,[16383,-16383]);
        runtime.operation_shift=[0;2];assert_eq!(runtime.moved_held(original),original);
    }
    #[test] fn wire_offsets_are_strict_bounded_and_fail_closed() {
        assert_eq!(Operation::parse("co1,3,1,-1"),Some(Operation{hold:true,shift:[1,-1]}));
        assert_eq!(Operation::parse("co1,0,16383,-16383"),Some(Operation{hold:false,shift:[16383,-16383]}));
        for invalid in ["","co1,0,0","co1,0,0,0,1","co2,0,0,0","co1,65536,0,0","co1,0,16384,0","co1,0,0,-16384","co1,0,nan,0"] {assert!(Operation::parse(invalid).is_none(),"{invalid}");}
    }
}
