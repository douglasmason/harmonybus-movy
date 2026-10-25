//! Small authored source patterns. HarmonyBus voices and maps them at playback.
use crate::{clip::{Clip,Note},follower_input::InputKey,clip_recipe::Recipe,part_settings::Settings,TICKS_PER_STEP};
pub const NAMES:[&str;7]=["Sustain","Quarters","Offbeats","Sparse","Three-Three-Two","Broken","Registers"];
pub fn comp(choice:usize) -> Option<Clip> {
    let name=*NAMES.get(choice)?;
    // Sixteenths, gate in ticks, input pitch and accent. C major is a source coordinate system.
    let events:&[(u16,u32,u8,u8)]=match choice {
        0=>&[(0,360,60,96)],
        1=>&[(0,42,60,108),(4,38,60,84),(8,42,60,100),(12,38,60,82)],
        2=>&[(2,24,60,92),(6,24,60,104),(10,24,60,88),(14,24,60,100)],
        3=>&[(0,60,60,104),(7,24,60,76),(10,48,60,96)],
        4=>&[(0,48,60,108),(6,48,60,96),(12,48,60,100)],
        5=>&[(0,36,60,104),(2,30,64,84),(4,30,67,94),(6,30,64,80),(8,36,60,100),(10,30,64,86),(12,30,67,96),(14,30,71,82)],
        _=>&[(0,48,48,104),(4,36,60,88),(8,48,48,100),(12,36,64,92)],
    };
    let key=InputKey::new(0,1).unwrap();
    let mut settings=Settings::comp();
    if choice==5 {settings.0[4]=0;settings.0[1]=1;}
    if choice==3 {settings.0[5]=11;}
    let mut clip=Clip::new();clip.length_steps=16;clip.input_key=Some(key);
    clip.recipe=Some(Recipe{name:name.into(),settings,gate:100});
    for &(step,gate,pitch,vel) in events {
        clip.notes.push(Note{tick:step as u32*TICKS_PER_STEP,gate,pitch,vel,step,actions:None,input_key:Some(key),rendered:false,pressure:Vec::new(),suppress:false,fired:false});
    }
    Some(clip)
}
