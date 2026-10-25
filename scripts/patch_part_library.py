"""Install clip-scoped part presets through Movy's existing scheduler and parameter path."""
from pathlib import Path
from typing import Any
import json
from patch_responsive_persistence import replace_once


def generate_catalog(assets: Path, fields: list[dict[str, Any]]) -> str:
    """Compile the one authored catalog into static native data, without runtime parsing."""
    catalog: dict[str, list[dict[str, Any]]] = json.loads((assets / 'catalog.json').read_text())
    map_key_to_index: dict[str, int] = {field['key']: index for index, field in enumerate(fields)}
    lines: list[str] = ['// Generated from catalog.json; edit that source instead.']
    for kind, entries in catalog.items():
        names: str = ','.join(json.dumps(entry['recipe']) for entry in entries)
        lines.append(f"pub const {'NAMES' if kind == 'comp' else 'BASS_NAMES'}:[&str;{len(entries)}]=[{names}];")
        lines.append(f'const {kind.upper()}:&[Pattern]=&[')
        for entry in entries:
            notes: list[list[int]] = entry['notes']
            steps: int = entry['steps']
            if not 1 <= steps <= 256 or not notes or len(notes) > 512:
                raise ValueError('Invalid catalog clip size')
            for step, gate, pitch, velocity in notes:
                if not (0 <= step < steps and 1 <= gate <= steps * 24 and 0 <= pitch <= 127 and 1 <= velocity <= 127):
                    raise ValueError('Invalid catalog note')
            overrides: list[str] = []
            for key, value in entry['settings'].items():
                index: int = map_key_to_index[key]
                if not fields[index]['min'] <= value <= fields[index]['max']:
                    raise ValueError('Invalid catalog renderer setting')
                overrides.append(f'({index},{value})')
            encoded_notes: str = ','.join('(' + ','.join(map(str, note)) + ')' for note in notes)
            lines.append(f"Pattern{{name:{json.dumps(entry['recipe'])},steps:{steps},notes:&[{encoded_notes}],settings:&[{','.join(overrides)}]}},")
        lines.append('];')
    return '\n'.join(lines) + '\n'


def patch_part_library(root: Path) -> None:
    """Add the versioned preset format, native loader, and Chord Play access."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/part-library'
    core: Path = root / 'engine/crates/seq-core/src'
    fields: list[dict[str, Any]] = json.loads((assets / 'settings.json').read_text())
    (core / 'part_catalog_data.rs').write_text(generate_catalog(assets, fields))
    keys: str = ','.join(json.dumps(field['key']) for field in fields)
    defaults: str = ','.join(str(field['default']) for field in fields)
    limits: str = ','.join(f"({field['min']},{field['max']})" for field in fields)
    options: str = ','.join('&[' + ','.join(json.dumps(value) for value in field.get('options', [])) + ']' for field in fields)
    generated: str = f'''//! Generated from the shared, versioned library settings schema.
pub const COUNT:usize={len(fields)};
pub const KEYS:[&str;COUNT]=[{keys}];
const LIMITS:[(i16,i16);COUNT]=[{limits}];
pub const OPTIONS:[&[&str];COUNT]=[{options}];
#[derive(Clone,Copy,Debug,PartialEq,Eq)]
pub struct Settings(pub [i16;COUNT]);
impl Settings {{
    pub fn comp()->Self {{Self([{defaults}])}}
    pub fn parse(text:&str)->Option<Self>{{
        let values:Vec<i16>=text.split(',').map(str::parse).collect::<Result<_,_>>().ok()?;
        let settings=Self(values.try_into().ok()?);
        settings.0.iter().enumerate().all(|(index,value)|(LIMITS[index].0..=LIMITS[index].1).contains(value)).then_some(settings)
    }}
    pub fn value(index:usize,text:&str)->Option<i16>{{
        let options=*OPTIONS.get(index)?;
        let value=options.iter().position(|option|*option==text).map(|value|value as i16).or_else(||text.parse().ok())?;
        (LIMITS[index].0..=LIMITS[index].1).contains(&value).then_some(value)
    }}
    pub fn wire(self)->String{{self.0.iter().map(i16::to_string).collect::<Vec<_>>().join(",")}}
    pub fn mapped(self)->bool{{self.0[0]==1&&matches!(self.0[1],1|5)}}
    pub fn label(index:usize,value:i16)->String{{OPTIONS[index].get(value as usize).map_or_else(||value.to_string(),|text|text.to_string())}}
}}
'''
    (core / 'part_settings.rs').write_text(generated)
    for filename in ('clip_recipe.rs', 'part_catalog.rs', 'part_load.rs', 'part_tests.rs'):
        (core / filename).write_text((assets / filename).read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod part_settings;\npub mod clip_recipe;\npub mod part_catalog;\npub mod part_load;\n#[cfg(test)] mod part_tests;\n')
    path = core / 'clip.rs'
    source: str = replace_once(path.read_text(), 'pub struct Clip {', 'pub struct Clip {\n    pub recipe: Option<crate::clip_recipe::Recipe>,')
    source = replace_once(source, '        Clip {', '        Clip {\n            recipe: None,')
    source = replace_once(source, '    pub fn clear(&mut self) {', '    pub fn clear(&mut self) {\n        self.recipe=None;')
    path.write_text(source)
    path = core / 'engine.rs'
    source = replace_once(path.read_text(), 'pub enum OutEvent {', 'pub enum OutEvent {\n    RecipeLanes {track:u8},\n    RecipeCapture {track:u8},\n    RecipeParam {track:u8,key:u8,value:i16},')
    source = replace_once(source, '    pub motif_load_result:', '    pub recipe_bases:[Option<crate::part_settings::Settings>;16],\n    pub recipe_seen:[Option<crate::part_settings::Settings>;16],\n    pub recipe_fallbacks:[Option<crate::part_settings::Settings>;16],\n    pub part_result:String,\n    pub motif_load_result:')
    source = replace_once(source, '            motif_load_result:', '            recipe_bases:[None;16],recipe_seen:[None;16],recipe_fallbacks:[None;16],part_result:String::new(),\n            motif_load_result:')
    source = replace_once(source, '            self.source_automation_tick(out);', '            self.recipe_tick(out);\n            self.source_automation_tick(out);')
    source = replace_once(source, '    pub fn undo_snapshot(&self) -> String {', '    pub fn part_recording_busy(&self)->bool {self.recording||self.pending_rec||self.count_in_left>0}\n    pub fn undo_snapshot(&self) -> String {')
    source = replace_once(source, '                        let mut gate_override = gate_override;', '''                        let mut gate_override = gate_override;
                        if let Some(recipe)=self.tracks[ti].clips[self.recipe_slot(ti)].recipe.as_ref() {
                            let duration=gate_override.unwrap_or_else(||hb_window.map_or(n.gate.max(1),|window|window.duration(n.gate)));
                            gate_override=Some(((duration as u64*recipe.gate as u64)/100).clamp(1,u32::MAX as u64) as u32);
                        }''')
    path.write_text(source)
    path = core / 'persist.rs'
    source = replace_once(path.read_text(), '        for lane in 0..8 {', '        if let Some(settings)=engine.recipe_bases[ti] {s.push_str(&format!("pb1 {} {}\\n",ti,settings.wire()));}\n        for lane in 0..8 {')
    source = replace_once(source, '            for gate in &c.grid_gates', '            if let Some(recipe)=&c.recipe {s.push_str(&format!("pr1 {} {} {}\\n",ti,ci,recipe.wire()));}\n            for gate in &c.grid_gates')
    source = replace_once(source, '    engine.host_transport_attached = false;', '    engine.recipe_bases.fill(None);\n    engine.host_transport_attached = false;')
    source = replace_once(source, '            Some("cp") => {', '''            Some("pb1")=>{
                if let (Some(track),Some(settings))=(it.next().and_then(|value|value.parse::<usize>().ok()),it.next().and_then(crate::part_settings::Settings::parse)) {
                    if track<16 {engine.recipe_bases[track]=Some(settings);}
                }
            },
            Some("pr1")=>{
                if let (Some(track),Some(slot))=(it.next().and_then(|value|value.parse::<usize>().ok()),it.next().and_then(|value|value.parse::<usize>().ok())) {
                    if let Some(clip)=engine.tracks.get_mut(track).and_then(|track|track.clips.get_mut(slot)) {
                        clip.recipe=crate::clip_recipe::Recipe::parse(&it.collect::<Vec<_>>().join(" "));
                    }
                }
            },
            Some("cp") => {''')
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text().replace('| "mload" |', '| "mload" | "pload" | "pshape" |')
    source = replace_once(source, '        "mload" =>', '        "pload" => engine.part_load(op,out),\n        "pshape" => engine.recipe_shape(op),\n        "mload" =>')
    source = replace_once(source, '            engine.reseed_empty_clips();', '            engine.reseed_empty_clips();\n            if !is_undo_ring_verb(verb)||verb=="uswap" {engine.recipe_tick(out);}')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(), '                OutEvent::GridMask{', '''                OutEvent::RecipeParam{track,key,value}=>{
                    if let Some(slot)=chain_for(track,self.movy_tracks){if self.chains.get_param(slot,"midi_fx1_module").as_deref()==Some("harmonybus"){self.chains.set_param(slot,&format!("midi_fx1:{}",seq_core::part_settings::KEYS[key as usize]),&seq_core::part_settings::Settings::label(key as usize,value));}}
                },
                OutEvent::RecipeLanes{track}=>{
                    if let Some(slot)=chain_for(track,self.movy_tracks){
                        let target=&self.engine.tracks[track as usize];
                        for lane in 0..8 {if target.lane_assigned[lane] {
                            let name=&target.lane_label[lane];
                            if let Some(field)=name.strip_prefix("mix:").and_then(mixer::MixField::parse) {self.chains.set_mix_lane(slot,lane as u8,field);}
                            else {self.chains.clear_mix_lane(slot,lane as u8);self.chains.set_param(slot,&format!("knob_{}_set",lane+1),name);}
                        }}
                    }
                },
                OutEvent::RecipeCapture{track}=>{
                    if let Some(slot)=chain_for(track,self.movy_tracks){
                        let values:Option<Vec<i16>>=seq_core::part_settings::KEYS.iter().enumerate().map(|(index,key)|self.chains.get_param(slot,&format!("midi_fx1:{key}")).and_then(|value|seq_core::part_settings::Settings::value(index,&value))).collect();
                        if let Some(values)=values {if let Ok(values)=values.try_into(){self.engine.recipe_bases[track as usize]=Some(seq_core::part_settings::Settings(values));self.engine.dirty=true;}}
                    }
                },
                OutEvent::GridMask{''')
    source = replace_once(source, '                OutEvent::Cc { track, lane, val } => {', '''                OutEvent::Cc { track, lane, val } => {
                    let target=&self.engine.tracks[track as usize];
                    if target.clips[self.engine.recipe_slot(track as usize)].recipe.is_some()&&matches!(target.lane_label[lane as usize].as_str(),"midi_fx1:travel_map"|"midi_fx1:track_role"|"midi_fx1:role") {continue;}''')
    source = replace_once(source, '                        self.chains.set_param(slot, rest, val);' , '''                        if self.engine.recipe_bases.get(slot).is_some_and(Option::is_some) {self.drain_out();}
                        if rest.strip_prefix("midi_fx1:").map_or(true,|key|self.engine.recipe_edit_param(slot,key,val)) {self.chains.set_param(slot, rest, val);}''')
    source = replace_once(source, '            "motif_load_result" =>', '''            "part_result" => Some(self.engine.part_result.clone()),
            key if key.starts_with("part_export_")=>key[12..].parse::<usize>().ok().map(|track|self.engine.part_export(track)),
            key if key.starts_with("part_info_")=>key[10..].parse::<usize>().ok().map(|track|self.engine.recipe_info(track)),
            "motif_load_result" =>''')
    source = replace_once(source, '                if seq_core::persist::load(&mut self.engine, val) {', '                self.engine.recipe_seen.fill(None);self.engine.recipe_fallbacks.fill(None);\n                if seq_core::persist::load(&mut self.engine, val) {\n                    self.engine.recipe_tick(&mut self.out);')
    # A freshly loaded HB instance needs the active recipe once after restore.
    source = replace_once(source, 'self.chains.set_state(slot, component, val);', 'self.chains.set_state(slot, component, val);\n                        if component=="midi_fx1"&&slot<16 {self.engine.recipe_seen[slot]=None;}')
    source = replace_once(source, '        self.chains.service_loads();', '''        let recipe_generation=self.chains.generation();
        self.chains.service_loads();
        if recipe_generation!=self.chains.generation() {self.engine.recipe_seen.fill(None);self.engine.recipe_tick(&mut self.out);self.drain_out();}''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/joint_links.rs'
    source = path.read_text().replace('chord: Option<(usize,usize,bool)>', 'chord: Option<(usize,usize,u8)>')
    source = source.replace('fields[2]>1', 'fields[2]>2').replace('fields[2]!=0));if next==self.chord', 'fields[2] as u8));if next==self.chord')
    source = source.replace('return if follow {', 'return if follow==1 {')
    source = source.replace('let output=if source {', 'let output=if self.chord.is_some_and(|(_,comp,mode)|comp==track&&mode==2) {None} else if source {')
    source = replace_once(source, '    chord: Option<(usize,usize,u8)>,', '    chord: Option<(usize,usize,u8)>,\n    chord_bass:Option<usize>,')
    source = replace_once(source, 'Self {chord:None,', 'Self {chord_bass:None,chord:None,')
    source = replace_once(source, 'self.chord=None;return true;', 'self.chord=None;self.chord_bass=None;return true;')
    source = replace_once(source, 'if fields.len()!=3||', 'if !matches!(fields.len(),3|4)||')
    source = replace_once(source, 'let next=Some((fields[0],fields[1],fields[2] as u8));if next==self.chord{return false;}self.chord=next;true', '''let bass=fields.get(3).copied();
        if bass.is_some_and(|track|track>=16||track==fields[0]||track==fields[1]){return false;}
        let next=Some((fields[0],fields[1],fields[2] as u8));if next==self.chord&&bass==self.chord_bass{return false;}self.chord=next;self.chord_bass=bass;true''')
    source = replace_once(source, '|(target,_)|target==comp)', '|(target,_)|target==comp||Some(target)==self.chord_bass)')
    source = replace_once(source, 'else if self.chord.is_some_and(|(_,comp,_)|comp==track) {Some(pitch)}', 'else if self.chord.is_some_and(|(_,comp,_)|comp==track)||self.chord_bass==Some(track) {Some(pitch)}')
    source += "\n#[cfg(test)] mod part_route_tests {use super::*;#[test] fn direct_chords_suppress_clip_attacks_without_losing_old_releases(){let mut links=JointLinks::new();links.set_chord(\"3,2,0\");assert_eq!(links.playback_pitch(2,60,true),Some(60));links.set_chord(\"3,2,2\");assert_eq!(links.playback_pitch(2,60,false),Some(60));assert_eq!(links.playback_pitch(2,60,true),None);assert_eq!(links.playback_pitch(2,60,false),None);links.set_chord(\"3,2,0\");assert_eq!(links.playback_pitch(2,60,true),Some(60));}}\n"
    source += (assets / 'bass_route_tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/hb_loop.rs'
    source = replace_once(path.read_text(), '    hash(&mut revision, 0x48424c4f4f5032);', '''    hash(&mut revision, 0x48424c4f4f5033);
    if let Some(recipe)=&clip.recipe {hash(&mut revision,recipe.gate as u64);for value in recipe.settings.0 {hash(&mut revision,value as i64 as u64);}}''')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'mload',", "'mload', 'pload', 'pshape',"))
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-chord-play2', '0.71.0-part-library2'))
    for filename in ('part-library.ts', 'part-controls.ts', 'part-storage.ts'):
        (root / 'src/seq' / filename).write_text((assets / filename).read_text())
    (root / 'src/seq/part-settings.json').write_text((assets / 'settings.json').read_text())
    (root / 'src/seq/part-catalog.json').write_text((assets / 'catalog.json').read_text())
    path = root / 'src/undo/ui-fields.ts'
    source = "import { chordCompState, restoreChordCompState } from '../seq/chord-play.js';\n" + path.read_text()
    source = source.replace("'defaultQuant';", "'defaultQuant' | 'chordComp';")
    source = replace_once(source, 'export function readUiField(f: UiField): string {', "export function readUiField(f: UiField): string {\n    if(f==='chordComp')return chordCompState();")
    source = replace_once(source, 'export function writeUiField(f: UiField, v: string): void {', "export function writeUiField(f: UiField, v: string): void {\n    if(f==='chordComp'){restoreChordCompState(v);return;}")
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/part-library.ts'),\n        resolve(root, 'src/seq/part-storage.ts'),\n        resolve(root, 'src/seq/part-controls.ts'),"))
    (root / 'browser-test/hb-part-library.mjs').write_text((assets / 'hb-part-library.mjs').read_text())
