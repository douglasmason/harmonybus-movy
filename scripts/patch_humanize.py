"""Add global recorded-input humanization without moving conductor analysis."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_humanize(root: Path) -> None:
    """Reuse clip scheduling, source context, and gate ownership."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/humanize'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'humanize.rs').write_text((assets / 'humanize.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text()+'\npub mod humanize;\n')
    path = core / 'engine.rs'
    source: str = path.read_text().replace('pub struct Engine {','pub struct Engine {\n    pub humanize: crate::humanize::Humanize,')
    source = replace_once(source,'            follower_inputs: [None;16],','            humanize: Default::default(),\n            follower_inputs: [None;16],')
    source = replace_once(source,'        let context=crate::follower_input::parse(message);', '''        let (input,humanize)=message.split_once('|').unwrap_or((message,""));
        let context=crate::follower_input::parse(input);
        self.humanize=crate::humanize::Humanize::parse(humanize,context.map_or(0,|(_,mask)|mask));''')
    anchor: str = '                        if !hb_window.map_or(fire_tick == pos, |window| window.contains(fire_tick,n.gate))'
    source = replace_once(source,anchor,'''                        let seed=crate::humanize::Humanize::seed(ti,slot,fire_tick);
                        // Recording is never changed; only replayed clip events enter this path.
                        let humanize=if self.recording&&self.rec_track==ti {crate::humanize::Humanize::default()} else {self.humanize};
                        let fire_tick=humanize.onset(ti,seed,fire_tick,self.tracks[ti].clips[slot].loop_start_ticks(),clip_end,self.clock.bpm_x100(),snum,sden);
''' + anchor)
    source = replace_once(source,'                        let n = n.clone();','''                        let mut n = n.clone();
                        n.vel=humanize.velocity(ti,seed,n.vel);
                        n.gate=humanize.duration(ti,seed,n.gate);''')
    source = replace_once(source,'hb_modified: hb_window.is_some(),','hb_modified: hb_window.is_some()||humanize.time_active(ti),')
    source += (assets / 'engine_tests.rs').read_text()
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = replace_once(path.read_text(),'''        for instance in self.slots.iter_mut().flatten() {
            if let Some(message)=instance.get_param("midi_fx1:follower_input_context") {''','''        for instance in self.slots.iter_mut().flatten() {
            if let Some(message)=instance.get_param("midi_fx1:follower_input_context_v2") {
                if message.starts_with("fic1,") {return message;}
            }
            if let Some(message)=instance.get_param("midi_fx1:follower_input_context") {''')
    path.write_text(source)
