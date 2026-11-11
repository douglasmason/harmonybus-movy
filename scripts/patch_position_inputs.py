"""Observe existing LFO/Field signals before the shared sequencer clock."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_position_inputs(root: Path) -> None:
    """Install allocation-free source observation and independent UI selectors."""
    assets: Path = Path(__file__).resolve().parents[1] / "integration/actor-source"
    path: Path = root / "engine/crates/movy-dsp/src/chain_slots.rs"
    path.write_text(path.read_text() + "\n" + (assets / "position_bridge.rs").read_text())
    path = root / "engine/crates/movy-dsp/src/lib.rs"
    source: str = path.read_text()
    source = replace_once(source, "    field_frames: usize,", "    field_frames: usize,\n    position_frames: usize,\n    position_drivers: [[u8;2];16],")
    source = replace_once(source, "            field_frames: 0,", "            field_frames: 0,\n            position_frames: 0,\n            position_drivers: [[0;2];16],")
    source = replace_once(source, "        self.field_frames+=out_audio.len()/2;", """        let drivers=std::array::from_fn(|actor|{
            let route=self.engine.source_routes[actor];
            if self.engine.playing {[route.instrument_driver,route.hb_render_driver]}else{[0;2]}
        });
        self.position_frames=self.position_frames.saturating_add(out_audio.len()/2);
        if drivers!=self.position_drivers || self.position_frames>=host::sample_rate().max(100) as usize/100 {
            self.position_frames=0;self.position_drivers=drivers;
            self.engine.source_position_inputs=self.chains.sequence_position_inputs(drivers);
        }
        self.field_frames+=out_audio.len()/2;""")
    path.write_text(source)
    path = root / "engine/crates/seq-core/src/persist.rs"
    source = replace_once(path.read_text(), "    engine.source_routes.fill(Default::default());", "    engine.source_routes.fill(Default::default());\n    engine.source_position_inputs=Default::default();")
    path.write_text(source)
