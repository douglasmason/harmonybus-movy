"""Install edit-time clip composition and its Clips View surface."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_clip_fill(root: Path) -> None:
    """Share onset selection with weaving and wire bounded preview/write commands."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/clip-fill'
    core: Path = root / 'engine/crates/seq-core/src'
    for filename in ['clip_fill.rs', 'clip_fill_tests.rs']:
        (core / filename).write_text((assets / filename).read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text()+'\npub mod clip_fill;\n#[cfg(test)] mod clip_fill_tests;\n')
    path = core / 'motif_load.rs'
    path.write_text(replace_once(path.read_text(),'fn fingerprint(', 'pub(crate) fn fingerprint('))
    path = core / 'engine.rs'
    source: str = path.read_text()
    start: int = source.index('            let start=clip.loop_start_ticks();let end=clip.loop_end_ticks();', source.index('    fn source_attack('))
    end: int = source.index('            let Some(onset)=onset', start)
    source = source[:start]+'''            let onset=crate::clip_fill::pitch_onset(clip,
                (route.alignment!=crate::source_route::Alignment::Sequential).then_some(pitch_phase),cursor.onset);
'''+source[end:]
    path.write_text(source)
    path = core / 'command.rs'
    source = path.read_text().replace('| "pload"', '| "clipfill" | "pload"')
    source = replace_once(source,'        "pload" =>', '        "clipfill" => engine.fill_write(op,out),\n        "pload" =>')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    path.write_text(replace_once(path.read_text(),'            "part_result" =>', '''            key if key.starts_with("fill_preview_")=>Some(self.engine.fill_preview(&key[13..])),
            key if key.starts_with("fill_target_")=>Some(self.engine.fill_target(&key[12..])),
            "part_result" =>'''))
    (root / 'src/seq/clips-fill.ts').write_text((assets / 'clips-fill.ts').read_text())
    (root / 'browser-test/hb-clips-fill.mjs').write_text((assets / 'hb-clips-fill.mjs').read_text())
    path = root / 'src/seq/clips-view.ts'
    source = "import {fillActive,fillMidi,renderFill,setFillActive} from './clips-fill.js';\n"+path.read_text()
    source = replace_once(source,'export function clipsMidi(data: number[]): boolean {', '''export function clipsMidi(data: number[]): boolean {
    if(clipsSurfaceActive()&&fillMidi(data))return true;
    if(clipsSurfaceActive()&&clipsPage===1&&(data[0]&240)===176&&data[1]===75&&data[2]>0&&data[2]<64){setFillActive(true);return true;}''')
    source = replace_once(source,'export function renderClips(): void {','export function renderClips(): void {\n    if(renderFill())return;')
    source = replace_once(source,'    const colors = Array.from', '    if(fillActive()){updatePerformanceKnobLEDs(Array(8).fill(120));return;}\n    const colors = Array.from')
    source = source.replace("line(51,'Tap playing: relaunch')", "line(51,'5 Fill Clips: turn')")
    path.write_text(source)
    path = root / 'src/seq/clips-settings.ts'
    source = "import {setFillActive} from './clips-fill.js';\n"+path.read_text()
    source = source.replace("{key:'clips_output',name:'Drum Clip Out',options:['Chain','Drum Ch 1']}", "{key:'clips_output',name:'Drum Clip Out',options:['Chain','Drum Ch 1']},\n    {key:'clips_fill',name:'Fill Clips',options:['Off','On']}")
    source = source.replace("if(index===3)return drumOutputLabel();", "if(index===4)return 'Off';\n        if(index===3)return drumOutputLabel();")
    source = source.replace('if(index===3){turnDrumOutput', 'if(index===4){setFillActive(target===1);return true;}\n        if(index===3){turnDrumOutput')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(replace_once(path.read_text(), "'pload',", "'clipfill', 'pload',"))
    path = root / 'src/seq/session.ts'
    source = "import {fillCell} from './clips-fill.js';\n"+path.read_text()
    source = replace_once(source,'    sessionLaunchCell(cell.track, cell.slot);','    if(fillCell(cell.track,cell.slot))return;\n    sessionLaunchCell(cell.track, cell.slot);')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    path.write_text("import {fillTick} from '../seq/clips-fill.js';\n"+replace_once(path.read_text(),'function tickBody(): void {','function tickBody(): void {\n    fillTick();'))
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/clips-fill.ts'),"))
    for filename in ['engine/crates/movy-dsp/src/lib.rs', 'src/seq/constants.ts']:
        path = root / filename
        path.write_text(path.read_text().replace('0.72.0-drum-output1', '0.73.0-clip-fill1'))
