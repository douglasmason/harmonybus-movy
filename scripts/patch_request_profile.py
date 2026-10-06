"""Attribute opt-in MIDI/parameter costs without changing host or audio routing."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_request_profile(root: Path) -> None:
    """Bracket external module calls and reuse the existing per-chain clock data."""
    path: Path = root / 'engine/crates/movy-dsp/src/lib.rs'
    source: str = path.read_text()
    # Put the timer around the guard so early returns and failed requests count.
    for function_name, next_name, kind, key_expression in (
        ('on_midi', 'set_param', 'Midi', '"midi"'),
        ('set_param', 'get_param', 'Write', 'cstr(key)'),
        ('get_param', 'get_error', 'Read', 'cstr(key)'),
    ):
        start: int = source.index('unsafe extern "C" fn ' + function_name + '(')
        end: int = source.index('unsafe extern "C" fn ' + next_name + '(', start)
        function: str = source[start:end]
        function = replace_once(function, '    guard(', '''    let profile_start = inst(instance).and_then(|instance| instance.profile.stamp());
    let result = guard(''')
        closing: str = '    })\n}' if function_name == 'get_param' else '    });\n}'
        function = replace_once(function, closing, '''    });
    if let Some(instance) = inst(instance) {
        instance.profile.request_done(audio_profile::Request::''' + kind + ', ' + key_expression + ''', profile_start);
    }
    result
}''')
        source = source[:start] + function + source[end:]
    path.write_text(source)

    path = root / 'engine/crates/movy-dsp/src/chain_cost.rs'
    source = path.read_text()
    source = replace_once(source, 'pub struct CostMeter {', 'pub struct CostMeter {\n    profile_top: (usize, u64),')
    source = replace_once(source, '            ns: vec![0; chains],', '            profile_top: (0, 0),\n            ns: vec![0; chains],')
    source = replace_once(source, '    pub fn add_ns(&mut self, chain: usize, dt: u64) {', '''    /// One render only; clear even when every chain sleeps or the host is absent.
    pub fn begin_profile_block(&mut self) { self.profile_top = (0, 0); }
    pub fn profile_top(&self) -> (usize, u64) { self.profile_top }

    pub fn add_ns(&mut self, chain: usize, dt: u64) {
        if chain < self.ns.len() && dt > self.profile_top.1 { self.profile_top = (chain, dt); }''')
    source = replace_once(source, 'mod tests {', '''mod tests {
    #[test]
    fn profile_top_is_one_block_not_an_independent_held_peak() {
        let mut meter = super::CostMeter::new(16);
        meter.begin_profile_block();
        meter.add_ns(2, 700_000);meter.add_ns(5, 400_000);
        assert_eq!(meter.profile_top(), (2, 700_000));
        meter.end_block();meter.begin_profile_block();
        meter.add_ns(2, 10_000);meter.add_ns(5, 40_000);
        assert_eq!(meter.profile_top(), (5, 40_000));
        meter.begin_profile_block();
        assert_eq!(meter.profile_top(), (0, 0));
    }
''')
    path.write_text(source)
    path = root / 'engine/crates/movy-dsp/src/chain_slots.rs'
    source = path.read_text()
    source = replace_once(source, '    pub fn render(&mut self, out: &mut [i16]) {', '''    pub fn profile_top(&self) -> (usize, u64) { self.cost.profile_top() }

    pub fn render(&mut self, out: &mut [i16]) {
        self.cost.begin_profile_block();''')
    path.write_text(source)
