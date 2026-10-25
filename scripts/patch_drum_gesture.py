"""Wire a one-shot drum performance into existing clip clocks and controls."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_drum_gesture(root: Path) -> None:
    """Share the fill pattern, keep performance transient, and reuse Record."""
    assets = Path(__file__).resolve().parents[1] / 'integration/drum-gesture'
    core = root / 'engine/crates/seq-core/src'
    for filename in ('drum_fill_spec.rs', 'drum_fill_runtime.rs', 'drum_fill_runtime_tests.rs'):
        (core / filename).write_text((assets / filename).read_text())
    path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod drum_fill_spec;\n')
    path = core / 'engine.rs'
    source = path.read_text()
    source = replace_once(source, '    pub drum_outputs: u16,', '    pub drum_outputs: u16,\n    pub(crate) drum_fills: [Option<DrumFillGesture>;16],\n    pub drum_fill_result: String,')
    source = replace_once(source, '            drum_outputs: 0,', '            drum_outputs: 0,\n            drum_fills: [None;16],\n            drum_fill_result: String::new(),')
    source = replace_once(source, '        self.hb_performance.fill(Default::default());', '        self.hb_performance.fill(Default::default());\n        self.drum_fills.fill(None);')
    source = replace_once(source, 'if t.queued_slot.is_some() || t.pending_stop { *performance = Default::default(); }', 'if t.queued_slot.is_some() || t.pending_stop { *performance = Default::default(); self.drum_fills[index]=None; }')
    source = replace_once(source, '            let muted = self.tracks[ti].muted', '            let drum_fill_lane = self.drum_fill_tick(ti,out);\n            let muted = self.tracks[ti].muted')
    source = replace_once(source, '                        let n = &self.tracks[ti].clips[slot].notes[ni].clone();', '                        let n = &self.tracks[ti].clips[slot].notes[ni].clone();\n                        if drum_fill_lane==Some(n.pitch) {continue;}')
    source += '\ninclude!("drum_fill_runtime.rs");\n#[cfg(test)] mod drum_fill_runtime_tests;\n'
    # An included engine test module uses a path relative to engine.rs.
    source = source.replace('#[cfg(test)] mod drum_fill_runtime_tests;', '#[cfg(test)] #[path="drum_fill_runtime_tests.rs"] mod drum_fill_runtime_tests;')
    path.write_text(source)
    path = core / 'persist.rs'
    path.write_text(replace_once(path.read_text(), '    engine.hb_performance.fill(Default::default());', '    engine.hb_performance.fill(Default::default());\n    engine.drum_fills.fill(None);'))
    path = core / 'clip_tools.rs'
    source = path.read_text()
    start = source.index('        let fields: Vec<_> = message.split_whitespace().collect();', source.index('pub fn fill_drum_tail'))
    end = source.index('        let replacement_count', start)
    source = source[:start] + '''        let Some(spec)=crate::drum_fill_spec::Spec::parse(message) else {return false;};
        let crate::drum_fill_spec::Spec{track,pitch,grid,..}=spec;
        if !self.track_is_drum(track)||!self.song_sections_editable()||self.recording{return false;}
        let clip=self.tracks[track].active();if !clip.exists(){return false;}
        let (start,end)=spec.window(clip);
''' + source[end:]
    start = source.index('            clip.notes.push(Note {', source.index('pub fn fill_drum_tail'))
    end = source.index('        }\n        true', start)
    source = source[:start] + '            clip.notes.push(spec.note(tick,end));\n' + source[end:]
    path.write_text(source)
    path = core / 'command.rs'
    source = replace_once(path.read_text(), '        "dfill" =>', '        "dfire" => engine.trigger_drum_fill(op.strip_prefix("dfire ").unwrap_or("")),\n        "dfill" =>')
    source = replace_once(source, '| "non" | "nof" | "npr"', '| "non" | "nof" | "npr" | "dfire"')
    source = replace_once(source, '            if !is_undo_ring_verb(verb) {', '            if !is_undo_ring_verb(verb) && verb!="dfire" {')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    path.write_text(replace_once(path.read_text(), '            "part_result" =>', '            "drum_fill_result" => Some(self.engine.drum_fill_result.clone()),\n            "part_result" =>'))
    path = root / 'src/undo/verbs.ts'
    path.write_text(replace_once(path.read_text(), "'non', 'nof', 'npr',", "'non', 'nof', 'npr', 'dfire',"))
    path = root / 'src/seq/clip-page.ts'
    source = path.read_text().replace("import { seqCmd }", "import { seqCmd, seqCmdFlush, engineReady }")
    source = source.replace('trackIsDrum(track)', 'drumFillTrack(track)')
    source = replace_once(source, 'const accum =', '''export function drumFillTrack(track:number):boolean {return trackIsDrum(track)||!!(seqState.drumOutputs&(1<<track));}
let fillTouch=false;
export function triggerDrumFill(track:number):void {
    if(!engineReady()){seqToast('Sequencer not ready');return;}
    if(!seqState.playing||seqState.countingIn){seqToast('Start the drum clip first');return;}
    const pitch=seqState.watchLane;
    if(!Number.isInteger(pitch)||pitch<0||pitch>127){seqToast('Select a drum pad or turn Drum');return;}
    seqCmd('dfire '+track+' '+pitch+' '+DRUM_FILL_SPANS[clipPageState.drumSpan]+' '+CLIP_EDIT_TICKS[clipPageState.editGrid]+' '+clipPageState.drumVelocity);
    seqCmdFlush();seqToast(String(host_module_get_param('drum_fill_result')||'No drum fill response').replace(/^error:/,''));
}
const accum =''')
    source = replace_once(source, '    clipPageState.touchedKnob = -1;', '    fillTouch=false;\n    clipPageState.touchedKnob = -1;')
    source = replace_once(source, 'export function clipPageTouch(k: number, down: boolean): void {', '''export function clipPageTouch(k: number, down: boolean): void {
    if(k===2&&drumFillTrack(appState.activeTrack.index)){
        if(down&&!fillTouch)triggerDrumFill(appState.activeTrack.index);
        fillTouch=down;
    }''')
    source = replace_once(source, 'export function clipPageRelease(k: number, track: number): void {', 'export function clipPageRelease(k: number, track: number): void {\n    if(k===2)fillTouch=false;')
    source = replace_once(source, '    if (k === 7 && drumFillTrack(track)) {', '''    if(k===6&&drumFillTrack(track)){seqState.watchLane=Math.max(0,Math.min(127,(seqState.watchLane>=0?seqState.watchLane:36)+n));return;}
    if (k === 7 && drumFillTrack(track)) {''')
    path.write_text(source)
    path = root / 'src/seq/clip-page-vm.ts'
    source = path.read_text().replace('DRUM_FILL_LABELS }', 'DRUM_FILL_LABELS, drumFillTrack }').replace('const isDrum = trackIsDrum(appState.activeTrack.index);','const isDrum = drumFillTrack(appState.activeTrack.index);')
    source = source.replace("shortName: 'TRANS', fullName: 'Transpose'", "shortName: isDrum?'FILL':'TRANS', fullName: isDrum?'Drum Fill / Touch to perform':'Transpose'").replace("displayValue: isDrum ? 'n/a'", "displayValue: isDrum ? 'Tap'").replace("fullName:'Selected Drum / Press wheel to fill'", "fullName:'Drum Note / Turn or select pad'").replace("readOnly:true, normalizedValue:0 }) : info", "readOnly:false, normalizedValue:0 }) : info").replace("isDrum ? 'n/a on drums'", "isDrum ? 'Touch: one-shot fill'")
    path.write_text(source)
    (root / 'browser-test/hb-drum-gesture.mjs').write_text((assets / 'hb-drum-gesture.mjs').read_text())
    for filename in ('engine/crates/movy-dsp/src/lib.rs','src/seq/constants.ts'):
        path = root / filename
        path.write_text(path.read_text().replace('0.77.0-conductor-fill1','0.78.0-drum-gesture1'))

    path = root / 'browser-test/logic/params-pages.mjs'
    source = path.read_text().replace("buildClipPageVM().rows[0][2].displayValue, 'n/a'", "buildClipPageVM().rows[0][2].displayValue, 'Tap'").replace("buildClipPageVM().toast.value, 'n/a on drums'", "buildClipPageVM().toast.value, 'Touch: one-shot fill'")
    path.write_text(source)
