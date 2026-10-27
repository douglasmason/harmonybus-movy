"""Add native-backed chord discovery after the existing Chord Play patches."""
from pathlib import Path
import shutil
import subprocess


def patch_chord_discovery(root: Path) -> None:
    """Apply the reviewed shared-controller changes and copy their assets."""
    assets: Path = Path(__file__).resolve().parent.parent / "integration/chord-play"
    patch_path: Path = assets / "discovery.patch"
    subprocess.run(["git", "apply", "--check", str(patch_path)], cwd=root, check=True)
    subprocess.run(["git", "apply", str(patch_path)], cwd=root, check=True)
    for filename, directory in (("chord-discovery.ts", "src/seq"),
                                ("hb-chord-discovery.mjs", "browser-test")):
        shutil.copyfile(assets / filename, root / directory / filename)


def patch_discovery_context(root: Path) -> None:
    """Connect the completed Chord Play controller to contextual discovery."""
    patch_path: Path = Path(__file__).resolve().parent.parent / "integration/chord-play/contextual.patch"
    subprocess.run(["git", "apply", "--check", str(patch_path)], cwd=root, check=True)
    subprocess.run(["git", "apply", str(patch_path)], cwd=root, check=True)
