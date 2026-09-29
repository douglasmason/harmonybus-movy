"""Route shared chord controls to track settings or an operation snapshot."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_chord_state(root: Path) -> None:
    """Keep destination changes atomic and reuse the existing panel controller."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, "const laneEdit = ctl.keyAt(slot) === 'motion_lane';", "const laneEdit = ['motion_lane','chord_edit_target'].includes(ctl.keyAt(slot));")
    source = replace_once(source, "            if (key.startsWith('motif_') && motifAction(motifPort,key)) {", """            if(key==='chord_state_copy'||(key==='motif_edit'&&lanePort.performanceGet('motion_operation')==='Chord/Arp State')){
                // Commit pending edits to the old destination before switching.
                ctl.revalue();
                lanePort.performanceSet(key,key==='chord_state_copy'?'Copy':'Open');
                touchActions.set(slot,key);reload();
                const page=ctl.pages.findIndex((candidate:any)=>candidate.keys?.includes('chord_mode'));
                if(page>=0)ctl.goToPage(page);
                return;
            }
            if (key.startsWith('motif_') && motifAction(motifPort,key)) {""")
    source = replace_once(source, '            ctl.render(ctx, { title, bands: BANDS });', """            const editTarget=String(ctl.state.values.chord_edit_target||'Track Settings');
            if(keysOf().includes('chord_edit_target')&&editTarget.startsWith('Lane '))title+=' · '+editTarget;
            ctl.render(ctx, { title, bands: BANDS });""")
    source = replace_once(source, '                ctl.commitEnum(key, index);', "                if(key==='chord_edit_target'&&index===current)return;\n                ctl.commitEnum(key, index);")
    path.write_text(source)
