"""Install Chord Play and the shared HB Settings destination."""
from pathlib import Path
from patch_responsive_persistence import replace_once
from patch_session_selector import patch_session_selector


def patch_chord_play(root: Path) -> None:
    """Connect panel owners, persisted definitions and existing native recording."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    (root / 'browser-test/hb-chord-play.mjs').write_text((assets / 'hb-chord-play.mjs').read_text())
    for name in ('chord-play.ts', 'chord-colors.ts', 'hb-settings.ts'):
        (root / 'src/seq' / name).write_text((assets / name).read_text())
    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = "import { chordEnabled, setChordEnabled } from './chord-play.js';\nimport { settingsOpen, setSettingsOpen } from './hb-settings.js';\n" + path.read_text()
    source = replace_once(source, 'return seqState.sessionMode ? 0 :', 'return settingsOpen() ? 7 : seqState.sessionMode ? 0 : chordEnabled() ? 6 :')
    source = replace_once(source, '(previous + 1) % 6', '(previous + 1) % 8')
    source = replace_once(source, '    setGridEnabled(next === 4);', "    if(next===7){setSettingsOpen(true,false);seqToast('HB Settings');return;}\n    setSettingsOpen(false);setChordEnabled(next===6);\n    setGridEnabled(next === 4);")
    source = replace_once(source, "'Field Play'][next]", "'Field Play', 'Chord Play', 'HB Settings'][next]")
    source = replace_once(source, '    if (d1 === CC_NOTE_SESSION) {', '''    if (d1 === CC_NOTE_SESSION && (shiftHeld || settingsShortcut)) {
        if(d2>0){settingsShortcut=true;setSettingsOpen(!settingsOpen());}
        else settingsShortcut=false;
        return true;
    }
    if (d1 === CC_NOTE_SESSION) {''')
    source = replace_once(source, 'let sessionPlayPrev = 0;', 'let sessionPlayPrev = 0;\nlet settingsShortcut = false;')
    path.write_text(source)
    path = root / 'src/seq/router.ts'
    source = "import { chordMidi } from './chord-play.js';\nimport { settingsMidi, settingsActive } from './hb-settings.js';\n" + path.read_text()
    source = replace_once(source, '    if (fieldMidi(data))', '    if (settingsMidi(data)) return true;\n    if (chordMidi(data,!settingsActive())) return true;\n    if (fieldMidi(data))')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { chordActive, chordPage, tickChord, renderChord } from '../seq/chord-play.js';\nimport { settingsActive, settingsPage, tickSettings, renderSettings } from '../seq/hb-settings.js';\n" + path.read_text()
    source = replace_once(source, 'const touchPage = activeModel ?', 'const touchPage = settingsActive() ? settingsPage() : chordActive() ? chordPage() : activeModel ?')
    source = replace_once(source, '    tickField();', '    tickSettings();\n    tickChord();\n    tickField();')
    source = replace_once(source, '        } else if (fieldActive()) {', '        } else if (settingsActive()) {\n            renderSettings();\n        } else if (chordActive()) {\n            renderChord();\n        } else if (fieldActive()) {')
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = "import { paintChordSteps } from './chord-play.js';\n" + path.read_text()
    path.write_text(replace_once(source, '    if (paintHbPerformance())', '    if (paintChordSteps()) { paintTransport(); return; }\n    if (paintHbPerformance())'))
    path = root / 'src/seq/ui-state.ts'
    source = "import { chordSnapshot, restoreChord } from './chord-play.js';\n" + path.read_text()
    source = replace_once(source, '        jointPlay: jointSnapshot(),', '        jointPlay: jointSnapshot(),\n        chordPlay: chordSnapshot(),')
    source = replace_once(source, '        restoreTrailSettings(o.padTrails);', '        restoreChord(o.chordPlay);\n        restoreTrailSettings(o.padTrails);')
    source = replace_once(source, 'export function resetUiState(): void {', 'export function resetUiState(): void {\n    restoreChord(null);')
    path.write_text(source)
    path = root / 'src/app/input-reset.ts'
    source = "import { setChordEnabled } from '../seq/chord-play.js';\nimport { setSettingsOpen } from '../seq/hb-settings.js';\n" + path.read_text()
    path.write_text(replace_once(source, '    resetJointInput();', '    setSettingsOpen(false);setChordEnabled(false);\n    resetJointInput();'))
    path = root / 'src/undo/rec-pass.ts'
    source = "import { chordRecordCommand } from '../seq/chord-play.js';\n" + path.read_text()
    path.write_text(replace_once(source, 'jointRecordCommand() ??', 'chordRecordCommand() ?? jointRecordCommand() ??'))
    path = root / 'src/renderer/hb-step-panels.ts'
    source = path.read_text()
    source = replace_once(source, '    if (!levels?.root) return hierarchy;', '    if (!levels?.root) return hierarchy;\n    if(mode===3)return hierarchy;')
    source = replace_once(source, 'commonPanels.has(key) || mode === 0 ||', "commonPanels.has(key) || (mode === 0 && new Set(['global_transpose','follower_root','follower_source','follower_play','chord_player','chord_forms','arp_player','track_scales','follower_play_tools','motif_global','secondary_scale']).has(key)) ||")
    source = replace_once(source, '    if(mode===3)return hierarchy;', '''    if(mode===3)return hierarchy;
    levels.root.name=mode===2?'Motif Play Setup':'Play Setup';
    levels.root.knobs=[...(levels.follower_source?.knobs??[])];
    levels.root.params=[...levels.root.knobs.map((key:string)=>({key})),...(levels.root.params??[]).filter((item:any)=>item.level)];''')
    source = source.replace('const visible = hiddenPanels.has(key)', "const visible = key==='follower_source'||hiddenPanels.has(key)")
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/chord-play.ts'),\n        resolve(root, 'src/seq/hb-settings.ts'),"))
    path = root / 'browser-test/hb-touch.mjs'
    source = path.read_text().replace("const page = createSchwungPage(port, 'midi_fx1');", "let diagnosticView=false;\nconst page = createSchwungPage(port, 'midi_fx1', {get harmonyMode(){return diagnosticView?3:undefined;}});")
    source = source.replace("assert.equal(page.pageTitle,'Foll Map')", "assert.equal(page.pageTitle,'Main')")
    source = replace_once(source, 'function focusKey(key) {', "function focusKey(key) {\n    const diagnostic=/^(fpath_|hpath_|monitor_)/.test(key);if(diagnostic!==diagnosticView){diagnosticView=diagnostic;page.reload();}")
    path.write_text(source)
    path = root / 'browser-test/hb-track-navigation.mjs'
    path.write_text(path.read_text().replace('render_channel','render_velocity_percent'))
    path = root / 'browser-test/hb-startup-host.mjs'
    path.write_text(path.read_text().replace(".ctl.metaAt(0).type", ".ctl.state.metaIndex.get('version').type"))
    path = root / 'browser-test/hb-analysis.mjs'
    source = path.read_text().replace("const page=schwungPageFor(0,'midi_fx1');", "const {setSettingsOpen,settingsPage}=await import('../dist/esm/seq/hb-settings.js');\nsetSettingsOpen(true);let page=settingsPage();")
    source = replace_once(source, "    for(const key of ['arp_hold','travel_map','next_anti_buffer_ms']) {", "    for(const key of ['arp_hold','travel_map','next_anti_buffer_ms']) {\n        setSettingsOpen(key==='next_anti_buffer_ms');page=key==='next_anti_buffer_ms'?settingsPage():schwungPageFor(0,'midi_fx1');")
    source = replace_once(source, "setFlag('hbsteprow',1);page.reload();", "setSettingsOpen(false);page=schwungPageFor(0,'midi_fx1');\nsetFlag('hbsteprow',1);page.reload();")
    source = replace_once(source, "setFlag('hbsteprow',0);page.reload();\nconst liveRead=", "setSettingsOpen(true);page=settingsPage();\nsetFlag('hbsteprow',0);page.reload();\nconst liveRead=")
    path.write_text(source)
    path = root / 'browser-test/hb-step-modes.mjs'
    path.write_text(path.read_text().replace("assert(order('render_channel')<order('chord_mode'));", "assert.equal(order('render_channel'),-1,'Routing belongs to HB Settings');").replace("assert(page.ctl.page.keys.includes('version'))", "assert(page.ctl.page.keys.includes('content_map'))").replace("assert(has(page,'monitor_status'),'Steps restores setup and diagnostics');", "assert(!has(page,'monitor_status'),'Diagnostics belong to HB Settings');").replace(".keys.includes('version')", ".keys.includes('content_map')").replace('Diagnostics stay in Steps setup','Diagnostics stay in HB Settings').replace('Note diagnostics stay in Steps setup','Note diagnostics stay in HB Settings'))
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-drum-fill1','0.71.0-chord-play2'))
    path = root / 'browser-test/hb-joint-panels.mjs'
    path.write_text(path.read_text().replace('[1,2,3,4,5,0,1,2,3,4,5,0]', '[1,2,3,4,5,6,7,0,1,2,3,4,5,6,7,0]').replace('six-mode Session cycle','eight-mode Session cycle'))
    patch_session_selector(root)
    patch_native(root)


def patch_native(root: Path) -> None:
    """Add atomic selection input and optional melody-to-comp routing."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    (root / 'engine/crates/movy-dsp/src/chord_selection.rs').write_text((assets / 'chord_selection.rs').read_text())
    path: Path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    source: str = path.read_text()
    source = replace_once(source, 'pub fn parse(message:', '''/// Reserved silent harmony descriptor. It is never an executable operation.
pub fn chord_selection(actions:&Actions)->bool {
    let word=actions[0];
    let intent=word&0xffffc01f00000000==0xc859001f00000000 && (1..=10).contains(&((word>>37)&15)) && (word>>41)&15<12;
    (word&0xffffffff00000000==0xc858001f00000000||intent) && word&1!=0 && (word&4095).count_ones()>=2 &&
        (word>>12)&4095!=0 && (word>>24)&15<12 && (word>>28)&15<12 && actions[1..].iter().all(|word|*word==0)
}
pub fn parse(message:''')
    source = replace_once(source, '    if actions[LANES]&!', '    if chord_selection(&actions){return Some((pitch,actions));}\n    if actions[LANES]&!')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/joint_links.rs'
    source = path.read_text().replace('    routes: [Option<(usize,i16)>;16],', '    routes: [Option<(usize,i16)>;16],\n    chord: Option<(usize,usize,bool)>,')
    source = replace_once(source, 'Self {routes:[None;16],', 'Self {chord:None,routes:[None;16],')
    source = replace_once(source, '    pub fn derived(&self,track:usize)->bool {self.routes.iter().flatten().any(|(target,_)|*target==track)}', '''    pub fn set_chord(&mut self,value:&str)->bool {
        if value=="off" {if self.chord.is_none(){return false;}self.chord=None;return true;}
        let Ok(fields)=value.split(',').map(str::parse::<usize>).collect::<Result<Vec<_>,_>>() else {return false;};
        if fields.len()!=3||fields[0]>=16||fields[1]>=16||fields[0]==fields[1]||fields[2]>1{return false;}
        let next=Some((fields[0],fields[1],fields[2]!=0));if next==self.chord{return false;}self.chord=next;true
    }
    fn effective_route(&self,source:usize)->Option<(usize,i16)>{
        if let Some((melody,comp,follow))=self.chord {
            if source==melody{return if follow {Some((comp,0))} else {None};}
            if self.routes[source].is_some_and(|(target,_)|target==comp){return None;}
        }
        self.routes[source]
    }
    pub fn derived(&self,track:usize)->bool {(0..16).any(|source|self.effective_route(source).is_some_and(|(target,_)|target==track))}''')
    source = replace_once(source, 'let (track,shift)=self.routes[event.track]?;', 'let (track,shift)=self.effective_route(event.track)?;')
    source = replace_once(source, 'else if track%4==2 && self.guide_enabled', 'else if self.chord.is_some_and(|(_,comp,_)|comp==track) {Some(pitch)} else if track%4==2 && self.guide_enabled')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text().replace('mod joint_links;', 'mod joint_links;\nmod chord_selection;')
    source = replace_once(source, '    joint_links: joint_links::JointLinks,', '    joint_links: joint_links::JointLinks,\n    chord_note: Option<(usize,u8)>,\n    chord_playback: [bool;2048],')
    source = replace_once(source, '            joint_links: joint_links::JointLinks::new(),', '            joint_links: joint_links::JointLinks::new(),\n            chord_note: None,\n            chord_playback: [false;2048],')
    source = replace_once(source, '    fn surface_event(&mut self, event: surface_route::Event) {', '''    fn surface_event(&mut self,event:surface_route::Event){self.input_event(event,true);}
    fn release_chord_selection(&mut self){
        if let Some((track,pitch))=self.chord_note.take(){self.input_event(surface_route::Event{track,pitch,status:0x80,value:0,approach:None,full_velocity:false},false);}
    }
    fn input_event(&mut self, event: surface_route::Event, derive:bool) {''')
    source = replace_once(source, '        self.joint_follow(event,false);', '        if derive {self.joint_follow(event,false);}')
    source = replace_once(source, '    fn set_param(&mut self, key: &str, val: &str) {', '''    fn set_param(&mut self, key: &str, val: &str) {
        if key=="cmd" && val.split(';').any(|command|matches!(command.split_whitespace().next(),Some("stop"|"reset"))){self.release_chord_selection();}''')
    source = replace_once(source, '            "joint_links" => {', '''            "chord_select" => {
                if val=="off" {self.release_chord_selection();}
                else if let Some(selection)=chord_selection::Selection::parse(val) {
                    self.abort_idle_input();
                    self.chains.set_param(selection.track,"midi_fx1:hb_movy_input_chord",&selection.payload);
                    if self.chains.get_param(selection.track,"midi_fx1:hb_chord_prepared").as_deref()==Some("1"){
                        let pitch=self.chains.get_param(selection.track,"midi_fx1:hb_chord_note").and_then(|text|text.parse::<u8>().ok()).filter(|pitch|*pitch<128).unwrap_or(selection.pitch);
                        self.release_chord_selection();
                        self.input_event(surface_route::Event{track:selection.track,pitch,status:0x90,value:100,approach:None,full_velocity:false},false);
                        self.chord_note=Some((selection.track,pitch));
                    }
                }
            }
            "chord_route" => {
                if self.joint_links.set_chord(val){for (event,playback) in self.joint_links.drain(){if playback {self.chains.hb_playback(event.track,false);}self.chains.on_midi(event.track,&[0x80,event.pitch,0],MOVE_MIDI_SOURCE_INTERNAL);if playback {self.chains.hb_playback_done(event.track);}}}
            }
            "joint_links" => {''')
    source = replace_once(source, '                OutEvent::RecordedActions {track,pitch,actions}=>{', '                OutEvent::RecordedActions {track,pitch,actions}=>{\n                    self.chord_playback[track as usize*128+pitch as usize]=actions.as_ref().is_some_and(seq_core::recorded_actions::chord_selection);')
    source = source.replace('                    self.joint_follow(surface_route::Event{track:track as usize,pitch,', '                    if !self.chord_playback[track as usize*128+pitch as usize] {self.joint_follow(surface_route::Event{track:track as usize,pitch,').replace('full_velocity:false},true);', 'full_velocity:false},true);}')
    source = source.replace('full_velocity:self.pads.full_velocity()},true);', 'full_velocity:self.pads.full_velocity()},true);}')
    path.write_text(source)

    for source_name, destination in (('selection-tests.rs', 'seq-core/src/recorded_actions.rs'), ('recording-tests.rs', 'seq-core/src/engine.rs'), ('route-tests.rs', 'movy-dsp/src/joint_links.rs')):
        path = root / 'engine/crates' / destination
        path.write_text(path.read_text() + '\n' + (assets / source_name).read_text())
