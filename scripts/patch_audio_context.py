"""Remove temporary allocations from the existing audio-thread context path."""
from pathlib import Path
import shutil
import subprocess


def patch_audio_context(root: Path) -> None:
    """Apply the narrow source patch and install native regression/benchmark code."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/audio-context'
    subprocess.run(['git', '-C', str(root), 'apply', '--check', str(assets / 'audio-context.patch')], check=True)
    subprocess.run(['git', '-C', str(root), 'apply', str(assets / 'audio-context.patch')], check=True)
    map_source_to_destination: dict[str, str] = {
        'hb_context.rs': 'engine/crates/movy-dsp/src/hb_context.rs',
        'context_bench.rs': 'engine/crates/movy-dsp/tests/support/context_bench.rs',
        'audio_context_allocations.rs': 'engine/crates/movy-dsp/tests/audio_context_allocations.rs',
        'hb_context_benchmark.rs': 'engine/crates/movy-dsp/examples/hb_context_benchmark.rs',
    }
    for source, destination in map_source_to_destination.items():
        target: Path = root / destination
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(assets / source, target)
    print('Audio context: borrowed fixed-buffer reads and allocation-free Humanize parsing')
