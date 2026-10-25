//! Authored input comes from catalog.json, shared with Move and browser previews.
use crate::{clip::{Clip,Note},follower_input::InputKey,clip_recipe::Recipe,part_settings::Settings,TICKS_PER_STEP};
struct Pattern {name:&'static str,steps:u16,notes:&'static [(u16,u32,u8,u8)],settings:&'static [(usize,i16)]}
include!("part_catalog_data.rs");
pub fn comp(choice:usize)->Option<Clip>{authored(COMP.get(choice)?)}
pub fn bass(choice:usize)->Option<Clip>{authored(BASS.get(choice)?)}
fn authored(pattern:&Pattern)->Option<Clip> {
    let key=InputKey::new(0,1)?;
    let mut settings=Settings::comp();
    for &(index,value) in pattern.settings {settings.0[index]=value;}
    let mut clip=Clip::new();clip.length_steps=pattern.steps;clip.input_key=Some(key);
    clip.recipe=Some(Recipe{name:pattern.name.into(),settings,gate:100});
    for &(step,gate,pitch,vel) in pattern.notes {
        clip.notes.push(Note{tick:step as u32*TICKS_PER_STEP,gate,pitch,vel,step,actions:None,input_key:Some(key),rendered:false,pressure:Vec::new(),suppress:false,fired:false});
    }
    Some(clip)
}
