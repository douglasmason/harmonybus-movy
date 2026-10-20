//! Derived actor inputs are transient: record source gestures once, regenerate
//! accompaniment through its own track on live input and clip playback.
use crate::surface_route::Event;

pub struct JointLinks {
    routes: [Option<(usize,i16)>;16],
    // Separate live and clip owners. A live release cannot close a recorded voice.
    held: Vec<Vec<(usize,u8)>>,
    guide_enabled: [bool;4],
    guide: [Option<u8>;4],
    guide_shift: [i16;4],
    guided_held: Vec<Vec<Option<u8>>>,
}
impl JointLinks {
    pub fn new() -> Self {Self {routes:[None;16],held:(0..4096).map(|_|Vec::new()).collect(),
        guide_enabled:[false;4],guide:[None;4],guide_shift:[0;4],guided_held:(0..2048).map(|_|Vec::new()).collect()}}
    pub fn set(&mut self,value:&str)->bool {
        let mut routes=[None;16];let mut seen=0u16;let mut guide_enabled=[false;4];let mut guide_shift=[0;4];
        for entry in value.split(';') {
            let fields:Vec<i16>=match entry.split(',').map(str::parse).collect(){Ok(fields)=>fields,Err(_)=>return false};
            if fields.len()!=6 || ![0,4,8,12].contains(&fields[0]) || !(0..=1).contains(&fields[1]) || !(0..=1).contains(&fields[2]) || !(-8..=8).contains(&fields[3]) || !(-8..=8).contains(&fields[4]) || !(0..=1).contains(&fields[5]) {return false;}
            let base=fields[0] as usize;if seen&(1<<base)!=0{return false;}seen|=1<<base;
            if fields[1]!=0 {routes[base]=Some((base+1,fields[3]*12));}
            if fields[2]!=0 {routes[base+3]=Some((base+2,fields[4]*12));}
            guide_enabled[base/4]=fields[5]!=0;guide_shift[base/4]=fields[4]*12;
        }
        if seen!=0x1111{return false;}
        self.routes=routes;self.guide.fill(None);self.guide_enabled=guide_enabled;self.guide_shift=guide_shift;true
    }
    pub fn derived(&self,track:usize)->bool {self.routes.iter().flatten().any(|(target,_)|*target==track)}
    pub fn route(&mut self,event:Event,playback:bool)->Option<Event> {
        if event.track>=16{return None;}
        if event.track%4==3 && event.status==0x90 {
            self.guide[event.track/4]=Some((event.pitch as i16+event.approach.map_or(0,|(delta,_)|delta)).clamp(0,127) as u8);
        }
        let index=usize::from(playback)*2048+event.track*128+event.pitch as usize;
        let (track,pitch)=match event.status {
            0x90=>{
                let (track,shift)=self.routes[event.track]?;
                let source=event.pitch as i16+event.approach.map_or(0,|(delta,_)|delta);
                let pitch=source+shift;if !(0..128).contains(&pitch){return None;}
                self.held[index].push((track,pitch as u8));(track,pitch as u8)
            },
            0x80=>self.held[index].pop()?,
            0xa0=>*self.held[index].last()?,
            _=>return None,
        };
        Some(Event{track,pitch,approach:None,..event})
    }
    /// Clip rhythm and duration stay intact while melody supplies its register.
    pub fn playback_pitch(&mut self,track:usize,pitch:u8,on:bool)->Option<u8> {
        let index=track*128+pitch as usize;
        if !on {return self.guided_held[index].pop().unwrap_or(Some(pitch));}
        let output=if self.derived(track) {None} else if track%4==2 && self.guide_enabled[track/4] {
            Some(self.guide[track/4].map(|guide|(guide as i16+self.guide_shift[track/4]).clamp(0,127) as u8).unwrap_or(pitch))
        } else {Some(pitch)};
        self.guided_held[index].push(output);
        output
    }
    pub fn playback_pressure(&self,track:usize,pitch:u8)->Option<u8> {
        self.guided_held[track*128+pitch as usize].last().copied().unwrap_or(Some(pitch))
    }

    pub fn drain(&mut self)->Vec<(Event,bool)> {
        self.held.iter_mut().enumerate().flat_map(|(index,owners)|owners.drain(..).map(move |(track,pitch)|(Event{track,pitch,status:0x80,value:0,approach:None,full_velocity:false},index>=2048))).collect()
    }
}

#[cfg(test)]mod tests{
    use super::*;
    fn event(status:u8)->Event {Event{track:3,pitch:64,status,value:90,approach:None,full_velocity:false}}
    #[test]fn derived_releases_keep_owner_and_do_not_consume_source_operations(){
        let mut links=JointLinks::new();assert!(links.set("0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0"));
        let note=links.route(event(0x90),false).unwrap();assert_eq!((note.track,note.pitch),(2,52));
        links.route(event(0x90),true);
        links.set("0,0,0,0,0,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");
        assert_eq!(links.route(event(0x80),false).unwrap().pitch,52);
        assert_eq!(links.route(event(0x80),true).unwrap().pitch,52);
        assert!(links.route(event(0x80),false).is_none());
    }
}

#[cfg(test)]mod guide_tests {
    use super::*;
    const CLIPS:&str="0,0,0,0,-1,1;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0";
    #[test]fn guide_keeps_release_pitch_and_clip_rhythm_ownership(){
        let mut links=JointLinks::new();links.set(CLIPS);
        links.route(Event{track:3,pitch:72,status:0x90,value:90,approach:None,full_velocity:false},false);
        assert_eq!(links.playback_pitch(2,48,true),Some(60));
        links.route(Event{track:3,pitch:76,status:0x90,value:90,approach:None,full_velocity:false},false);
        assert_eq!(links.playback_pressure(2,48),Some(60));
        assert_eq!(links.playback_pitch(2,48,false),Some(60));
        assert_eq!(links.playback_pitch(2,48,true),Some(64));
    }
    #[test]fn source_changes_do_not_swallow_existing_clip_releases(){
        let mut links=JointLinks::new();links.set(CLIPS);
        assert_eq!(links.playback_pitch(2,48,true),Some(48));
        links.set("0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");
        assert_eq!(links.playback_pitch(2,48,false),Some(48));
        assert_eq!(links.playback_pitch(2,48,true),None);
        links.set(CLIPS);
        assert_eq!(links.playback_pitch(2,48,false),None);
    }
}
