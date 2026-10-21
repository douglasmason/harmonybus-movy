"""Bound background waveform work and stabilize paired performance measurements."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_perf_measurement(root: Path) -> None:
    """Keep the existing performance limit while separating it from JIT order."""
    source_path: Path = root / 'browser-test/perf.mjs'
    source_text: str = source_path.read_text()
    source_text = replace_once(source_text, '''    const small = median50(build(14));
    const large = median50(build(398));''', '''    const smallModel = build(14), largeModel = build(398);
    // Equal warm-up avoids comparing different JIT tiers. Alternate paired
    // batches so runner load and measurement order affect both model sizes.
    for (let index = 0; index < 200; index++) {
        smallModel.getViewModel(); largeModel.getViewModel();
    }
    const smallRuns = [], largeRuns = [];
    for (let batch = 0; batch < 10; batch++) {
        if (batch % 2) {largeRuns.push(median50(largeModel)); smallRuns.push(median50(smallModel));}
        else {smallRuns.push(median50(smallModel)); largeRuns.push(median50(largeModel));}
    }
    const small = median(smallRuns), large = median(largeRuns);''')
    source_path.write_text(source_text)

    waveform_path: Path = root / 'src/model/wav-peaks.ts'
    waveform_source: str = waveform_path.read_text()
    waveform_source = replace_once(waveform_source, 'const BLOCKS_PER_TICK = 2;',
                                   'const BLOCKS_PER_TICK = 1; // leave headroom for MIDI/UI between reads')
    waveform_source = replace_once(waveform_source, 'const BLOCK_BYTES     = 32768;', 'const BLOCK_BYTES     = 16384;')
    waveform_source = replace_once(waveform_source, 'const MAX_BLOCKS      = 64;', 'const MAX_BLOCKS      = 128;')
    waveform_path.write_text(waveform_source)
