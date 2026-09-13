"""Forward coalesced pad pressure through the audio-thread held-note ledger."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_arp_pressure(root: Path) -> None:
    """Preserve each source pad's ownership while updating repeating velocities."""
    path: Path = root / 'src/track/pad-route.ts'
    source: str = path.read_text()
    source = replace_once(source, "let pushedVel = '';", """let pushedVel = '';
const pressure = new Map<number, number>();
export function queuePadPressure(pad: number, value: number): void {
    if (pad >= 68 && pad <= 99) pressure.set(pad, value & 127);
}
export function clearPadPressure(pad: number): void { pressure.delete(pad); }
""")
    source = replace_once(source, "        send('padmap', next);", "        pressure.clear();\n        send('padmap', next);")
    source = replace_once(source, "    const vel = seqState.fullVelocity", """    if (pressure.size) {
        send('padpressure', Array.from(pressure, ([pad, value]) => pad + ',' + value).join(';'));
        pressure.clear();
    }
    const vel = seqState.fullVelocity""")
    source = replace_once(source, "export function resetPadRoute(): void {", "export function resetPadRoute(): void {\n    pressure.clear();")
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text()
    source = "import { queuePadPressure, clearPadPressure } from '../track/pad-route.js';\n" + source
    source = replace_once(source, "    } else refusedThisBoot = false;", """    } else refusedThisBoot = false;
    if ((data[0] & 0xF0) === 0xA0 && data[1] >= 68 && data[1] <= 99) {
        queuePadPressure(data[1], data[2]);
        return;
    }
    if ((data[0] & 0xF0) === 0x90 || (data[0] & 0xF0) === 0x80)
        clearPadPressure(data[1]);
""")
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/pad_route.rs'
    source = path.read_text()
    source = replace_once(source, '    pub fn active(&self) -> bool {', '''    /// Resolve pressure from the held owner, never the current pad layout.
    pub fn pressure(&self, pad: u8, value: u8) -> Option<(usize, u8, u8)> {
        let index = pad.checked_sub(PAD_MIN)? as usize;
        let (chain, pitch) = *self.held.get(index)?.as_ref()?;
        Some((chain, pitch, value.min(127)))
    }

    pub fn active(&self) -> bool {''')
    source = replace_once(source, '    fn routes_a_pad_to_the_mapped_pitch() {', '''    fn pressure_retains_owner_and_zero_does_not_release() {
        let mut r = PadRoute::new();
        r.set_map(&map_for(2, 60));
        assert_eq!(r.pressure(PAD_MIN, 90), None);
        r.route(0x90, PAD_MIN, 100);
        r.route(0x90, PAD_MIN + 1, 100);
        r.set_map(&map_for(3, 72));
        assert_eq!(r.pressure(PAD_MIN, 0), Some((2, 60, 0)));
        assert_eq!(r.pressure(PAD_MIN + 1, 80), Some((2, 61, 80)));
        assert_eq!(r.route(0x80, PAD_MIN, 0), Some((2, 60, 0, false)));
        assert_eq!(r.pressure(PAD_MIN, 90), None);
        r.drain_held();
        assert_eq!(r.pressure(PAD_MIN + 1, 90), None);
    }

    #[test]
    fn routes_a_pad_to_the_mapped_pitch() {''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source = path.read_text()
    source = replace_once(source, '            "padmap" => {', '''            "padpressure" => {
                for event in val.split(';') {
                    let Some((pad, pressure)) = event.split_once(',') else { continue };
                    let (Ok(pad), Ok(pressure)) = (pad.parse::<u8>(), pressure.parse::<u8>()) else { continue };
                    if let Some((chain, pitch, pressure)) = self.pads.pressure(pad, pressure) {
                        self.chains.on_midi(chain, &[0xA0, pitch, pressure], MOVE_MIDI_SOURCE_INTERNAL);
                    }
                }
            }
            "padmap" => {''')
    path.write_text(source)

    path = root / 'browser-test/logic/tracks-chain.mjs'
    source = path.read_text().replace('const { syncPadRoute, resetPadRoute, engineOwnsPads }', 'const { syncPadRoute, resetPadRoute, engineOwnsPads, queuePadPressure, clearPadPressure }')
    source = replace_once(source, "  /* A re-dlopened engine has no map; claiming otherwise leaves pads dead. */", """  queuePadPressure(68, 30); queuePadPressure(68, 75);
  queuePadPressure(69, 50);
  syncPadRoute(send);
  eq('pressure coalesces per pad into one write', sent.length, 1);
  eq('pressure uses physical pad and latest value', sent[0][1], '68,75;69,50');
  sent.length = 0;
  queuePadPressure(68, 40); clearPadPressure(68);
  syncPadRoute(send);
  eq('note release cancels queued pressure', sent.length, 0);
  queuePadPressure(68, 40); resetPadRoute(); syncPadRoute(send);
  eq('reset drops stale pressure', sent.filter(s => s[0] === 'padpressure').length, 0);

  /* A re-dlopened engine has no map; claiming otherwise leaves pads dead. */""")
    path.write_text(source)
