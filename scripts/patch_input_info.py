"""Explain playback inputs without adding pad colors or a new panel."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_input_info(root: Path) -> None:
    """Install an on-demand clip context readout and exact off-layout feedback."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/input-info'
    path: Path = root / 'engine/crates/seq-core/src/engine.rs'
    source: str = path.read_text()
    source = replace_once(source, 'impl Engine {', 'impl Engine {\n' + (assets / 'engine.rs').read_text())
    source += (assets / 'tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(), '            "status" => {',
                          '            "clip_input_info" => Some(self.engine.clip_input_info()),\n            "status" => {')
    path.write_text(source)
    (root / 'src/seq/input-info.ts').write_text((assets / 'input-info.ts').read_text())
    path = root / 'src/app/tick.ts'
    source = "import { refreshClipInputInfo, offLayoutNotes } from '../seq/input-info.js';\n" + path.read_text()
    source = replace_once(source, '    seqEngineTick();', '    seqEngineTick();\n    refreshClipInputInfo();')
    source = replace_once(source, '        seqState.clipTranspose].join',
                          '        seqState.clipTranspose, clipPageActive() ? offLayoutNotes().join(".") : ""].join')
    path.write_text(source)
    path = root / 'src/seq/clip-page-vm.ts'
    source = "export { refreshClipInputInfo, offLayoutNotes } from './input-info.js';\nimport { clipInputInfo, offLayoutNotes, offLayoutText } from './input-info.js';\n" + path.read_text()
    anchor: str = '    const cells = [scale, length, transpose, quant, editGrid, editAction, applyHint];'
    replacement: str = '''    const info = isDrum ? null : clipInputInfo();
    const kind = info ? ({fixed: 'Fixed', mapped: 'Mapped', rendered: 'Render', mixed: 'Mixed'}[info.kind] ?? '') : '';
    const detail = !info ? '' : info.kind === 'mapped' ? info.source + ' > ' + info.target
        : info.kind === 'fixed' ? 'Keeps pitches' : info.kind === 'rendered' ? 'Rendered pitches' : 'Mixed sources';
    const inputInfo = info ? cell({ shortName: 'INPUT', fullName: 'Recorded Input', renderStyle: 'preset',
        displayValue: kind, readOnly: true, normalizedValue: 0 }) : applyHint;
    const hidden = offLayoutNotes();
    const offPad = hidden.length ? cell({ shortName: 'OFFPAD', fullName: 'Playing off layout', renderStyle: 'preset',
        displayValue: String(hidden.length), readOnly: true, normalizedValue: 0 }) : null;
    const cells = [scale, length, transpose, quant, editGrid, editAction, inputInfo, offPad];'''
    source = replace_once(source, anchor, replacement)
    source = source.replace('if (tk >= 0 && tk < cells.length) {', 'if (tk >= 0 && tk < cells.length && cells[tk]) {')
    source = source.replace('cells[tk].touched = true;', 'cells[tk]!.touched = true;')
    source = source.replace(': tk >= 4 ? cells[tk].displayValue', ': tk === 6 && info ? detail\n            : tk === 7 ? offLayoutText(hidden)\n            : tk >= 4 ? cells[tk]!.displayValue')
    source = source.replace('fullName: cells[tk].fullName', 'fullName: tk === 7 || (tk === 6 && info) ? \"\" : cells[tk]!.fullName')
    source = source.replace('[editGrid, editAction, applyHint, null]', '[editGrid, editAction, inputInfo, offPad]')
    path.write_text(source)
    (root / 'browser-test/hb-input-info.mjs').write_text((assets / 'ui-test.mjs').read_text())
