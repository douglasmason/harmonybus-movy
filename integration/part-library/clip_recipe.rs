//! Clip-owned rendering defaults; the ordinary parameter and automation paths apply them.
use crate::engine::{Engine, OutEvent};
use crate::part_settings::{Settings, KEYS, COUNT};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Recipe {
    pub name: String,
    pub settings: Settings,
    pub gate: u16,
}
impl Recipe {
    pub fn wire(&self) -> String { format!("{} {} {}", self.name, self.gate, self.settings.wire()) }
    pub fn parse(value: &str) -> Option<Self> {
        let mut fields = value.split_whitespace();
        let name = fields.next()?;
        let gate = fields.next()?.parse::<u16>().ok()?;
        let settings = Settings::parse(fields.next()?)?;
        if fields.next().is_some() || name.len()>40 || !name.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte==b'-') || !(10..=200).contains(&gate) || !settings.mapped() { return None; }
        Some(Self { name:name.into(), settings, gate })
    }
}
impl Engine {
    pub fn recipe_slot(&self, track: usize) -> usize {
        let target=&self.tracks[track]; target.playing_slot.unwrap_or(target.active_clip)
    }
    /// Compare small fixed arrays. No strings, allocations or host calls when unchanged.
    pub fn recipe_tick(&mut self, out: &mut Vec<OutEvent>) {
        for track in 0..self.tracks.len() {
            let clip=&self.tracks[track].clips[self.recipe_slot(track)];
            let next=clip.recipe.as_ref().map(|recipe|recipe.settings).or(self.recipe_bases[track]);
            if let Some(base)=self.recipe_bases[track] {self.recipe_fallbacks[track]=Some(base);}
            if next==self.recipe_seen[track] {continue;}
            out.push(OutEvent::RecipeLanes{track:track as u8});
            if next.is_some()&&self.recipe_bases[track].is_none(){out.push(OutEvent::RecipeCapture{track:track as u8});}
            if let Some(settings)=next.or(self.recipe_fallbacks[track]) {
                for key in 0..COUNT {
                    if self.recipe_seen[track].map_or(true,|previous|previous.0[key]!=settings.0[key]) {
                        out.push(OutEvent::RecipeParam {track:track as u8,key:key as u8,value:settings.0[key]});
                    }
                }
            }
            self.recipe_seen[track]=next;
            if next.is_none(){self.recipe_fallbacks[track]=None;}
        }
    }
    /// Explicit knob edits update the currently sounding clip, or its selected stopped clip.
    /// Automation reaches the chain directly and therefore never rewrites these defaults.
    pub fn recipe_edit_param(&mut self, track:usize, key:&str, value:&str) -> bool {
        if track>=self.tracks.len() || self.recipe_bases[track].is_none() {return true;}
        let Some(index)=KEYS.iter().position(|candidate|*candidate==key) else {return true;};
        let Some(number)=Settings::value(index,value) else {return false;};
        let slot=self.recipe_slot(track);
        if let Some(recipe)=&mut self.tracks[track].clips[slot].recipe {
            let mut next=recipe.settings;next.0[index]=number;
            if !next.mapped() {return false;}
            recipe.settings=next;
        } else if let Some(settings)=&mut self.recipe_bases[track] { settings.0[index]=number; }
        if let Some(seen)=&mut self.recipe_seen[track] {seen.0[index]=number;}
        self.dirty=true;true
    }
    pub fn recipe_info(&self, track:usize) -> String {
        let Some(target)=self.tracks.get(track) else {return "error:Invalid track".into();};
        let slot=self.recipe_slot(track);
        let clip=&target.clips[slot];
        format!("{}|{}|{}|{}",slot,clip.transpose,clip.recipe.as_ref().map_or(100,|recipe|recipe.gate),clip.recipe.as_ref().map_or_else(String::new,Recipe::wire))
    }
    pub fn recipe_shape(&mut self, message:&str) {
        let fields:Vec<_>=message.split_whitespace().collect();
        if fields.len()!=5 {return;}
        let (Ok(track),Ok(slot),Ok(value))=(fields[1].parse::<usize>(),fields[2].parse::<usize>(),fields[4].parse::<i16>()) else {return;};
        let Some(clip)=self.tracks.get_mut(track).and_then(|target|target.clips.get_mut(slot)) else {return;};
        if let Some(recipe)=&mut clip.recipe {
            match fields[3] {"gate" if (10..=200).contains(&value)=>recipe.gate=value as u16,
                "register" if (-24..=24).contains(&value)=>clip.transpose=value as i8,_=>{}}
        }
    }
}
