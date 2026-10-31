"""Install temporary actor performance sources and ordinary recorded recipes."""
from pathlib import Path
from typing import Any
import json
from patch_responsive_persistence import replace_once


def patch_comp_generator(root: Path) -> None:
    """Extend the shared clock, note emission, named lanes and persistence."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/comp-generator'
    core: Path = root / 'engine/crates/seq-core/src'
    styles: list[dict[str, Any]] = json.loads((assets / 'styles.json').read_text())
    catalog: dict[str, list[dict[str, Any]]] = json.loads((assets.parent / 'part-library/catalog.json').read_text())
    settings: list[dict[str, Any]] = json.loads((assets.parent / 'part-library/settings.json').read_text())
    map_key_to_index: dict[str, int] = {field['key']: index for index, field in enumerate(settings)}
    bass_off_keys: list[int] = [map_key_to_index[key] for key in ('chord_mode','arp_playback','arp_hold','rhythm_gen_pattern')]
    if not 1 <= len(styles) <= 128:
        raise ValueError('Generator styles must fit the existing automation lane')
    rows: list[str] = []
    for style in styles:
        actor: str = style['actor'].lower()
        if actor not in catalog or not 0 <= style['catalog'] < len(catalog[actor]):
            raise ValueError('Unknown generator actor/catalog source')
        pattern: dict[str, Any] = catalog[actor][style['catalog']]
        steps: int = pattern['steps']
        if steps not in (16, 32, 64):
            raise ValueError('Generator phrases must span one, two or four bars')
        essential_steps: set[int] = {note[0] for note in pattern['notes']}
        if len(essential_steps) != len(pattern['notes']):
            raise ValueError('Generator source must have at most one attack per step')
        optional_steps: set[int] = set()
        for step, gate, pitch, velocity, threshold in style['optional']:
            if step in essential_steps or step in optional_steps or not (0 <= step < steps and 1 <= gate <= steps * 24 and 0 <= pitch <= 127 and 1 <= velocity <= 127 and 1 <= threshold <= 127):
                raise ValueError('Invalid or colliding generator detail')
            optional_steps.add(step)
        optional: str = ','.join('(' + ','.join(map(str, attack)) + ')' for attack in style['optional'])
        rows.append(f'Style{{name:{json.dumps(style["name"])},bass:{str(style["actor"] == "Bass").lower()},catalog:{style["catalog"]},optional:&[{optional}]}}')
    (core / 'generator_styles.rs').write_text('pub const STYLES:&[Style]=&[' + ','.join(rows) + '];\npub const BASS_OFF_KEYS:[usize;4]=[' + ','.join(map(str,bass_off_keys)) + '];\n')
    (core / 'generator.rs').write_text((assets / 'generator.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod generator;\n')
    path = core / 'part_catalog.rs'
    path.write_text(path.read_text() + '\npub fn generator_source_notes(bass:bool,choice:usize)->&\'static [(u16,u32,u8,u8)] {(if bass{BASS}else{COMP}).get(choice).map_or(&[],|pattern|pattern.notes)}\n')
    path.write_text(path.read_text() + '\npub fn generator_source_steps(bass:bool,choice:usize)->u16 {(if bass{BASS}else{COMP}).get(choice).map_or(16,|pattern|pattern.steps)}\n')
    path = core / 'clip.rs'
    source: str = replace_once(path.read_text(),'pub struct Clip {','pub struct Clip {\n    pub generator:Option<crate::generator::Config>,')
    source = replace_once(source,'        Clip {','        Clip {\n            generator:None,')
    source = replace_once(source,'    pub fn clear(&mut self) {','    pub fn clear(&mut self) {\n        self.generator=None;')
    path.write_text(source)
    path = core / 'engine.rs'
    source = replace_once(path.read_text(),'pub struct Engine {','''pub struct Engine {
    pub generator_explore:[Option<crate::generator::Explore>;16],
    pub generator_library:[Option<crate::part_load::PreparedPart>;16],
    pub generator_restore:[Option<crate::part_settings::Settings>;16],
    pub generator_result:String,
    generator_emitting:bool,''')
    source = replace_once(source,'            variations:', '            generator_explore:[None;16],generator_library:std::array::from_fn(|_|None),generator_restore:[None;16],generator_result:String::new(),generator_emitting:false,\n            variations:')
    source = replace_once(source,'struct Gate {','struct Gate {\n    generated:bool,')
    source = replace_once(source,'self.gates.push(Gate {','self.gates.push(Gate {\n                            generated:self.generator_emitting,')
    source = replace_once(source,'    pub fn clip_transpose(&self, track: usize, slot: usize) -> i32 {','    pub fn clip_transpose(&self, track: usize, slot: usize) -> i32 {\n        if self.generator_free(track) {return 0;}')
    source = replace_once(source,'    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {','    pub fn stop(&mut self, out: &mut Vec<OutEvent>) {\n        self.generator_cancel(out);')
    source = replace_once(source,'    pub fn toggle_record(&mut self, track: usize) {','''    pub fn toggle_record(&mut self, track: usize) {
        if !self.part_recording_busy()&&!self.generator_prepare_record(track) {return;}''')
    source = replace_once(source,'self.rec_empty_start = self.tracks[track].active().notes.is_empty();','self.rec_empty_start = self.tracks[track].active().notes.is_empty()&&self.tracks[track].active().generator.is_none();')
    source = replace_once(source,'            self.rec_tail.append(&mut self.rec_pending);\n            return;', '''            self.rec_tail.append(&mut self.rec_pending);
            if let Some(state)=self.generator_explore[self.rec_track] {if state.take.is_some(){self.generator_finish_take(state);self.generator_explore[self.rec_track]=None;}else{self.generator_explore[self.rec_track].as_mut().unwrap().destination=None;}}
            return;''')
    # Undo restores persistent content while an unrelated free audition stays live.
    source = replace_once(source,'    pub fn undo_restore(&mut self, blob: &str) -> bool {','    pub fn undo_restore(&mut self, blob: &str) -> bool {\n        let live_library=self.generator_library.clone();\n        let live_generators=self.generator_explore.map(|state|state.filter(|state|state.source.is_none()&&state.take.is_none()&&state.destination.is_none()));')
    source = replace_once(source,'        self.key_playback=live_key_playback;', '        self.generator_explore=live_generators;\n        for track in 0..NUM_TRACKS {if live_generators[track].is_some(){self.generator_library[track]=live_library[track].clone();}}\n        self.key_playback=live_key_playback;')
    # One gate countdown implementation, shared by clips and temporary sources.
    start: int = source.index('        let mut gi = 0;',source.index('    fn step_tick('))
    end: int = source.index('        {\n            let drum_fill_lane',start)
    gate_body: str = source[start:end]
    source = source[:start] + '''        if !self.generator_free(ti) {self.advance_note_gates(ti,out);self.generator_tick(ti,out);}
''' + source[end:]
    source += '\nimpl Engine {fn advance_note_gates(&mut self,ti:usize,out:&mut Vec<OutEvent>) {\n' + gate_body + '\n}}\n'
    source = replace_once(source,'            if serviced && clock_serviced &&', '            if (serviced||self.generator_exploring(t)) && (clock_serviced||self.generator_exploring(owner)) &&')
    source = replace_once(source,'            for ti in 0..NUM_TRACKS {\n                let Some(slot)', '''            for ti in 0..NUM_TRACKS {
                if self.generator_free(ti) {self.advance_note_gates(ti,out);self.generator_tick(ti,out);if !(self.recording&&self.records_track(ti)) {continue;}}
                let Some(slot)''')
    source = replace_once(source,'            if !muted {\n                    let len', '            if !muted && !self.generator_free(ti) {\n                    let len')
    source = replace_once(source,'        self.shared_transport(out);','        self.generator_check_target(out);\n        self.shared_transport(out);')
    source = replace_once(source,'            self.recipe_tick(out);','            self.generator_check_target(out);\n            self.recipe_tick(out);')
    # Suppress only incoming weaving while this actor owns a generator source.
    source = replace_once(source,'    fn source_attack(&mut self, rhythm_track: usize, rhythm_slot: usize, duration: u32, out: &mut Vec<OutEvent>) {','    fn source_attack(&mut self, rhythm_track: usize, rhythm_slot: usize, duration: u32, out: &mut Vec<OutEvent>) {')
    source = source.replace('for actor in 0..NUM_TRACKS {\n            let route=self.source_routes[actor];','for actor in 0..NUM_TRACKS {\n            if self.generator_owns(actor) {continue;}\n            let route=self.source_routes[actor];')
    source = source.replace('.recipe.as_ref().filter(|_|!self.drum_output(ti))', '.recipe.as_ref().filter(|_|!self.drum_output(ti)&&!self.generator_free(ti))')
    source = source.replace('&& !(self.recording && self.records_track(ti)) {', '&& (self.generator_owns(ti)||!(self.recording && self.records_track(ti))) {')
    source = replace_once(source, '                if let Some(lv) = clip.lock_at(lane, step) {', '                if clip.generator.is_some() {crate::generator::lane_value(clip,lane,step,base)} else if let Some(lv) = clip.lock_at(lane, step) {')
    source += '\n' + (assets / 'generator_engine.rs').read_text()
    if (assets / 'generator_tests.rs').exists():
        source += '\n' + (assets / 'generator_tests.rs').read_text()
    path.write_text(source)
    path = core / 'clip_recipe.rs'
    source = replace_once(path.read_text(),'let next=clip.recipe.as_ref().map(|recipe|recipe.settings).or(self.recipe_bases[track]);','let next=self.generator_settings(track).or_else(||clip.recipe.as_ref().map(|recipe|recipe.settings)).or(self.recipe_bases[track]);')
    source = replace_once(source,'if let Some(settings)=next.or(self.recipe_fallbacks[track]) {','if let Some(settings)=next.or(self.recipe_fallbacks[track]).or(self.generator_restore[track]) {')
    path.write_text(source)
    path = core / 'persist.rs'
    source = replace_once(path.read_text(),'            if let Some(recipe)=&c.recipe', '            if let Some(config)=c.generator {s.push_str(&format!("cg1 {} {} {}\\n",ti,ci,config.wire()));}\n            if let Some(recipe)=&c.recipe')
    source = replace_once(source,'    engine.chord_step_input=None;', '    engine.generator_explore.fill(None);engine.generator_library.fill(None);\n    engine.chord_step_input=None;')
    source = replace_once(source,'            Some("pr1")=>{','''            Some("cg1")=>{
                if let (Some(track),Some(slot))=(it.next().and_then(|value|value.parse::<usize>().ok()),it.next().and_then(|value|value.parse::<usize>().ok())) {
                    if let Some(clip)=engine.tracks.get_mut(track).and_then(|track|track.clips.get_mut(slot)) {
                        clip.generator=crate::generator::Config::parse(&it.collect::<Vec<_>>().join(" "));
                    }
                }
            },
            Some("pr1")=>{''')
    path.write_text(source)
    path = core / 'command.rs'
    source = replace_once(path.read_text(),'            if verb=="filllibrary"', '            if verb=="guser" {engine.generator_user_set(op,out);continue;}\n            if verb=="gexplore" {engine.generator_explore_set(op,out);continue;}\n            if verb=="gpreview" {engine.generator_preview_set(op,out);continue;}\n            if verb=="filllibrary"')
    source = source.replace('| "clipfill"', '| "gbake" | "clipfill"')
    source = replace_once(source,'        "clipfill" =>', '        "gbake" => engine.generator_bake(op,out),\n        "clipfill" =>')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(),'    fn drain_out(&mut self) {','    fn drain_out(&mut self) {\n        self.joint_links.generator_mask=self.engine.generator_mask();')
    source = replace_once(source,'            "part_result" =>', '            key if key.starts_with("generator_info_")=>key[15..].parse::<usize>().ok().map(|track|self.engine.generator_info(track)),\n            "part_result" =>')
    source = replace_once(source,'if let Some(values)=values {if let Ok(values)=values.try_into(){self.engine.recipe_bases[track as usize]=Some(seq_core::part_settings::Settings(values));self.engine.dirty=true;}}', '''if let Some(values)=values {if let Ok(values)=values.try_into(){
                            if self.engine.generator_exploring(track as usize) {self.engine.generator_restore[track as usize]=Some(seq_core::part_settings::Settings(values));}
                            else {self.engine.recipe_bases[track as usize]=Some(seq_core::part_settings::Settings(values));self.engine.dirty=true;}
                        }}''')
    source = replace_once(source,'let name=&target.lane_label[lane];', 'let name=&target.lane_label[lane];\n                            if seq_core::generator::internal(name) {continue;}')
    source = replace_once(source,'                OutEvent::Cc { track, lane, val } => {', '                OutEvent::Cc { track, lane, val } => {\n                    if seq_core::generator::internal(&self.engine.tracks[track as usize].lane_label[lane as usize]) {continue;}')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/joint_links.rs'
    source = replace_once(path.read_text(),'pub struct JointLinks {','pub struct JointLinks {\n    pub generator_mask:u16,')
    source = replace_once(source,'Self {chord_bass:None,','Self {generator_mask:0,chord_bass:None,')
    source = replace_once(source,'(blocked&(1<<track)==0&&', '((blocked|self.generator_mask)&(1<<track)==0&&')
    source = replace_once(source,'let output=if self.chord.is_some_and', 'let output=if self.generator_mask&(1<<track)!=0 {Some(pitch)} else if self.chord.is_some_and')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(path.read_text().replace("'clipfill',", "'gbake', 'clipfill',"))
    path = root / 'src/seq/lane-mapping.ts'
    source = replace_once(path.read_text(),'    const sep = targetParam.indexOf', "    if(targetParam.startsWith('generator:'))return true;\n    const sep = targetParam.indexOf")
    path.write_text(source)
    path = root / 'src/seq/automation.ts'
    source = path.read_text().replace('!isMixTarget(e.targetParam)', "!isMixTarget(e.targetParam)&&!e.targetParam.startsWith('generator:')")
    source = replace_once(source,'    const key = tp.slice', "    if(tp.startsWith('generator:'))return {min:0,max:127,type:'int'};\n    const key = tp.slice")
    source = replace_once(source,'        const comp = e.targetParam.slice', "        if(e.targetParam.startsWith('generator:'))continue;\n        const comp = e.targetParam.slice")
    path.write_text(source)
    # The parameter surface is shared by native Move and the browser controller.
    for filename in ('comp-generator.ts','generator-styles.json'):
        origin: str = 'styles.json' if filename.endswith('.json') else filename
        (root / 'src/seq' / filename).write_text((assets / origin).read_text())
    path = root / 'src/seq/chord-play.ts'
    source = "import {generatorParameters,generatorKeys,generatorRead,generatorWrite,generatorStop,generatorFooter,generatorTouch,generatorRecordActive,generatorPrepareRecord,generatorPageChanged,generatorBrowseKeys,generatorActor,generatorTarget} from './comp-generator.js';\n" + path.read_text()
    source = replace_once(source,'...partParameters(native),', '...generatorParameters(),...partParameters(native),')
    source = replace_once(source,'        const partValue=partRead', '        const generated=generatorRead(bare,generatorTarget(setup.comp,setup.bass));if(generated!==null)return generated;\n        const partValue=partRead')
    source = replace_once(source,"const bare=key.split(':').pop()??'';const partResult", "const bare=key.split(':').pop()??'';const generated=generatorWrite(bare,value,generatorTarget(setup.comp,setup.bass));if(generated!==null){if(['cg_actor','cg_genre','cg_family'].includes(bare))bankPageDirty=true;return generated;}const partResult")
    source = replace_once(source,"if(!target&&/:(cp|bp)_/.test(key))", "if(!target&&(/:(cp|bp)_/.test(key)||key.includes(':cg_')))")
    source = replace_once(source,"    add('cp_comp_library'", "    add('cp_generator_browser',generatorActor()+' T'+(generatorTarget(setup.comp,setup.bass)+1)+' Browse',generatorBrowseKeys);\n    add('cp_comp_generator',generatorActor()+' T'+(generatorTarget(setup.comp,setup.bass)+1)+' Generator',generatorKeys);\n    add('cp_comp_library'")
    source = replace_once(source,'    if(enabled===value)return;', '    if(enabled===value)return;\n    if(!value)generatorStop();')
    source = replace_once(source,"    const ownerTrack=conductorTrack(),conductorOwner", """    if(status===176&&key===86){
        if(generatorRecordActive()){if(value)chordRecordButton(true,generatorTarget(setup.comp,setup.bass));return true;}
        if(value&&['cp_comp_generator','cp_generator_browser'].includes((surface??page)?.ctl.page?.level??'')){
            const ready=generatorPrepareRecord(generatorTarget(setup.comp,setup.bass));
            if(ready!==null){if(ready)chordRecordButton(true,generatorTarget(setup.comp,setup.bass));return true;}
        }
    }
    const ownerTrack=conductorTrack(),conductorOwner""")
    source = replace_once(source,'    if(bankPageDirty&&!touches.size', '    if(generatorPageChanged())bankPageDirty=true;\n    if(bankPageDirty&&!touches.size')
    source = replace_once(source,"        if(/^(cp|bp)_(load|save)$/.test", "        if(generatorTouch(current.keyAt(key)??'',generatorTarget(setup.comp,setup.bass),down))return true;\n        if(/^(cp|bp)_(load|save)$/.test")
    source = replace_once(source,'    if(setup.playMode)return queueFooterText', "    if(['cp_comp_generator','cp_generator_browser'].includes(current.ctl.page?.level??''))return generatorFooter(generatorTarget(setup.comp,setup.bass));\n    if(setup.playMode)return queueFooterText")
    source = replace_once(source,'export function harmonyOff():void{','export function harmonyOff():void{\n    generatorStop();')
    path.write_text(source)
    path = root / 'src/seq/chord-step-entry.ts'
    source = "import {generatorRecordActive} from './comp-generator.js';\n" + path.read_text()
    source = replace_once(source,'export function chordRecordButton(down:boolean,track:number):void {','export function chordRecordButton(down:boolean,track:number):void {\n    if(generatorRecordActive()){if(down)recToggle(track);return;}')
    path.write_text(source)
    path = root / 'src/undo/rec-pass.ts'
    source = "import {generatorRecordCommand,generatorRecordTrack} from '../seq/comp-generator.js';\n" + path.read_text()
    source = replace_once(source,'seqCtl(chordRecordCommand() ??', 'seqCtl(generatorRecordCommand() ?? chordRecordCommand() ??')
    source = source.replace("watchedTrack() + ':' + passSeq", "(generatorRecordTrack()??watchedTrack()) + ':' + passSeq")
    source = source.replace('target: trackLabel(watchedTrack()),','target: trackLabel(generatorRecordTrack()??watchedTrack()),')
    source = replace_once(source,'let passSeq = 0;', 'let passSeq = 0;\nlet generatorPass = false;')
    source = replace_once(source,'    passSeq++;', '    passSeq++;\n    generatorPass=generatorRecordTrack()!==null;')
    source = replace_once(source,'    pendingArm = 0;\n    /* Armed', '    pendingArm = 0;\n    if(generatorRecordTrack()!==null)generatorPass=true;\n    /* Armed')
    source = replace_once(source,'if (wasRolling && seqState.curStep < lastStep)', 'if (!generatorPass && wasRolling && seqState.curStep < lastStep)')
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(),'    entryPoints: [',"    entryPoints: [\n        resolve(root, 'src/seq/comp-generator.ts'),"))
    if (assets / 'hb-comp-generator.mjs').exists():
        (root / 'browser-test/hb-comp-generator.mjs').write_text((assets / 'hb-comp-generator.mjs').read_text())
    (root / 'browser-test/hb-actor-generator.mjs').write_text((assets / 'hb-actor-generator.mjs').read_text())
    (root / 'browser-test/hb-generator-duet.mjs').write_text((assets / 'hb-generator-duet.mjs').read_text())
    (root / 'browser-test/hb-generator-phrases.mjs').write_text((assets / 'hb-generator-phrases.mjs').read_text())
    (root / 'browser-test/hb-generator-library.mjs').write_text((assets / 'hb-generator-library.mjs').read_text())
    if (assets / 'hb-generator-overdub.mjs').exists():
        (root / 'browser-test/hb-generator-overdub.mjs').write_text((assets / 'hb-generator-overdub.mjs').read_text())

    # Existing Chord Play padding is layout space, not an opaque None control.
    path = root / 'src/vendor/schwung/shared/param_pages/render_page_movy.mjs'
    source = path.read_text().replace('if (!key) continue;', 'if (!key || key.startsWith("cp_blank_")) continue;')
    path.write_text(source)

    path = root / 'src/renderer/panel-catalog.ts'
    source = replace_once(path.read_text(), "cp_comp_library:'Libraries'", "cp_generator_browser:'Libraries',cp_comp_generator:'Libraries',cp_comp_library:'Libraries'")
    source = replace_once(source, "const actor=/^cp_", "const actor=['cp_comp_generator','cp_generator_browser'].includes(base)?(String(page?.name??'').startsWith('Bass')?'Bass':'Comp'):/^cp_")
    path.write_text(source)
    path = root / 'browser-test/hb-chord-settings.mjs'
    source = replace_once(path.read_text(), 'Libraries:2,', 'Libraries:4,')
    source = replace_once(source, 'page.ctl.pages.length,55', 'page.ctl.pages.length,57')
    path.write_text(source.replace('55 pages including Discovery', '57 pages including Discovery and actor Generator'))

    for relative in ('engine/crates/movy-dsp/src/lib.rs','src/seq/constants.ts'):
        path = root / relative
        path.write_text(path.read_text().replace('0.86.0-fill-library1','0.92.0-library-names1'))
