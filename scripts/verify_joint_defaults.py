"""Check the executed UI template, rather than a second copy of its presets."""
import argparse
import json
import subprocess
import tempfile
from pathlib import Path


def main() -> None:
    """Extract actual TypeScript results and load each through HarmonyBus."""
    parser: argparse.ArgumentParser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("movy_root", type=Path)
    parser.add_argument("harmonybus_root", type=Path)
    arguments: argparse.Namespace = parser.parse_args()
    movy: Path = arguments.movy_root.resolve()
    harmonybus: Path = arguments.harmonybus_root.resolve()
    repository: Path = Path(__file__).resolve().parent.parent
    temporary: str
    with tempfile.TemporaryDirectory(prefix="joint-defaults-") as temporary:
        root: Path = Path(temporary)
        presets_path: Path = root / "presets.json"
        subprocess.run(["node", "browser-test/hb-joint-defaults.mjs", str(presets_path)], cwd=movy, check=True)
        presets: list[str] = json.loads(presets_path.read_text())
        executable: Path = root / "verify"
        subprocess.run(["cc", "-std=c11", "-D_POSIX_C_SOURCE=200809L", "-O1",
                        "-I", str(harmonybus / "modules/harmonybus/dsp"),
                        str(repository / "tests/joint_defaults.c"),
                        str(harmonybus / "src/harmony_core.c"), "-lm", "-o", str(executable)], check=True)
        subprocess.run([str(executable), *presets], check=True)


if __name__ == "__main__":
    main()
