"""Use Approach and bypassed follower travel for fresh sets, preserving saves."""
from __future__ import annotations

from pathlib import Path
import re


def patch_travel_defaults(root: Path) -> None:
    """Patch initial/reset UI values and only the eight shipped HB seed strings."""
    for relative in ("src/app/init.ts", "src/seq/ui-state.ts"):
        path: Path = root / relative
        source: str = path.read_text()
        before: str = "keyboardState.layout = 0;"
        after: str = "keyboardState.layout = 2;"
        if before not in source and after not in source:
            raise ValueError(f"Missing default layout seam in {relative}")
        path.write_text(source.replace(before, after))
    path = root / "src/keyboard/state.ts"
    source = path.read_text()
    if "layout: 0," not in source and "layout: 2," not in source:
        raise ValueError("Missing initial keyboard layout")
    path.write_text(source.replace("layout: 0,", "layout: 2,"))
    path = root / "src/seq/ui-state.ts"
    source = path.read_text()

    def update_seed(match: re.Match[str]) -> str:
        """Keep every preset field except the legacy travel storage slot."""
        fields: list[str] = match.group(1).split(",")
        if len(fields) != 26:
            raise ValueError("HarmonyBus seed prefix changed")
        fields[23] = "7"  # prefix token followed by values[22]: travel_map=None
        return "'" + ",".join(fields) + ";"

    source, count = re.subn(r"'(hb16,[-0-9,]+);", update_seed, source)
    if count != 8:
        raise ValueError(f"Expected eight HarmonyBus seeds, found {count}")
    source = source.replace("C tonic, Major, Chromatic/4ths", "C tonic, Major, Approach")
    path.write_text(source)
