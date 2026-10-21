"""Keep Movy user data outside the directory replaced by module installers."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_durable_data(root: Path) -> None:
    """Relocate all set/history and preference paths, retaining module paths."""
    legacy_root: str = '/data/UserData/schwung/modules/tools/movy'
    durable_root: str = '/data/UserData/movy'
    for directory in ['src', 'browser-test', 'scripts']:
        for path in sorted((root / directory).rglob('*')):
            if not path.is_file() or path.suffix not in {'.ts', '.mjs', '.sh'}:
                continue
            source: str = path.read_text()
            updated: str = source.replace(legacy_root + '/sets', durable_root + '/sets')
            updated = updated.replace(legacy_root + '/prefs.json', durable_root + '/prefs.json')
            if updated != source:
                path.write_text(updated)
    path: Path = root / 'src/seq/prefs.ts'
    source = path.read_text()
    source = replace_once(source, '    safeWrite(PREFS_PATH, JSON.stringify(prefs));', '''    // Preferences may be written before any Set has created the data folder.
    if (typeof host_ensure_dir === 'function' && !host_ensure_dir('/data/UserData/movy')) return;
    safeWrite(PREFS_PATH, JSON.stringify(prefs));''')
    path.write_text(source)
    path = root / 'browser-test/hb-data-survival.mjs'
    asset: Path = Path(__file__).resolve().parents[1] / 'integration/hb-data-survival.mjs'
    path.write_text(asset.read_text())
