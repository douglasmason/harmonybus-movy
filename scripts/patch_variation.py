"""Add saved actor variation at the shared clip-emission boundary."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_variation(root: Path) -> None:
    """Reuse native clip ownership, source routing, persistence, Undo and panels."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/variation'
    core: Path = root / 'engine/crates/seq-core/src'
    (core / 'variation.rs').write_text((assets / 'variation.rs').read_text())
    path: Path = core / 'lib.rs'
    path.write_text(path.read_text() + '\npub mod variation;\n')
    path = core / 'engine.rs'
    source: str = replace_once(path.read_text(), 'pub struct Engine {', '''pub struct Engine {
    pub variations: [crate::variation::Variation; NUM_TRACKS],
    variation_seeds: [u32; NUM_TRACKS],''')
    source = replace_once(source, '            source_routes:', '''            variations: [Default::default(); NUM_TRACKS],
            variation_seeds: [1; NUM_TRACKS],
            source_routes:''')
    source = replace_once(source, '    fn start_transport(&mut self) {', '''    fn start_transport(&mut self) {
        for actor in 0..NUM_TRACKS { self.variation_seeds[actor] = self.variations[actor].seed; }''')
    source = replace_once(source, '    fn service_tick(&mut self, out: &mut Vec<OutEvent>) {',
        '    fn service_tick(&mut self, out: &mut Vec<OutEvent>) {\n        self.variation_bar();')
    source = replace_once(source, '                        // Non-destructive clip transpose: shift only the emitted', '''                        let mut n = n;
                        let mut gate_override = gate_override;
                        let mut modified = modified;
                        // Conductor/rendered notes and the active recording path remain exact.
                        let config = self.variations[ti];
                        if config.amount > 0 && self.follower_inputs[ti].is_some() && !n.rendered
                            && !(self.recording && self.records_track(ti)) {
                            let clock_slot = self.tracks[clock_track].playing_slot.unwrap_or(slot);
                            let phase = self.source_positions[clock_track];
                            let seed = crate::humanize::Humanize::seed(ti, clock_slot,
                                phase ^ self.variation_seeds[ti].wrapping_mul(0x9e3779b9));
                            let duration = gate_override.unwrap_or_else(||hb_window.map_or(n.gate.max(1), |window| window.duration(n.gate)));
                            // Conservatively protect all operation-bearing notes and bar downbeats
                            // from omission, including imported motif targets.
                            let protected = n.actions.is_some() || phase % (TICKS_PER_STEP * 16) == 0;
                            let Some((velocity, duration)) = config.apply(seed, n.vel, duration, protected) else { return; };
                            n.vel = velocity;
                            gate_override = Some(duration);
                            modified = true;
                        }
                        // Non-destructive clip transpose: shift only the emitted''')
    source += '\n' + (assets / 'engine.rs').read_text() + '\n' + (assets / 'engine_tests.rs').read_text()
    path.write_text(source)
    path = core / 'command.rs'
    source = replace_once(path.read_text(), '| "swing" | "source"', '| "swing" | "source" | "variation"')
    source = replace_once(source, '        "source" => {', '        "variation" => { engine.variation_set(&it.collect::<Vec<_>>().join(" ")); }\n        "source" => {')
    path.write_text(source)
    path = core / 'persist.rs'
    source = replace_once(path.read_text(), '    for (actor, route) in engine.source_routes.iter().enumerate() {', '''    for (actor, config) in engine.variations.iter().enumerate() {
        if *config != Default::default() { s.push_str(&format!("variation {}\\n", config.message(actor))); }
    }
    for (actor, route) in engine.source_routes.iter().enumerate() {''')
    source = replace_once(source, '    engine.source_routes.fill(Default::default());', '''    engine.source_routes.fill(Default::default());
    engine.variations.fill(Default::default());''')
    source = replace_once(source, '            Some("sr") => {', '            Some("variation") => {engine.variation_set(&it.collect::<Vec<_>>().join(" "));}\n            Some("sr") => {')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = replace_once(path.read_text(), '            "source_diagnostics" =>', '''            key if key.starts_with("variation_") => key[10..].parse::<usize>().ok()
                .and_then(|actor|self.engine.variations.get(actor).map(|config|config.message(actor))),
            "source_diagnostics" =>''')
    path.write_text(source)
    path = root / 'src/undo/verbs.ts'
    path.write_text(replace_once(path.read_text(), "'swing', 'source',", "'swing', 'source', 'variation',"))
    (root / 'src/seq/variation-panels.ts').write_text((assets / 'variation-panels.ts').read_text())
    path = root / 'src/seq/joint-panels.ts'
    source = "import { variationParameters, variationKeys, variationPanelGet, variationPanelSet } from './variation-panels.js';\n" + path.read_text()
    source = replace_once(source, '...display,...sourceParameters]', '...display,...sourceParameters,...variationParameters]')
    source = replace_once(source, "        const sourceLevel='joint_sources_'+role;", '''        if(role>0) {
            const level='joint_variation_'+role, keys=variationKeys(role);
            hierarchy.levels[level]={name:name+' Clip Variation',knobs:keys,params:keys.map(key=>({key}))};
            hierarchy.levels['joint_actor_'+role].params.push({level});root.params.push({level});
        }
        const sourceLevel='joint_sources_'+role;''')
    source = replace_once(source, '        const sourceValue=sourcePanelGet(base,bare);', "        const variationValue=variationPanelGet(base,bare);if(variationValue!==null)return key.endsWith(':modulated')?'0':variationValue;\n        const sourceValue=sourcePanelGet(base,bare);")
    source = replace_once(source, '        if(sourcePanelSet(base,bare,value))return true;', '        if(variationPanelSet(base,bare,value))return true;\n        if(sourcePanelSet(base,bare,value))return true;')
    path.write_text(source)
    (root / 'browser-test/hb-variation.mjs').write_text((assets / 'hb-variation.mjs').read_text())
    path = root / 'build/browser.mjs'
    path.write_text(replace_once(path.read_text(), "        resolve(root, 'src/seq/joint-panels.ts'),", "        resolve(root, 'src/seq/joint-panels.ts'),\n        resolve(root, 'src/seq/variation-panels.ts'),"))
    for relative in ('src/seq/constants.ts', 'engine/crates/movy-dsp/src/lib.rs'):
        path = root / relative
        path.write_text(path.read_text().replace('0.71.0-hb214-hbrender1', '0.71.0-hb217-noteops1'))
