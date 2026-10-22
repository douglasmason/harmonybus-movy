"""Compile actor-source projections alongside the real Movy DSP and sequencer."""
from pathlib import Path


def patch_actor_source(root: Path) -> None:
    """Install the shared-snapshot adapters without enabling playback routing."""
    assets: Path = Path(__file__).resolve().parents[1] / "integration/actor-source"
    destination: Path = root / "engine/crates/movy-dsp/src/actor_source"
    destination.mkdir(exist_ok=True)
    for filename in ("clip_source_timing.rs", "pitch_material.rs", "mod.rs"):
        (destination / filename).write_text((assets / filename).read_text())
    path: Path = destination.parent / "lib.rs"
    source: str = path.read_text()
    if "mod actor_source;" not in source:
        source = source.replace("mod hb_loop;", "mod hb_loop;\nmod actor_source;", 1)
    path.write_text(source)
