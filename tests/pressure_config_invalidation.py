"""Exercise the generated production setter with lightweight chain test doubles."""
from pathlib import Path
import subprocess
import sys
import tempfile


def main(root: Path) -> None:
    """Compile the actual setter and verify transient pressure versus real edits."""
    source: str = (root / 'engine/crates/movy-dsp/src/chain_slots.rs').read_text()
    start: int = source.index('    pub fn set_param(&mut self, slot: usize, key: &str, val: &str)')
    opening: int = source.index('{', start)
    depth: int = 1
    end: int = opening + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    setter: str = source[start:end]
    harness: str = '''
const MOVY_CHAINS: usize = 16;
struct Idle; impl Idle { fn wake(&mut self, _: usize) {} }
#[derive(Clone)] struct Chain { writes: usize }
impl Chain { fn set_param(&mut self, _: &str, _: &str) { self.writes += 1; } }
struct Slots { idle: Idle, slots: Vec<Option<Chain>>, hb_config_dirty: Vec<bool> }
impl Slots { SETTER }
fn main() {
    let mut slots = Slots { idle: Idle, slots: vec![Some(Chain {writes: 0});16], hb_config_dirty: vec![false;16] };
    for _ in 0..10000 { slots.set_param(3,"midi_fx1:hb_pressure_full_velocity","0"); }
    assert_eq!(slots.slots[3].as_ref().unwrap().writes,10000);
    assert!(!slots.hb_config_dirty.iter().any(|dirty|*dirty),"pressure must not invalidate musical configuration");
    slots.set_param(3,"midi_fx1:chord_mode","Scale Degree");
    assert!(slots.hb_config_dirty[3]); assert_eq!(slots.hb_config_dirty.iter().filter(|dirty|**dirty).count(),1);
    slots.hb_config_dirty.fill(false);
    slots.set_param(3,"midi_fx1:motion_amount","1");
    assert!(slots.hb_config_dirty.iter().all(|dirty|*dirty));
    println!("Pressure: 10000 writes forwarded without config invalidation; track/shared edits still invalidate");
}
'''.replace('SETTER', setter)
    with tempfile.TemporaryDirectory(prefix='pressure-config-') as temporary:
        directory: Path = Path(temporary)
        rust_file: Path = directory / 'test.rs'
        executable: Path = directory / 'test'
        rust_file.write_text(harness)
        subprocess.run(['rustc', '--edition=2021', str(rust_file), '-o', str(executable)], check=True)
        subprocess.run([str(executable)], check=True)


if __name__ == '__main__':
    main(Path(sys.argv[1]))
