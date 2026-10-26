"""Preserve musical letter case in the shared Chord Play/Joint Play widgets."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_chord_labels(root: Path) -> None:
    """Register one framed text widget; keep the controller and musical engine."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    (root / 'src/seq/chord-labels.ts').write_text((assets / 'chord-labels.ts').read_text())
    path: Path = root / 'src/font/blit.ts'
    source: str = path.read_text()
    source = replace_once(source, '    glyphFor: GlyphLookup, fallbackAdv: number, gap: number,\n', '    glyphFor: GlyphLookup, fallbackAdv: number, gap: number,\n    fill: (x:number,y:number,w:number,h:number,color:number)=>void = fill_rect,\n')
    source = replace_once(source, '                    fill_rect(cx + s,', '                    fill(cx + s,')
    path.write_text(source)
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), '    entryPoints: [', "    entryPoints: [\n        resolve(root, 'src/seq/chord-labels.ts'),"))
    path = root / 'src/seq/chord-play.ts'
    source = "import {registerChordLabels,chordLabelMetadata} from './chord-labels.js';\n" + path.read_text()
    source = replace_once(source, 'function parameters(native:any[]):any[]{', 'function parameters(native:any[]):any[]{\n    registerChordLabels();')
    source = replace_once(source, '            for(const entry of metadata){', "            for(const entry of metadata){\n                if(entry.key.startsWith('cp_slot_')){const index=Number(entry.key.slice(8)),slot=setup.slots[index];entry.viz={kind:'custom:hb-chord-label'};Object.assign(entry,chordLabelMetadata(index,slot.intent,slot.target,bankStatus?.slots[index]));}")
    source = replace_once(source, "{meta.label=meta.name=(index+1)+' '+bankStatus.slots[index].name;meta.short_name=meta.name;}", '{const slot=setup.slots[index];if(meta.chordName!==bankStatus.slots[index].name||meta.chordIntent!==slot.intent||meta.chordTarget!==slot.target)Object.assign(meta,chordLabelMetadata(index,slot.intent,slot.target,bankStatus.slots[index]));}')
    source = source.replace('harmonyOff(false)', 'harmonyOff()')
    path.write_text(source)
