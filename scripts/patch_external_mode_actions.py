"""Share the canonical Move contextual button owner with Launchpad X/Mini right edges."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_external_mode_actions(root: Path) -> None:
    """Add seven side buttons without repurposing eight operation buttons or latch."""
    path: Path = root / 'src/surfaces/launchpad.ts'
    source: str = path.read_text()
    source = """import {onMidiMessageInternal} from '../midi/router.js';
import {modeButtonColor,modeActionDescriptors} from '../seq/mode-buttons.js';
import {WHITE_DIM,WHITE_BRIGHT,C_WHITE,C_DARKGREY,C_LIGHTGREY,C_GREEN,C_REC_RED} from '../seq/colors.js';
import {fieldEraseActive} from '../seq/field-play.js';
import {gridEraseActive} from '../seq/grid.js';
""" + source
    source = replace_once(source, 'let ledCache: number[] = new Array(73).fill(-1);',
        '''// 64 pads + 8 top operation keys + dedicated latch + 7 right-side actions.
let ledCache: number[] = new Array(80).fill(-1);
const sideToMoveCc=[50,51,118,88,58,119,60] as const;
const sideHeld=new Set<number>();
const rightCc=(slot:number):number=>19+slot*10;
function releaseRightActions():void{
    for(const slot of sideHeld)onMidiMessageInternal([176,sideToMoveCc[slot],0]);
    sideHeld.clear();
}
''')
    source = replace_once(source, '    controls.clear(); modifier = false;',
        '    controls.clear();releaseRightActions(); modifier = false;')
    source = replace_once(source,
        '''    desired.push(modifier ? (model === 1 ? 63 : 120) : (model === 1 ? 12 : 0));''',
        '''    desired.push(modifier ? (model === 1 ? 63 : 120) : (model === 1 ? 12 : 0));
    if(model!==1){
        // One read-only descriptor snapshot per LED frame. No native polls.
        const actions=modeActionDescriptors();
        for(let slot=0;slot<7;slot++){
            const cc=sideToMoveCc[slot],action=actions.find(item=>item.cc===cc);
            const state=modeButtonColor(cc,WHITE_DIM);
            const erasing=cc===119&&(fieldEraseActive()||gridEraseActive());
            desired.push(state===0||action&&!action.available?0:erasing?C_REC_RED:
                sideHeld.has(slot)?C_WHITE:action?.active?C_GREEN:state===WHITE_BRIGHT?C_WHITE:C_LIGHTGREY);
        }
    }''')
    source = replace_once(source,
        '    const changed: number[] = desired[72] !== ledCache[72] ? [72] : [];',
        '    const changed: number[] = desired[72] !== ledCache[72] ? [72] : [];\n    const ledCount=model===1?73:80;')
    source = replace_once(source,
        'for (let checked = 0; checked < 73 && changed.length < (model === 1 ? 2 : 73); checked++) {\n        const index = scan++ % 73;',
        'for (let checked = 0; checked < ledCount && changed.length < (model === 1 ? 2 : ledCount); checked++) {\n        const index = scan++ % ledCount;')
    source = replace_once(source,
        'index < 72 ? profile.topCc + index - 64 : profile.modifier;',
        'index < 72 ? profile.topCc + index - 64 : index===72?profile.modifier:rightCc(index-73);')
    source = replace_once(source,
        '    if (isModifier) { modifier = type !== 128 && value > 0; return; }',
        '''    if (isModifier) { modifier = type !== 128 && value > 0; return; }
    // X/Mini MK3: the upper seven of the eight right-side buttons are
    // dedicated contextual actions. Slot 7 (CC 89) remains the latch modifier.
    // Legacy has a distinct wiring and keeps its previous mapping.
    if(model!==1&&type===176&&note>=19&&note<=79&&note%10===9){
        const slot=(note-19)/10,cc=sideToMoveCc[slot];
        if(value>0){
            if(sideHeld.has(slot))return;
            sideHeld.add(slot);
        }else{
            if(!sideHeld.delete(slot))return;
        }
        onMidiMessageInternal([176,cc,value]);
        sampledAt=-Infinity;
        return;
    }''')
    # Field explicitly passed the Launchpad's latch modifier. Include the
    # independent X eraser without changing the modifier's existing behavior.
    source = replace_once(source,
        "fieldPad('launchpad',index,type===144&&value>0,8,8,modifier)",
        "fieldPad('launchpad',index,type===144&&value>0,8,8,modifier||fieldEraseActive())")
    path.write_text(source)

    # The seven new lamps share the existing complete SysEx transaction.
    path = root / 'browser-test/hb-launchpad.mjs'
    source = path.read_text()
    source = replace_once(source,
        "assert.equal((firstFrame.length-8)/5,73,'both completed banks paint in one RGB message');",
        "assert.equal((firstFrame.length-8)/5,80,'pads, eight operations, latch and seven actions paint in one RGB message');")
    source = replace_once(source,
        "assert.equal((miniFrame.length-8)/5,73,'Mini paints the same complete grid, top controls and modifier');",
        "assert.equal((miniFrame.length-8)/5,80,'Mini paints the same full grid, top operations and right actions');")
    source = replace_once(source, "Array.from({length:73},(_,index)=>miniFrame[8+index*5])",
        "Array.from({length:80},(_,index)=>miniFrame[8+index*5])")
    path.write_text(source)
