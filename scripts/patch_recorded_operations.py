"""Persist resolved operation actions beside original note inputs."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_recorded_operations(root: Path) -> None:
    """Carry actions through recording, copy, capture, storage and playback."""
    core: Path = root / 'engine/crates/seq-core/src'
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/recorded-operations'
    (core / 'recorded_actions.rs').write_text((assets / 'actions.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text()+'\npub mod recorded_actions;\n')
    for filename in ['clip.rs','capture.rs','engine.rs','clip_tools.rs']:
        path = core / filename
        source: str = path.read_text()
        source = source.replace('pub input_key: Option<crate::follower_input::InputKey>,', 'pub actions: Option<crate::recorded_actions::Actions>,\n    pub input_key: Option<crate::follower_input::InputKey>,')
        source = source.replace('    input_key: Option<crate::follower_input::InputKey>,','    actions: Option<crate::recorded_actions::Actions>,\n    input_key: Option<crate::follower_input::InputKey>,')
        # Clip has a source context but actions belong to notes, not the whole clip.
        source = source.replace('pub struct Clip {\n    pub actions: Option<crate::recorded_actions::Actions>,','pub struct Clip {')
        source = source.replace('input_key: n.input_key,','actions: n.actions, input_key: n.input_key,')
        source = source.replace('input_key: self.input_key,','actions: None, input_key: self.input_key,')
        source = source.replace('input_key: None, rendered:', 'actions: None, input_key: None, rendered:')
        source = source.replace('CapEvent { input_key: None,','CapEvent { actions: None, input_key: None,')
        source = source.replace('input_key: self.follower_inputs[track].map(', 'actions: self.record_actions[track][pitch as usize].take(), input_key: self.follower_inputs[track].map(')
        source = source.replace('clip.notes.last_mut().unwrap().input_key=cn.input_key;', 'clip.notes.last_mut().unwrap().actions=cn.actions; clip.notes.last_mut().unwrap().input_key=cn.input_key;')
        source = source.replace('clip.notes.last_mut().unwrap().input_key=if p.rendered', 'clip.notes.last_mut().unwrap().actions=if p.rendered {None} else {p.actions}; clip.notes.last_mut().unwrap().input_key=if p.rendered')
        source = source.replace('note.input_key=event.input_key;', 'note.actions=event.actions; note.input_key=event.input_key;')
        path.write_text(source)
    path = core / 'engine.rs'
    source = path.read_text()
    source = source.replace('pub enum OutEvent {','pub enum OutEvent {\n    RecordedActions {track:u8,pitch:u8,actions:Option<crate::recorded_actions::Actions>},')
    source = source.replace('pub struct Engine {','pub struct Engine {\n    pub record_actions: Vec<[Option<crate::recorded_actions::Actions>;128]>,')
    source = source.replace('            follower_inputs: [None;16],','            follower_inputs: [None;16],\n            record_actions: vec![[None;128];16],')
    source = source.replace('impl Engine {', '''impl Engine {
    /// Audio-thread capture may precede or follow the UI's input record command.
    pub fn recorded_action(&mut self,track:usize,message:&str){
        let Some((pitch,actions))=crate::recorded_actions::parse(message) else{return;};
        if track>=self.tracks.len(){return;}
        if let Some(note)=self.rec_pending.iter_mut().chain(self.rec_tail.iter_mut())
            .find(|note|note.track==track&&note.pitch==pitch&&!note.rendered&&note.actions.is_none()){
            note.actions=Some(actions);
        }else{self.record_actions[track][pitch as usize]=Some(actions);}
    }
''',1)
    # Capture and recording share the same onset; consume after both have read it.
    source=source.replace('actions: self.record_actions[track][pitch as usize].take(),','actions: self.record_actions[track][pitch as usize],')
    source=replace_once(source,'        self.rec_pending.push(RecPending {','        let actions=self.record_actions[track][pitch as usize].take();\n        self.rec_pending.push(RecPending {')
    pos: int=source.index('let actions=self.record_actions')
    source=source[:pos]+source[pos:].replace('actions: self.record_actions[track][pitch as usize],','actions,',1)
    source=source.replace('                        out.push(if n.rendered {OutEvent::RenderedOn', '                        out.push(OutEvent::RecordedActions {track:ti as u8,pitch:emit_pitch,actions:if n.rendered {None} else {n.actions}});\n                        out.push(if n.rendered {OutEvent::RenderedOn')
    path.write_text(source)
    path=core/'persist.rs'
    source=path.read_text().replace('    engine.follower_inputs.fill(None);','    engine.follower_inputs.fill(None);\n    engine.record_actions.fill([None;128]);')
    source=source.replace('            for (index,note) in c.notes.iter().enumerate() {','''            for (index,note) in c.notes.iter().enumerate() {
                if let Some(actions)=note.actions {
                    s.push_str(&format!("ra {} {} {} {}\\n",ti,ci,index,crate::recorded_actions::payload(0,actions)));
                }''')
    source=source.replace('        match it.next() {','''        match it.next() {
            Some("ra")=>{
                if let (Some(track),Some(clip),Some(note),Some(message))=(it.next().and_then(|v|v.parse::<usize>().ok()),it.next().and_then(|v|v.parse::<usize>().ok()),it.next().and_then(|v|v.parse::<usize>().ok()),it.next()){
                    if let (Some((_,actions)),Some(target))=(crate::recorded_actions::parse(&format!("ra1,{}",message)),engine.tracks.get_mut(track).and_then(|t|t.clips.get_mut(clip)).and_then(|c|c.notes.get_mut(note))){
                        if !target.rendered {target.actions=Some(actions);}
                    }
                }
            },''',1)
    path.write_text(source)
    path=root/'engine/crates/movy-dsp/src/lib.rs'
    source=path.read_text().replace('impl Instance {','''impl Instance {
    fn collect_recorded_actions(&mut self){
        for track in 0..self.engine.tracks.len(){
            if self.engine.follower_inputs[track].is_none(){continue;}
            for _ in 0..64 {
                let Some(message)=self.chains.get_param(track,"midi_fx1:hb_record_action") else {break;};
                if !message.starts_with("ra1,"){break;}
                self.engine.recorded_action(track,&message);
            }
        }
    }
''',1)
    source=source.replace('self.engine.follower_input_context(&context);','self.engine.follower_input_context(&context);\n        self.collect_recorded_actions();')
    source=source.replace('            match self.out[i] {','''            match self.out[i] {
                OutEvent::RecordedActions {track,pitch,actions}=>{
                    if let Some(slot)=chain_for(track,self.movy_tracks){
                        if let Some(actions)=actions{self.chains.set_param(slot,"midi_fx1:hb_movy_actions",&seq_core::recorded_actions::payload(pitch,actions));}
                        else{self.chains.set_param(slot,"midi_fx1:hb_movy_actions_clear",&pitch.to_string());}
                    }
                },''',1)
    path.write_text(source)
    path=core/'engine.rs'
    source=path.read_text()
    source=source.replace('        let actions=self.record_actions[track][pitch as usize].take();\n','')
    source=source.replace('        self.capture_push(track, pitch, vel, true);','        self.capture_push(track, pitch, vel, true);\n        let actions=self.record_actions.get_mut(track).and_then(|notes|notes.get_mut(pitch as usize)).and_then(Option::take);')
    source+=(assets/'engine_tests.rs').read_text()
    path.write_text(source)
    patch_recorded_intervals(root)


def patch_recorded_intervals(root: Path) -> None:
    """Record clip-reader intervals without altering stored input notes."""
    core: Path=root/'engine/crates/seq-core/src'
    path: Path=core/'clip.rs'
    source: str=path.read_text().replace('pub struct Clip {','pub struct Clip {\n    pub operation_intervals: Vec<crate::recorded_actions::Interval>,')
    source=source.replace('        Clip {','        Clip {\n            operation_intervals: Vec::new(),')
    path.write_text(source)
    path=core/'engine.rs'
    source=path.read_text().replace('if !self.playing || (self.recording && self.rec_track == track) { return; }','if !self.playing { return; }')
    source=source.replace('            if self.recording && self.rec_track == ti { self.hb_perform_reset(ti); }','''            if self.recording && self.rec_track == ti {
                if let Some(gesture)=self.hb_performance[ti].slots.iter().flatten().max_by_key(|gesture|gesture.order).copied(){
                    let lane=self.hb_performance[ti].slots.iter().position(|entry|entry.is_some_and(|item|item.order==gesture.order)).unwrap_or(0) as u8;
                    let intervals=&mut self.tracks[ti].clips[slot].operation_intervals;
                    let next=crate::recorded_actions::Interval {start:pos,length:1,origin:gesture.origin,age:gesture.age,lane,operation:gesture.operation,amount:gesture.amount,grid:gesture.grid};
                    if let Some(last)=intervals.last_mut().filter(|last|last.start+last.length==pos&&last.lane==lane&&last.operation==next.operation&&last.amount==next.amount&&last.grid==next.grid&&last.origin==next.origin&&last.age+last.length as u64==next.age){last.length+=1;}
                    else if intervals.len()<4096{intervals.push(next);}
                    self.dirty=true;
                }
            }''')
    source=source.replace('let hb_window = self.hb_performance[ti].advance(slot,clip.loop_start_ticks(),clip.length_ticks(),pos);','''let hb_window = self.hb_performance[ti].advance(slot,clip.loop_start_ticks(),clip.length_ticks(),pos)
                .or_else(||clip.operation_intervals.iter().rev().find_map(|interval|interval.window(pos,slot,clip.loop_start_ticks(),clip.length_ticks())));''')
    # Retrospective input capture keeps the same immutable actions as live takes.
    source=source.replace('clip.notes.last_mut().unwrap().input_key=ev.input_key;', 'clip.notes.last_mut().unwrap().actions=ev.actions; clip.notes.last_mut().unwrap().input_key=ev.input_key;')
    path.write_text(source)
    path=core/'persist.rs'
    source=path.read_text().replace('            for (index,note) in c.notes.iter().enumerate() {','''            for interval in &c.operation_intervals {
                s.push_str(&format!("oi {} {} {} {} {} {} {} {} {} {}\\n",ti,ci,interval.start,interval.length,interval.origin,interval.age,interval.lane,interval.operation,interval.amount,interval.grid));
            }
            for (index,note) in c.notes.iter().enumerate() {''')
    source=source.replace('        match it.next() {','''        match it.next() {
            Some("oi")=>{
                let fields:Vec<i64>=it.map(str::parse).collect::<Result<_,_>>().unwrap_or_default();
                if let [track,clip,start,length,origin,age,lane,operation,amount,grid]=fields.as_slice(){
                    if *track>=0&&*clip>=0&&*start>=0&&*start<=u32::MAX as i64&&*length>0&&*length<=u32::MAX as i64&&*origin>=0&&*origin<=u32::MAX as i64&&*age>=0&&(0..16).contains(lane)&&(12..=15).contains(operation)&&(-400..=400).contains(amount)&&(1..=1536).contains(grid){
                        if let Some(target)=engine.tracks.get_mut(*track as usize).and_then(|track|track.clips.get_mut(*clip as usize)){
                            if target.operation_intervals.len()<4096{target.operation_intervals.push(crate::recorded_actions::Interval{start:*start as u32,length:*length as u32,origin:*origin as u32,age:*age as u64,lane:*lane as u8,operation:*operation as u8,amount:*amount as i32,grid:*grid as u32});}
                        }
                    }
                }
            },''',1)
    path.write_text(source)
    path=core/'clip.rs'
    source=path.read_text().replace('    pub fn clear(&mut self) {','    pub fn clear(&mut self) {\n        self.operation_intervals.clear();')
    source=source.replace('        self.length_steps = len * 2;','''        let copies:Vec<_>=self.operation_intervals.iter().filter(|item|item.start>=start as u32*TICKS_PER_STEP&&item.start<(start+len) as u32*TICKS_PER_STEP).map(|item|{
            let mut copy=*item;copy.start+=span_ticks;copy.origin+=span_ticks;copy
        }).collect();
        self.operation_intervals.extend(copies.into_iter().take(4096usize.saturating_sub(self.operation_intervals.len())));
        self.length_steps = len * 2;''')
    path.write_text(source)
    path=root/'engine/crates/movy-dsp/src/chain_slots.rs'
    source=path.read_text().replace('if key.starts_with("midi_fx1:") { self.hb_config_dirty[slot] = true; }','if key.starts_with("midi_fx1:motion_") {self.hb_config_dirty.fill(true);} else if key.starts_with("midi_fx1:") { self.hb_config_dirty[slot] = true; }')
    path.write_text(source)
    source=path.read_text().replace('if key.starts_with("midi_fx1:") && key!="midi_fx1:hb_movy_input_role" { self.hb_config_dirty[slot] = true; }','if key.starts_with("midi_fx1:motion_") {self.hb_config_dirty.fill(true);} else if key.starts_with("midi_fx1:") && !key.starts_with("midi_fx1:hb_movy_input") && !key.starts_with("midi_fx1:hb_movy_actions") {self.hb_config_dirty[slot]=true;}')
    path.write_text(source)
