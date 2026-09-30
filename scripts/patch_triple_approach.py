"""Add Triple Approach routing with independently recorded note identities."""
from pathlib import Path


def patch_triple_approach(root: Path) -> None:
    """Extend the existing piano alias transport, retaining its legacy format."""
    path: Path = root / 'src/keyboard/layouts.ts'
    source: str = path.read_text().replace("'Inline', 'Approach']", "'Inline', 'Approach', 'Triple Approach']").replace("'Piano', 'Approach']", "'Piano', 'Approach', 'Triple Approach']")
    source = source.replace('export const LAYOUT_APPROACH = 2;', 'export const LAYOUT_APPROACH = 2;\nexport const LAYOUT_TRIPLE_APPROACH = 3;')
    source = source.replace('if (layout === LAYOUT_APPROACH) {', 'if (layout === LAYOUT_TRIPLE_APPROACH) {\n            pitch = row ? -1 : degreeToPitch(base, degrees, col);\n        } else if (layout === LAYOUT_APPROACH) {')
    path.write_text(source)
    path = root / 'src/seq/main-page.ts'
    source = path.read_text().replace("'Inline', 'Approach'];", "'Inline', 'Approach', 'Triple Approach'];").replace('keyboardState.layout === 2 ? 4 :', 'keyboardState.layout >= 2 ? keyboardState.layout + 2 :').replace('sel === 4 ? 2 : sel % 2', 'sel >= 4 ? sel - 2 : sel % 2')
    path.write_text(source)
    path = root / 'src/keyboard/harmony-pads.ts'
    source = path.read_text().replace('keyboardState.layout !== LAYOUT_APPROACH))', 'keyboardState.layout !== LAYOUT_APPROACH && keyboardState.layout !== 3))')
    source = source.replace('    if (index < 0 || index >= 32 || ![1,3].includes(index >> 3)', '    if(keyboardState.layout===3){const map=padMapFor(track);return index>=8&&index<32&&map[index%8]>=0?map[index%8]:-1;}\n    if (index < 0 || index >= 32 || ![1,3].includes(index >> 3)')
    source = source.replace('export function pianoApproachIdentity(target: number): number {\n    return', 'export function approachRowCode(index: number): number {return keyboardState.layout===3?index>>3:0;}\nexport function pianoApproachIdentity(target: number, row = 0): number {\n    if(row)return (target+32*row)%128;\n    return')
    source = source.replace('const identity = pianoApproachIdentity(target);', 'const identity = pianoApproachIdentity(target,approachRowCode(index));')
    source = source.replace("port.setParam('midi_fx1:pad_preview_inputs', request + suffix);", "const rows=keyboardState.layout===3&&suffix?':'+targets.map((target,index)=>target>=0?approachRowCode(index):0).join(''):'';\n    port.setParam('midi_fx1:pad_preview_inputs', request + suffix + rows + ';' + (keyboardState.layout===2||keyboardState.layout===3?'1':'0'));")
    path.write_text(source)
    path = root / 'src/seq/pads.ts'
    source = path.read_text().replace('import { pianoApproachTarget, pianoApproachIdentity,', 'import { approachRowCode, pianoApproachTarget, pianoApproachIdentity,').replace('pianoApproachIdentity(target);', 'pianoApproachIdentity(target,approachRowCode(index));')
    path.write_text(source)
    path = root / 'src/track/pad-route.ts'
    source = path.read_text().replace('import { pianoApproachTarget }', 'import { approachRowCode, pianoApproachTarget }').replace('128 + pianoApproachTarget(t, i)', '(approachRowCode(i)?256+128*(approachRowCode(i)-1):128) + pianoApproachTarget(t, i)')
    path.write_text(source)
    path = root / 'src/keyboard/handler.ts'
    source = path.read_text().replace('import { pianoApproachTarget }', 'import { approachRowCode, pianoApproachTarget }').replace("midiNote + ',' + (target - midiNote)", "midiNote + ',' + (target - midiNote) + ',' + (approachRowCode(padNote-padMin)?approachRowCode(padNote-padMin)-1:3)")
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/pad_route.rs'
    source = path.read_text().replace('        let target = *self.map.get(index)? - 128;', '''        let encoded=*self.map.get(index)?;
        if (256..640).contains(&encoded) {let target=(encoded-256)%128;let row=(encoded-256)/128+1;let identity=(target+32*row)%128;return Some((identity as u8,target-identity));}
        let target = encoded - 128;''')
    source = source.replace('    pub fn active(&self) -> bool {', '''    pub fn approach_row(&self,pad:u8)->i16 {let index=pad.saturating_sub(PAD_MIN) as usize;self.map.get(index).filter(|value|**value>=256&&**value<640).map_or(3,|value|(*value-256)/128)}
    pub fn active(&self) -> bool {''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text().replace('&format!("{},{}", identity, shift)', '&format!("{},{},{}", identity, shift,i.pads.approach_row(d1))')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    source = path.read_text().replace('(4095u64<<43)', '(4095u64<<43) | (255u64<<55)').replace('(actions[LANES]>>2)&3>2', '!alias_valid(actions[LANES])')
    source = source.replace('(approach&63)>50','(approach&63)>58').replace('(14..=15).contains(&(approach&63))','(approach&63)==14').replace('code in 1..=50u64','code in 1..=58u64').replace('if code==14||code==15','if code==14').replace('[14,15,51,63,64,65]','[14,59,63,64,65]')
    source += '''
fn alias_shift(word:u64)->i32 {match (word>>2)&3 {1=>-36,2=>36,3=>(word>>55) as u8 as i8 as i32,_=>0}}
fn alias_valid(word:u64)->bool {if (word>>2)&3==3 {matches!(alias_shift(word),-96|-64|-32|32|64|96)}else{word>>55==0}}
'''
    source = source.replace('let shift=match (words[LANES]>>2)&3 {1=>-36,2=>36,_=>return (normal,actions)};', 'let shift=alias_shift(words[LANES]);if shift==0{return (normal,actions);}')
    source = source.replace('let (identity,marker)=if resolution<64', '''if (words[LANES]>>2)&3==3 {let offset=if shift<0 {-shift}else{128-shift};let identity=(resolution+offset)%128;words[LANES]=(words[LANES]&!(255u64<<55))|(((resolution-identity) as i8 as u8 as u64)<<55);return(identity as u8,Some(words));}
    let (identity,marker)=if resolution<64''')
    path.write_text(source)
    for name in ['browser-test/logic/keyboard.mjs','browser-test/logic/params-pages.mjs']:
        path=root/name
        source=path.read_text().replace('"Piano","Approach"','"Piano","Approach","Triple Approach"').replace('"Inline","Approach"','"Inline","Approach","Triple Approach"').replace("eq('layout clamped', keyboardState.layout, 2);", "eq('layout clamped', keyboardState.layout, 3);")
        path.write_text(source)

    path=root/'browser-test/hb-pad-colors.mjs'
    source=path.read_text().replace("assert.equal(key,'midi_fx1:pad_preview_inputs');request=value;", "assert.equal(key,'midi_fx1:pad_preview_inputs');request=value.replace(/;[01]$/, '');")
    path.write_text(source)
    path=root/'engine/crates/seq-core/src/recorded_actions.rs'
    path.write_text(path.read_text()+'''
#[cfg(test)] mod triple_alias_tests {
    use super::*;
    #[test] fn all_rows_survive_transpose_and_recording() {
        for target in 0..128i32 {for row in 1..=3 {for transpose in [-24,0,24] {
            let identity=(target+32*row)%128;let shift=target-identity;
            let mut actions=[0;LANES+1];actions[LANES]=12|((shift as i8 as u8 as u64)<<55)|((51u64|(((row-1) as u64)<<6))<<43);
            assert_eq!(parse(&format!("ra4,{}",payload(identity as u8,actions))),Some((identity as u8,actions)));
            let (note,projected)=piano_emit(identity as u8,0,Some(actions),None,None,transpose);
            let word=projected.unwrap()[LANES];let mut resolution=target+transpose;while resolution<0{resolution+=12;}while resolution>127{resolution-=12;}
            assert_eq!(note as i32+alias_shift(word),resolution);assert!(alias_valid(word));
            assert_eq!((word>>43)&2047,(actions[LANES]>>43)&2047);
        }}}
    }
}
''')
    path=root/'engine/crates/movy-dsp/src/pad_route.rs'
    path.write_text(path.read_text()+'''
#[cfg(test)] mod triple_route_tests {
    use super::*;
    #[test] fn four_rows_have_independent_owners() {
        for target in 0..128i16 {let mut route=PadRoute::new();let mut map=[-1i16;32];map[0]=target;for row in 1..=3{map[row*8]=256+(row as i16-1)*128+target;}
            assert!(route.set_map(&format!("2,{}",map.iter().map(|v|v.to_string()).collect::<Vec<_>>().join(","))));
            let mut owners=std::collections::HashSet::new();for row in 0..4{let result=route.route(0x90,PAD_MIN+row*8,99).unwrap();assert!(owners.insert(result.1));}
            for row in 0..4{assert!(route.route(0x80,PAD_MIN+row*8,0).is_some());}
        }
    }
}
''')

    for name in ['src/renderer/hb-performance.ts','src/renderer/schwung-page.ts','src/seq/flags-def.ts']:
        path=root/name
        source=path.read_text().replace("['Steps', 'Perform', 'Approach']","['Steps', 'Perform 1', 'Perform 2']").replace("['Steps','Perform','Approach']","['Steps','Perform 1','Perform 2']").replace("['STEPS','PERFORM','APPROACH']","['STEPS','PERFORM 1','PERFORM 2']").replace("'APPROACH T'","'PERFORM 2 T'").replace("v === 'Approach' ||", "v === 'Perform 2' || v === 'Approach' ||").replace("v === 'Perform' ||", "v === 'Perform 1' || v === 'Perform' ||")
        path.write_text(source)
