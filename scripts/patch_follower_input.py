"""Persist follower input coordinates and project them before HB generation."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_follower_input(root: Path) -> None:
    """Keep source context on notes, captures, copies, and recording tails."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/input-roles'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'follower_input.rs').write_text((assets / 'follower_input.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod follower_input;\n')
    path = core / 'clip.rs'
    source: str = path.read_text().replace('pub struct Note {', 'pub struct Note {\n    pub input_key: Option<crate::follower_input::InputKey>,')
    source = source.replace('rendered: n.rendered,', 'input_key: n.input_key, rendered: n.rendered,')
    source = source.replace('pub struct Clip {', 'pub struct Clip {\n    pub input_key: Option<crate::follower_input::InputKey>,')
    source = source.replace('        Clip {', '        Clip {\n            input_key: None,')
    source = source.replace('rendered: false,', 'input_key: self.input_key, rendered: false,')
    path.write_text(source)
    path = core / 'clip_tools.rs'
    path.write_text(path.read_text().replace('rendered: false,', 'input_key: None, rendered: false,'))
    path = core / 'capture.rs'
    source = path.read_text().replace('CapEvent { frame,', 'CapEvent { input_key: None, frame,').replace('pub struct CapEvent {', 'pub struct CapEvent {\n    pub input_key: Option<crate::follower_input::InputKey>,')
    path.write_text(source)
    path = core / 'engine.rs'
    source = path.read_text()
    source = source.replace('pub enum OutEvent {', 'pub enum OutEvent {\n    InputRole {track:u8,pitch:u8,degree:i8,target:i16},')
    for declaration in ['struct RecPending {', 'struct ClipboardNote {']:
        source = source.replace(declaration, declaration+'\n    input_key: Option<crate::follower_input::InputKey>,')
    source = source.replace('pub struct Engine {', 'pub struct Engine {\n    pub follower_inputs: [Option<crate::follower_input::InputKey>;16],')
    source = replace_once(source, '            hb_performance: vec!', '            follower_inputs: [None;16],\n            hb_performance: vec!')
    source = replace_once(source, 'impl Engine {', '''impl Engine {
    /// One global source context; role mask keeps conductors and drums absolute.
    pub fn follower_input_context(&mut self, message: &str) {
        let context=crate::follower_input::parse(message);
        for track in 0..self.tracks.len() {
            let key=context.and_then(|(key,mask)| (mask & (1<<track)!=0 && !self.track_is_drum(track)).then_some(key));
            self.follower_inputs[track]=key;
            for clip in &mut self.tracks[track].clips {
                if clip.input_key==key {continue;}
                clip.input_key=key;
            if let Some(key)=key {
                for note in &mut clip.notes {
                    if !note.rendered && note.input_key.is_none() { note.input_key=Some(key); self.dirty=true; }
                }
            }
            }
        }
    }
''')
    source = source.replace('pressure: n.pressure.clone(),\n                rel_step:', 'input_key: n.input_key, pressure: n.pressure.clone(),\n                rel_step:')
    source = source.replace('clip.notes.last_mut().unwrap().pressure=cn.pressure;', 'clip.notes.last_mut().unwrap().input_key=cn.input_key; clip.notes.last_mut().unwrap().pressure=cn.pressure;')
    source = source.replace('let ev = CapEvent {', 'let ev = CapEvent {\n            input_key: self.follower_inputs[track].map(|mut key|{key.transpose=self.active_clip_transpose(track) as i8;key}),')
    source = source.replace('p.pitch as i32 - self.clip_transpose(p.track, p.slot)', 'p.pitch as i32 - p.input_key.map_or(self.clip_transpose(p.track,p.slot),|key|key.transpose as i32)')
    source = source.replace('ev.pitch as i32 - transpose', 'ev.pitch as i32 - ev.input_key.map_or(transpose,|key|key.transpose as i32)')
    source = source.replace('self.rec_pending.push(RecPending {', 'self.rec_pending.push(RecPending {\n            input_key: self.follower_inputs[track].map(|mut key|{key.transpose=self.active_clip_transpose(track) as i8;key}),')
    source = source.replace('note.rendered=true;', 'note.rendered=true; note.input_key=None;')
    source = source.replace('clip.notes.last_mut().unwrap().pressure=p.pressure', 'clip.notes.last_mut().unwrap().input_key=if p.rendered {None} else {p.input_key};\n            clip.notes.last_mut().unwrap().pressure=p.pressure')
    # Both stopped Capture and playing Capture carry note-on context.
    source = source.replace('            self.tracks[track]\n                .active_mut()\n                .add_note_raw(step, tick, gate, stored, ev.vel);', '''            let clip=self.tracks[track].active_mut();let count=clip.notes.len();
            clip.add_note_raw(step,tick,gate,stored,ev.vel);
            if clip.notes.len()>count { clip.notes.last_mut().unwrap().input_key=ev.input_key; }''')
    source = replace_once(source, '''                        let emit_pitch =
                            (n.pitch as i32 + self.clip_transpose(ti, slot)).clamp(0, 127) as u8;''', '''                        let input_pitch=if !n.rendered {
                            match (n.input_key,self.follower_inputs[ti]) {
                                (Some(source),Some(target))=>source.project(n.pitch,target),
                                _=>n.pitch,
                            }
                        } else {n.pitch};
                        let emit_pitch =
                            (input_pitch as i32 + self.clip_transpose(ti, slot)).clamp(0, 127) as u8;
                        if !n.rendered && self.follower_inputs[ti].is_some() {
                            let (degree,target)=match (n.input_key,self.follower_inputs[ti]) {
                                (Some(source),Some(target)) if self.clip_transpose(ti,slot)==source.transpose as i32=>source.role(n.pitch,target),
                                _=>(-1,-1),
                            };
                            out.push(OutEvent::InputRole {track:ti as u8,pitch:emit_pitch,degree,target});
                        }''')
    source += (assets / 'engine_tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = path.read_text()
    source = source.replace('if key.starts_with("midi_fx1:") {', 'if key.starts_with("midi_fx1:") && key!="midi_fx1:hb_movy_input_role" {')
    source = replace_once(source, '    pub fn hb_invalidate_auto(&mut self)', '''    /// One compact global context, no per-pad or per-track snapshot walks.
    pub fn hb_input_context(&mut self) -> String {
        for instance in self.slots.iter_mut().flatten() {
            if let Some(message)=instance.get_param("midi_fx1:follower_input_context") {
                if message.starts_with("fic1,") {return message;}
            }
        }
        String::new()
    }
    pub fn hb_invalidate_auto(&mut self)''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, '            "cmd" => {', '''            "cmd" => {
                let context=self.chains.hb_input_context();
                self.engine.follower_input_context(&context);''')
    source = replace_once(source, '            match self.out[i] {', '''            match self.out[i] {
                OutEvent::InputRole {track,pitch,degree,target}=>{
                    if let Some(slot)=chain_for(track,self.movy_tracks) {
                        self.chains.set_param(slot,"midi_fx1:hb_movy_input_role",&format!("{},{},{}",pitch,degree,target));
                    }
                },''')
    source = replace_once(source, '        self.blocks += 1;', '''        self.blocks += 1;
        let context=self.chains.hb_input_context();
        self.engine.follower_input_context(&context);''')
    path.write_text(source)
    path = core / 'persist.rs'
    source = path.read_text().replace('    engine.hb_auto.fill([None;16]);', '    engine.hb_auto.fill([None;16]);\n    engine.follower_inputs.fill(None);')
    source = replace_once(source, '            for (index,note) in c.notes.iter().enumerate() {', '''            for (index,note) in c.notes.iter().enumerate() {
                if let Some(key)=note.input_key {
                    s.push_str(&format!("fi {} {} {} {} {} {}\\n",ti,ci,index,key.root,key.scale,key.transpose));
                }''')
    # Separate optional record preserves old save syntax and ignores malformed metadata.
    source = replace_once(source, '        match it.next() {', '''        match it.next() {
            Some("fi") => {
                let values: Vec<i32>=it.filter_map(|field|field.parse().ok()).collect();
                if (values.len()==5 || values.len()==6) && values[..4].iter().all(|&value|value>=0) && values[0]<(engine.tracks.len() as i32) && values[1]<8 && values[3]<12 && (1..=9).contains(&values[4]) && values.get(5).map_or(true,|offset|(-36..=36).contains(offset)) {
                    if let Some(note)=engine.tracks[values[0] as usize].clips[values[1] as usize].notes.get_mut(values[2] as usize) {
                        if !note.rendered { note.input_key=crate::follower_input::InputKey::new(values[3] as u8,values[4] as u8).map(|mut key|{key.transpose=values.get(5).copied().unwrap_or(0) as i8;key}); }
                    }
                }
            },''')
    path.write_text(source)
