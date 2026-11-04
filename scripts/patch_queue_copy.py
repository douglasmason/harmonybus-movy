"""Compose native retained-queue copying with the existing clip and Undo owners."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_queue_copy(root: Path) -> None:
    """Install explicit snapshot reads, atomic clip writing and the shared picker."""
    assets: Path = Path(__file__).resolve().parents[1] / "integration/chord-play"
    map_asset_to_destination: dict[str, str] = {
        "queue-copy.rs": "engine/crates/seq-core/src/queue_copy.rs",
        "queue-copy-bridge.rs": "engine/crates/movy-dsp/src/queue_copy.rs",
        "queue-copy.ts": "src/seq/queue-copy.ts",
        "queue-copy-tests.rs": "engine/crates/seq-core/src/queue_copy_tests.rs",
        "hb-queue-copy.mjs": "browser-test/hb-queue-copy.mjs",
    }
    asset: str
    destination: str
    for asset, destination in map_asset_to_destination.items():
        asset_path: Path = assets / asset
        if asset_path.exists():
            (root / destination).write_text(asset_path.read_text())
    path: Path = root / "engine/crates/seq-core/src/engine.rs"
    source: str = path.read_text() + '\ninclude!("queue_copy.rs");\n'
    if (assets / "queue-copy-tests.rs").exists():
        source += '#[cfg(test)]\ninclude!("queue_copy_tests.rs");\n'
    path.write_text(source)
    path = root / "engine/crates/movy-dsp/src/chain_slots.rs"
    source = replace_once(path.read_text(),
        '    pub fn hb_chord_queue_take(&mut self, slot: usize) -> crate::hb_queue_read::Event {',
        '''    pub fn hb_chord_queue_export(&mut self, slot: usize, buffer: &mut [u8]) -> i32 {
        let Some(Some(instance)) = self.slots.get_mut(slot) else { return 0; };
        instance.hb_get_small(c"midi_fx1:hb_chord_queue_export", buffer)
    }

    pub fn hb_chord_queue_take(&mut self, slot: usize) -> crate::hb_queue_read::Event {''')
    path.write_text(source)
    path = root / "engine/crates/movy-dsp/src/lib.rs"
    source = replace_once(path.read_text(), '    chord_note: Option<(usize,u8,bool)>,',
        '    chord_copy_result: String,\n    chord_note: Option<(usize,u8,bool)>,')
    source = replace_once(source, '            chord_note: None,',
        '            chord_copy_result: String::new(),\n            chord_note: None,')
    source = replace_once(source, '                apply_batch(&mut self.engine, val, &mut self.out);',
        '''                if val.split(';').any(|operation| operation.split_whitespace().next() == Some("qcopy")) {
                    for operation in val.split(';').map(str::trim) {
                        if operation.split_whitespace().next() == Some("qcopy") {
                            self.copy_chord_queue_command(operation);
                        } else { apply_batch(&mut self.engine, operation, &mut self.out); }
                    }
                } else { apply_batch(&mut self.engine, val, &mut self.out); }''')
    source = replace_once(source, '            "part_result" => Some(self.engine.part_result.clone()),',
        '''            "chord_copy_result" => Some(self.chord_copy_result.clone()),
            key if key.starts_with("chord_copy_info_") => key[16..].parse::<usize>().ok().map(|track| self.chord_copy_info(track)),
            "part_result" => Some(self.engine.part_result.clone()),''')
    source += '\ninclude!("queue_copy.rs");\n'
    path.write_text(source)
    path = root / "src/seq/chord-play.ts"
    path.write_text(path.read_text() + '\nexport function chordCopyConductor():number{return conductorTrack();}\n')
    path = root / "src/seq/mode-buttons.ts"
    source = "import {openQueueCopy,queueCopyActive,cancelQueueCopy} from './queue-copy.js';\nimport {chordCopyConductor} from './chord-play.js';\n" + path.read_text()
    source = replace_once(source, 'export function resetModeHelp():void{', 'export function resetModeHelp():void{\n    cancelQueueCopy();')
    source = replace_once(source, 'if(cc===CC_MODE_COPY)return chordQueuePresent()?WHITE_DIM:WHITE_OFF;',
        'if(cc===CC_MODE_COPY)return queueCopyActive()?WHITE_BRIGHT:chordQueuePresent()?WHITE_DIM:WHITE_OFF;')
    source = replace_once(source, '    if(cc===CC_MODE_MUTE&&chordButtonContext()){',
        '''    if(cc===CC_MODE_COPY&&chordButtonContext()){
        if(down){capturedReleases.add(cc);dismissModeHelp();openQueueCopy(chordCopyConductor());}
        return true;
    }
    if(cc===CC_MODE_MUTE&&chordButtonContext()){''')
    source = source.replace('Saved progression is available as a copy source; direct queue-to-clip writing is not yet implemented',
        'Save the abstract progression to an empty conductor clip; the live queue keeps playing')
    source = source.replace("'X: cancel chord queue',", "'Copy: queue to clip',\n        'X: cancel chord queue',")
    source = source.replace(' * are never intercepted. Copy is not repurposed as a fake Queue -> Clip commit:\n * the semantic writer + phase-safe handoff must exist first. Shift+Copy opens\n * this guide without engaging the generic clipboard.',
        ' * are never intercepted. Copy saves the native queue as an abstract clip.\n * Shift+Copy opens this guide without engaging the generic clipboard.')
    path.write_text(source)
    path = root / "src/undo/verbs.ts"
    path.write_text(replace_once(path.read_text(), "'clippaste',", "'clippaste', 'qcopy',"))
    path = root / "engine/crates/seq-core/src/command.rs"
    path.write_text(replace_once(path.read_text(), '| "clippaste"\n        // automation edits', '| "clippaste" | "qcopy"\n        // automation edits'))
    path = root / "browser-test/logic/undo-core.mjs"
    path.write_text(replace_once(path.read_text(), "    const stale = [...UNDOABLE_VERBS]", '''    // qcopy needs the native chain and is dispatched by the DSP bridge.
    const bridge = readFileSync('engine/crates/movy-dsp/src/lib.rs', 'utf8');
    eq('native copy dispatch is present', bridge.includes('self.copy_chord_queue_command(operation);') && bridge.includes('Some("qcopy")'), true);
    dispatched.add('qcopy');
    const stale = [...UNDOABLE_VERBS]'''))
    path = root / "src/seq/router.ts"
    source = "import {queueCopyMidi} from './queue-copy.js';\n" + path.read_text()
    source = replace_once(source, 'export function seqHandleMidi(data: number[], shiftHeld: boolean): boolean {',
        'export function seqHandleMidi(data: number[], shiftHeld: boolean): boolean {\n    if(queueCopyMidi(data))return true;')
    path.write_text(source)
    path = root / "src/midi/router.ts"
    source = "import {queueCopyMidi} from '../seq/queue-copy.js';\n" + path.read_text()
    source = replace_once(source, '    const panelStatus = data[0] & 0xf0;',
        '    if(queueCopyMidi(data))return;\n    const panelStatus = data[0] & 0xf0;')
    path.write_text(source)
    path = root / "src/seq/leds.ts"
    source = "import {paintQueueCopySteps} from './queue-copy.js';\n" + path.read_text()
    source = replace_once(source, '    if (paintScaleFindingSteps())', '    if (paintQueueCopySteps()) { paintTransport(); return; }\n    if (paintScaleFindingSteps())')
    path.write_text(source)
    path = root / "src/app/tick.ts"
    source = "import {renderQueueCopy} from '../seq/queue-copy.js';\n" + path.read_text()
    source = replace_once(source, '        if(!captureOverlayActive())renderModeHelp();',
        '        if(!captureOverlayActive()&&!renderQueueCopy())renderModeHelp();')
    path.write_text(source)
    path = root / "build/browser.mjs"
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/queue-copy.ts'),"))
    relative: str
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.100.0-param-replies1', '0.101.0-queue-copy1'))
