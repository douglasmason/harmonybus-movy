"""Route shared chord controls to track settings or an operation snapshot."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_chord_state(root: Path) -> None:
    """Keep destination changes atomic and reuse the existing panel controller."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, "const laneEdit = ctl.keyAt(slot) === 'motion_lane';", "const laneEdit = ['motion_lane','chord_edit_target','defaults_editor'].includes(ctl.keyAt(slot));")
    source = replace_once(source, "            if (key.startsWith('motif_') && motifAction(motifPort,key)) {", """            if(key==='motif_edit'&&lanePort.performanceGet('motion_operation')==='Chord/Arp State')return;
            if (key.startsWith('motif_') && motifAction(motifPort,key)) {""")
    source = replace_once(source, '            ctl.render(ctx, { title, bands: BANDS });', """            const editTarget=String(ctl.state.values.chord_edit_target||'Track Settings');
            if(keysOf().includes('chord_edit_target')&&editTarget.startsWith('Lane '))title+=' · '+editTarget;
            ctl.render(ctx, { title, bands: BANDS });""")
    source = replace_once(source, '                ctl.commitEnum(key, index);', "                if(key==='chord_edit_target'&&index===current)return;\n                ctl.commitEnum(key, index);")
    path.write_text(source)

    path = root / 'src/seq/leds.ts'
    source = path.read_text().replace("import { paintHbPerformance }", "import { paintHbPerformance, hbPerformancePage }").replace("import { motifRecordLight }", "import { motifRecordLight, motifEditing }")
    source = replace_once(source, 'export function seqBeatLedsTick(): void {', 'export function seqBeatLedsTick(): void {\n    if(motifEditing() || hbPerformancePage())return;')
    path.write_text(source)
