"""Piano gaps use explicit per-onset chromatic approaches on supporting HB tracks."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_piano_approach(root: Path) -> None:
    path = root / 'src/seq/pads.ts'
    source = path.read_text()
    source = "import { pianoApproachTarget, pianoApproachIdentity } from '../keyboard/harmony-pads.js';\nexport { pianoApproachTarget, pianoApproachIdentity } from '../keyboard/harmony-pads.js';\n" + source
    source = replace_once(source, '    return padMapFor(track)[padNote - padMin] ?? -1;', '''    const index = padNote - padMin;
    const target = pianoApproachTarget(track, index);
    return target < 0 ? padMapFor(track)[index] ?? -1 : pianoApproachIdentity(target);''')
    path.write_text(source)
    path = root / 'src/track/pad-route.ts'
    source = "import { pianoApproachTarget } from '../keyboard/harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, ': padPitch(t, pad, PAD_MIN));', ': pianoApproachTarget(t, i) >= 0 ? 128 + pianoApproachTarget(t, i) : padPitch(t, pad, PAD_MIN));')
    path.write_text(source)
    path = root / 'src/keyboard/handler.ts'
    source = "import { pianoApproachTarget } from './harmony-pads.js';\n" + path.read_text()
    source = replace_once(source, '    keyboardState.lastPlayedNote = midiNote;', '''    const approachTarget = pianoApproachTarget(track, padNote - padMin);
    keyboardState.lastPlayedNote = approachTarget >= 0 ? Math.max(0, approachTarget - 1) : midiNote;''')
    source = replace_once(source, '    if (!engineOwnsPads(track)) portFor(track).sendMidi(MidiNoteOn, midiNote, vel);', '''    if (!engineOwnsPads(track)) {
        const target = pianoApproachTarget(track, padNote - padMin);
        if (target >= 0) portFor(track).setParam('midi_fx1:hb_movy_input_approach', midiNote + ',' + (target - midiNote));
        portFor(track).sendMidi(MidiNoteOn, midiNote, vel);
    }''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/pad_route.rs'
    source = path.read_text()
    source = replace_once(source, '    pub fn active(&self) -> bool {', '''    /// Encoded gap targets keep their onset identity outside the visible two
    /// piano octaves. The held ledger still owns releases and pressure.
    pub fn approach(&self, pad: u8) -> Option<(u8, i16)> {
        let index = pad.checked_sub(PAD_MIN)? as usize;
        let target = *self.map.get(index)? - 128;
        if !(0..=127).contains(&target) { return None; }
        let identity = if target < 64 { target + 36 } else { target - 36 };
        Some((identity as u8, target - identity))
    }

    pub fn active(&self) -> bool {''')
    source = replace_once(source, '        match status & 0xF0 {', '        match if status & 0xF0 == 0x90 && d2 == 0 { 0x80 } else { status & 0xF0 } {')
    source = replace_once(source, '                let pitch = self.map[idx];', '''                let pitch = self.approach(d1).map_or(self.map[idx], |(identity, _)| identity as i16);''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, '                    let m = if on { [0x90, pitch, vel] } else { [0x80, pitch, 0] };', '''                    if on {
                        if let Some((identity, shift)) = i.pads.approach(d1) {
                            i.chains.set_param(chain, "midi_fx1:hb_movy_input_approach", &format!("{},{}", identity, shift));
                        }
                    }
                    let m = if on { [0x90, pitch, vel] } else { [0x80, pitch, 0] };''')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    source = path.read_text().replace('actions[16]>2', '(actions[16]>10 || actions[16]&3>2)')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/follower_input.rs'
    source = path.read_text()
    source = replace_once(source, '''        let offset=pitch as i32+self.transpose as i32-self.root as i32;''', '''        let mut mapped = self.project_unbounded(pitch as i32, target);
        while mapped<0 { mapped+=12; }
        while mapped>127 { mapped-=12; }
        mapped as u8
    }
    pub fn project_unbounded(self, pitch: i32, target: Self) -> i32 {
        let offset=pitch+self.transpose as i32-self.root as i32;''')
    source = replace_once(source, '''        let mut mapped=octave*12+target.root as i32+SCALES[target.scale as usize-1][degree]+alteration-self.transpose as i32;
        // Preserve pitch class at MIDI limits instead of clamping to C/G.
        while mapped<0 { mapped+=12; }
        while mapped>127 { mapped-=12; }
        mapped as u8''', '''        octave*12+target.root as i32+SCALES[target.scale as usize-1][degree]+alteration-self.transpose as i32''')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/engine.rs'
    source = path.read_text()
    source = replace_once(source, '''                        let emit_pitch =
                            (input_pitch as i32 + self.clip_transpose(ti, slot)).clamp(0, 127) as u8;''', '''                        let normal_emit = (input_pitch as i32 + self.clip_transpose(ti, slot)).clamp(0, 127) as u8;
                        let (emit_pitch, emitted_actions) = crate::recorded_actions::piano_emit(
                            n.pitch, normal_emit, n.actions, n.input_key, self.follower_inputs[ti], self.clip_transpose(ti, slot));''')
    source = replace_once(source, '''                            out.push(OutEvent::InputRole {track:ti as u8,pitch:emit_pitch,degree,target});''', '''                            let target = if target >= 0 { (target + emit_pitch as i16 - normal_emit as i16).clamp(0,127) } else {target};
                            out.push(OutEvent::InputRole {track:ti as u8,pitch:emit_pitch,degree,target});''')
    source = replace_once(source, '''actions:if n.rendered {None} else {n.actions}});''', '''actions:if n.rendered {None} else {emitted_actions}});''')
    path.write_text(source)
    path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    source = path.read_text() + '''

/// Resolve the musical input before choosing its private onset identity. This
/// keeps key changes and clip transpose away from the identity's MIDI limits.
pub fn piano_emit(pitch:u8, normal:u8, actions:Option<Actions>, source:Option<crate::follower_input::InputKey>,
    target:Option<crate::follower_input::InputKey>, transpose:i32) -> (u8,Option<Actions>) {
    let Some(mut words)=actions else {return (normal,actions);};
    let shift=match words[16]>>2 {1=>-36,2=>36,_=>return (normal,actions)};
    let resolution=pitch as i32+shift;
    let mut resolution=match (source,target) {
        (Some(source),Some(target))=>source.project_unbounded(resolution,target),
        _=>resolution,
    }+transpose;
    while resolution<0 {resolution+=12;}
    while resolution>127 {resolution-=12;}
    let (identity,marker)=if resolution<64 {(resolution+36,4)}else{(resolution-36,8)};
    words[16]=(words[16]&3)|marker;
    (identity as u8,Some(words))
}
'''
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/pad_route.rs'
    path.write_text(path.read_text() + '''
#[cfg(test)] mod piano_gap_tests {
    use super::*;
    #[test] fn approach_and_resolution_keep_independent_owners() {
        for target in 0..128i16 {
            let mut r=PadRoute::new();let mut map=[-1i16;32];map[0]=target;map[8]=128+target;
            let payload=format!("2,{}",map.iter().map(|v|v.to_string()).collect::<Vec<_>>().join(","));
            assert!(r.set_map(&payload));
            let (identity,shift)=r.approach(PAD_MIN+8).unwrap();assert_eq!(identity as i16+shift,target);
            assert_eq!(r.route(0x90,PAD_MIN+8,93),Some((2,identity,93,true)));
            assert_eq!(r.route(0x90,PAD_MIN,87),Some((2,target as u8,87,true)));
            r.set_map(&format!("3,{}",[-1i16;32].iter().map(|v|v.to_string()).collect::<Vec<_>>().join(",")));
            assert_eq!(r.pressure(PAD_MIN+8,71),Some((2,identity,71)));
            assert_eq!(r.route(0x90,PAD_MIN+8,0),Some((2,identity,0,false)));
            assert_eq!(r.route(0x80,PAD_MIN,0),Some((2,target as u8,0,false)));
        }
    }
}
''')
    path = root / 'engine/crates/seq-core/src/recorded_actions.rs'
    path.write_text(path.read_text() + '''
#[cfg(test)] mod piano_tests {
    use super::*;use crate::follower_input::InputKey;
    #[test] fn preserves_targets_across_keys_registers_and_transpose() {
        for resolution in 0..128i32 { for transpose in -24..=24 {
            let identity=if resolution<64 {resolution+36}else{resolution-36};
            let mut words=[0;17];words[16]=if resolution<64 {4}else{8};
            let source=InputKey {root:0,scale:1,transpose:transpose as i8};
            let stored=(identity-transpose) as u8;
            for root in 0..12 {for scale in 1..=15 {
                let target=InputKey::new(root,scale).unwrap();
                let (note,actions)=piano_emit(stored,0,Some(words),Some(source),Some(target),transpose);
                let actions=actions.unwrap();
                assert_eq!(parse(&format!("ra1,{}",payload(note,actions))),Some((note,actions)));
                let shift=if actions[16]>>2==1 {-36}else{36};
                let mut expected=source.project_unbounded(resolution-transpose,target)+transpose;
                while expected<0 {expected+=12;}while expected>127 {expected-=12;}
                assert_eq!(note as i32+shift,expected);
            }}
        }}
        let mut invalid=[0;17];invalid[16]=11;
        assert!(parse(&format!("ra1,{}",payload(60,invalid))).is_none());
    }
}
''')
