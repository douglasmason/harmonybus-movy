"""Keep compact root snapshots aligned with the consolidated six-control page."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_panel_cleanup(root: Path) -> None:
    """Match snapshot width to the root page without changing other panels."""
    path: Path = root / 'src/model/store.ts'
    source: str = replace_once(path.read_text(), 'const count = harmony ? 4 : 8;', "const count = harmony ? 4 : live === 'follower_root' ? 6 : 8;")
    path.write_text(source)
