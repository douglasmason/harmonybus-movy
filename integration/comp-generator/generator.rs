//! A bounded source of mapped actor attacks, consumed by the ordinary scheduler.
use crate::{clip::{Clip,Note},follower_input::InputKey,TICKS_PER_STEP};
pub const CLOUD_DEFAULTS:[u8;6]=[96,48,64,40,64,32];
pub const CLOUD_LABELS:[&str;8]=["generator:density","generator:dynamics","generator:rate","generator:length","generator:register","generator:spread","generator:contour","generator:variation"];
pub const LABELS:[&str;3]=["generator:complexity","generator:intensity","generator:style"];
pub const EUCLIDEAN_DEFAULTS:[u8;4]=[3,8,0,0];
pub const EUCLIDEAN_EXPRESSION:[u8;3]=[0,0,50];
pub const EUCLIDEAN_LABELS:[&str;8]=["generator:hits","generator:steps","generator:rotation","generator:division","generator:intensity","generator:accents","generator:accent_depth","generator:gate"];
#[cfg(test)]
std::thread_local! {
    /// Count source-control evaluations without instrumenting release builds.
    pub(crate) static CONFIG_READS:std::cell::Cell<usize>=const {std::cell::Cell::new(0)};
}
pub fn internal(label:&str)->bool {LABELS.contains(&label)||CLOUD_LABELS.contains(&label)||EUCLIDEAN_LABELS.contains(&label)}
pub fn lane_value(clip:&Clip,lane:u8,step:u16,base:u8)->u8 {
    clip.locks.iter().filter(|lock|lock.lane==lane&&lock.step>=clip.loop_start_steps&&lock.step<=step)
        .max_by_key(|lock|lock.step).map_or(base,|lock|lock.val)
}
pub struct Style {pub name:&'static str,pub bass:bool,pub catalog:usize,pub optional:&'static [(u16,u32,u8,u8,u8)]}
include!("generator_styles.rs");
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Config {pub style:u8,pub complexity:u8,pub intensity:u8,pub seed:u16,pub end:u32,pub cloud:[u8;6],pub euclidean:[u8;4],pub expression:[u8;3]}
impl Default for Config {fn default()->Self {Self {style:0,complexity:32,intensity:64,seed:1,end:0,cloud:CLOUD_DEFAULTS,euclidean:EUCLIDEAN_DEFAULTS,expression:EUCLIDEAN_EXPRESSION}}}
impl Config {
    pub fn parse(text:&str)->Option<Self> {
        let fields:Vec<u32>=text.split_whitespace().map(str::parse).collect::<Result<_,_>>().ok()?;
        if !matches!(fields.len(),4|5|9|11|12)||fields[0]>=STYLES.len() as u32||fields[1]>127||fields[2]>127||!(1..=65535).contains(&fields[3])||fields.get(4).is_some_and(|end|*end>6144)||fields.iter().skip(5).any(|value|*value>127) {return None;}
        let mut config=Self {style:fields[0] as u8,complexity:fields[1] as u8,intensity:fields[2] as u8,seed:fields[3] as u16,end:*fields.get(4).unwrap_or(&0),cloud:if fields.len()==11 {fields[5..].iter().map(|value|*value as u8).collect::<Vec<_>>().try_into().ok()?}else{CLOUD_DEFAULTS},..Default::default()};
        if matches!(fields.len(),9|12) {
            if !config.is_euclidean(){return None;}
            for (field,value) in fields[5..9].iter().enumerate(){if !config.set(field,*value as u8){return None;}}
            for (field,value) in fields[9..].iter().enumerate(){if !config.set(field+5,*value as u8){return None;}}
        }else if config.is_euclidean()&&fields.len()==11 {return None;}
        Some(config)
    }
    pub fn wire(self)->String {if self.is_euclidean(){let base=format!("{} {} {} {} {} {}",self.style,self.complexity,self.intensity,self.seed,self.end,self.euclidean.map(|value|value.to_string()).join(" "));if self.expression==EUCLIDEAN_EXPRESSION{base}else{format!("{} {}",base,self.expression.map(|value|value.to_string()).join(" "))}}else if self.is_cloud(){format!("{} {} {} {} {} {}",self.style,self.complexity,self.intensity,self.seed,self.end,self.cloud.map(|value|value.to_string()).join(" "))}else{format!("{} {} {} {} {}",self.style,self.complexity,self.intensity,self.seed,self.end)}}
    pub fn bass(self)->bool {STYLES[self.style as usize].bass}
    pub fn accepts_style(self,style:u8)->bool {STYLES.get(style as usize).is_some_and(|candidate|candidate.bass==self.bass()&&(candidate.name=="Cloud")==self.is_cloud()&&(candidate.name=="Euclidean")==self.is_euclidean())}
    pub fn recipe_name(self)->&'static str {if self.is_cloud(){if self.bass(){"Bass-Cloud"}else{"Follower-Cloud"}}else if self.bass(){"Bass-Generator"}else{"Comp-Generator"}}
    /// Bass articulation overrides only note expansion. Mapping and expression
    /// stay with the captured actor; cancellation restores the original settings.
    pub fn settings(self,mut settings:crate::part_settings::Settings)->crate::part_settings::Settings {
        if self.is_cloud() {
            settings.0[CLOUD_ROLE_INDEX]=1;
            if !matches!(settings.0[CLOUD_TRAVEL_INDEX],1|5){settings.0[CLOUD_TRAVEL_INDEX]=1;}
        }
        if self.bass()||self.is_cloud() {
            for index in BASS_OFF_KEYS {settings.0[index]=0;}
        }
        settings
    }
    pub fn is_cloud(self)->bool {STYLES[self.style as usize].name=="Cloud"}
    pub fn is_euclidean(self)->bool {STYLES[self.style as usize].name=="Euclidean"}
    pub fn labels(self)->&'static [&'static str] {if self.is_euclidean(){&EUCLIDEAN_LABELS}else if self.is_cloud(){&CLOUD_LABELS}else{&LABELS}}
    pub fn mask(self)->u8 {((1u16<<self.labels().len())-1) as u8}
    pub fn step_mask(self)->u8 {if self.bar_control(2){3}else{self.mask()}}
    pub fn bar_control(self,field:usize)->bool {!self.is_cloud()&&!self.is_euclidean()&&field==2}
    pub fn values(self)->[u8;8] {if self.is_euclidean(){[self.euclidean[0],self.euclidean[1],self.euclidean[2],self.euclidean[3],self.intensity,self.expression[0],self.expression[1],self.expression[2]]}else if self.is_cloud(){[self.complexity,self.intensity,self.cloud[0],self.cloud[1],self.cloud[2],self.cloud[3],self.cloud[4],self.cloud[5]]}else{[self.complexity,self.intensity,self.style,0,0,0,0,0]}}
    pub fn visual_values(self)->[u8;7] {[self.euclidean[0],self.euclidean[1],self.euclidean[2],self.euclidean[3],self.expression[0],self.expression[1],self.expression[2]]}
    pub fn optional_control(self,field:usize)->bool {self.is_euclidean()&&field>=5}
    pub fn set_valid(self,field:usize,value:u8)->bool {
        if self.is_euclidean(){return match field {0|5=>value<=16,1=>(1..=16).contains(&value),2=>value<16,3=>value<4,4=>value<=127,6=>value<=100,7=>(1..=100).contains(&value),_=>false};}
        value<=127&&field<self.labels().len()&&(!self.bar_control(field)||self.accepts_style(value))
    }
    pub fn set(&mut self,field:usize,value:u8)->bool {
        if !self.set_valid(field,value){return false;}
        if self.is_euclidean(){if field<4 {self.euclidean[field]=value;}else if field==4{self.intensity=value;}else{self.expression[field-5]=value;}return true;}
        match field {0=>self.complexity=value,1=>self.intensity=value,_ if self.is_cloud()=>self.cloud[field-2]=value,_=>self.style=value} true
    }
    /// A fixed threshold per authored optional attack. More complexity retains
    /// earlier details; repainting, block size and transport cycles do not reroll.
    pub fn note(self,step:u16)->Option<Note> {
        self.note_at(step,step as u64)
    }
    /// Free Euclidean exploration uses transport phase; saved sources use clip
    /// phase. The note still belongs to the existing scheduler and gate owner.
    pub fn note_at(self,step:u16,phase:u64)->Option<Note> {
        if self.end>0&&step as u32*TICKS_PER_STEP>=self.end {return None;}
        let style=STYLES.get(self.style as usize)?;
        if self.is_euclidean(){
            let [hits,length,rotation,rate]=self.euclidean;
            let division=1u64<<rate;
            if !crate::euclidean::hit(phase,length,hits,rotation,rate){return None;}
            let mut velocity=((90*(64+self.intensity as u32)+64)/128).clamp(1,127) as u8;
            if self.expression[0]>0&&!crate::euclidean::accent(phase,length,hits,rotation,rate,self.expression[0]) {
                velocity=(velocity as u32*(100-self.expression[1] as u32)/100).max(1) as u8;
            }
            return Some(Note {tick:step as u32*TICKS_PER_STEP,step,gate:(division as u32*TICKS_PER_STEP*self.expression[2] as u32/100).max(1),pitch:if self.bass(){36}else{60},vel:velocity,
                input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false});
        }
        let local=step%crate::part_catalog::generator_source_steps(style.bass,style.catalog);
        let essential=crate::part_catalog::generator_source_notes(style.bass,style.catalog).iter().find(|note|note.0==local);
        let (gate,pitch,velocity)=if let Some(&(_,gate,pitch,velocity))=essential {(gate,pitch,velocity)} else {
            let &(_,gate,pitch,velocity,threshold)=style.optional.iter().find(|note|note.0==local)?;
            let random=crate::humanize::Humanize::seed(self.style as usize,self.seed as usize,(step%64) as u32);
            let threshold=(threshold as i16+(random%17) as i16-8).clamp(1,127) as u8;
            if self.complexity<threshold {return None;}
            (gate,pitch,velocity)
        };
        let velocity=((velocity as u32*(64+self.intensity as u32)+64)/128).clamp(1,127) as u8;
        Some(Note {tick:step as u32*TICKS_PER_STEP,step,gate,pitch,vel:velocity,
            input_key:InputKey::new(0,1),actions:None,pressure:Vec::new(),rendered:false,suppress:false,fired:false})
    }
    /// The same named locks drive replay and Bake. Generator clips have no
    /// note-triggered resets: each control holds until its next lock.
    pub fn at(self,clip:&Clip,labels:&[String;8],step:u16)->Self {
        #[cfg(test)]
        CONFIG_READS.with(|count|count.set(count.get()+1));
        let mut result=self;
        for (field,label) in self.labels().iter().enumerate() {
            let Some(lane)=labels.iter().position(|name|name==label) else {continue;};
            let boundary=if self.bar_control(field) {(step/16*16).max(clip.loop_start_steps)} else {step};
            let value=lane_value(clip,lane as u8,boundary,result.values()[field]);
            result.set(field,value);
        }
        result
    }
}
#[derive(Clone,Copy,Debug)]
pub struct Explore {
    pub track:usize,pub desired:Config,pub current:Config,pub take:Option<usize>,
    /// Fixed at Record arm, including the count-in before the first captured tick.
    pub destination:Option<usize>,
    /// A recorded source keeps its normal clock; None is a new free audition.
    pub source:Option<usize>,pub touched:u8,
    /// Release temporary overrides at their existing step/bar boundaries.
    pub restore_pending:u8,
}

/// User generator styles retain only the supported abstract source and its three
/// controls. Refuse edits that this temporary source cannot reproduce faithfully.
pub fn library_valid(clip:&Clip,labels:&[String;8])->Result<(),&'static str> {
    let config=clip.generator.ok_or("Choose a saved generator recipe")?;
    if !clip.notes.is_empty()||!clip.shared_events.is_empty()||!clip.operation_intervals.is_empty()||!clip.grid_gates.is_empty()||!clip.trigs.is_empty()
        ||clip.locks.iter().any(|lock|labels.get(lock.lane as usize).is_none_or(|label|!internal(label))) {
        return Err("Bake edited notes or extra automation before saving");
    }
    if clip.loop_start_steps!=0||clip.scale_num!=1||clip.scale_den!=1||clip.transpose!=0||clip.length_steps==0||clip.length_steps>256||clip.length_steps%16!=0 {
        return Err("Recipe needs whole bars, zero start/transpose and 1x speed");
    }
    if !clip.recipe.as_ref().is_some_and(|recipe|recipe.settings.mapped()) {return Err("Recipe needs mapped actor settings");}
    for (field,label) in config.labels().iter().enumerate() {
        let Some(lane)=labels.iter().position(|name|name==label) else {
            if config.optional_control(field)&&config.values()[field]==EUCLIDEAN_EXPRESSION[field-5]{continue;}
            return Err("Generator automation lanes missing");
        };
        if clip.lock_at(lane as u8,0).is_none(){
            if config.optional_control(field)&&config.values()[field]==EUCLIDEAN_EXPRESSION[field-5]&&!clip.locks.iter().any(|lock|lock.lane==lane as u8){continue;}
            return Err("Generator automation must start at zero");
        }
        if config.bar_control(field)&&clip.locks.iter().filter(|lock|lock.lane==lane as u8).any(|lock|!config.accepts_style(lock.val)) {return Err("Generator style belongs to another actor");}
        if config.is_euclidean()&&clip.locks.iter().filter(|lock|lock.lane==lane as u8).any(|lock|!config.set_valid(field,lock.val)){return Err("Invalid Euclidean control");}
    }
    Ok(())
}
