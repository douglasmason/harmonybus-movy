"""Batch surface input and recording using the existing Schwung parameter transport."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_surface_input(root: Path) -> None:
    """Keep routing and recording together in bounded, idempotent engine batches."""
    source_root: Path = Path(__file__).resolve().parent.parent
    destination: Path = root / 'engine/crates/movy-dsp/src'
    (destination / 'surface_route.rs').write_text((source_root / 'integration/launchpad/surface_route.rs').read_text())
    path: Path = destination / 'lib.rs'
    source: str = path.read_text()
    source = replace_once(source, 'mod pad_route;', 'mod pad_route;\nmod surface_route;')
    source = replace_once(source, '    pads: PadRoute,', '    pads: PadRoute,\n    surface: surface_route::SurfaceRoute,')
    source = replace_once(source, '            pads: PadRoute::new(),', '            pads: PadRoute::new(),\n            surface: surface_route::SurfaceRoute::new(),')
    source = replace_once(source, '    fn set_param(&mut self, key: &str, val: &str) {', '''    fn surface_event(&mut self, event: surface_route::Event) {
        let track = event.track;
        if let Some((shift, row)) = event.approach {
            self.chains.set_param(track, "midi_fx1:hb_movy_input_approach",
                &format!("{},{},{}", event.pitch, shift, row));
        }
        if event.status == 0xa0 {
            self.chains.set_param(track, "midi_fx1:hb_pressure_full_velocity",
                if event.full_velocity { "1" } else { "0" });
        }
        self.chains.on_midi(track, &[event.status, event.pitch, event.value], MOVE_MIDI_SOURCE_INTERNAL);
        if event.status == 0x90 {
            let context = self.chains.hb_input_context();
            self.engine.follower_input_context(&context);
            for _ in 0..64 {
                let Some(message) = self.chains.get_param(track, "midi_fx1:hb_record_action") else { break; };
                if !["ra1,", "ra2,", "ra3,", "ra4,"].iter().any(|prefix| message.starts_with(prefix)) { break; }
                self.engine.recorded_action(track, &message);
            }
            self.engine.live_note_on(track, event.pitch, event.value);
        } else if event.status == 0x80 {
            self.engine.live_note_off(track, event.pitch);
        } else if event.status == 0xa0 {
            self.engine.live_poly_pressure(track, event.pitch, event.value);
        }
    }

    fn set_param(&mut self, key: &str, val: &str) {''')
    source = replace_once(source, '            "padmap" => {', '''            "surface_events" => {
                for event in self.surface.batch(val).into_iter().flatten() { self.surface_event(event); }
            }
            "surface_release" => {
                if let Ok(fence) = val.parse::<u64>() {
                    for event in self.surface.release_all(fence).into_iter().flatten() { self.surface_event(event); }
                }
            }
            "padmap" => {''')
    path.write_text(source)
