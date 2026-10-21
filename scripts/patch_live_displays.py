"""Keep live harmony/position readouts coherent instead of polling each cell."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_live_displays(root: Path) -> None:
    """Extend the existing bounded snapshot path to all live harmony pages."""
    source_path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = source_path.read_text()
    source = replace_once(source, "const nextKind = isFollower ? 'follower' : isHarmony ? 'harmony' : '';", """const nextKind = isFollower ? 'follower' : isHarmony ? 'harmony' :
            pageKeys?.includes('next_position') ? 'next_harm' :
            pageKeys?.includes('timing_position') ? 'grid_timing' :
            pageKeys?.includes('inferred_root') ? 'follower_root' : '';""")
    source = replace_once(source, "fields[0] === (isFollower ? 'fp1' : 'hp1')", "fields[0] === (isFollower ? 'fp1' : isHarmony ? 'hp1' : 'dp1')")
    source = replace_once(source, "if (port.setParam(qualify(k), v) !== false) markUiStateDirty();", """if (port.setParam(qualify(k), v) !== false) {
                // A control on a live page must not read its old snapshot back
                // over a just-completed encoder edit.
                followerSnapshotAt = -Infinity;
                if (followerValues) delete followerValues[k.split(':').pop() || ''];
                markUiStateDirty();
            }""")
    source_path.write_text(source)
    source_path = root / 'src/app/tick.ts'
    source = source_path.read_text().replace("key === 'fpath_0_0_0' || key === 'hpath_0'", "key === 'fpath_0_0_0' || key === 'hpath_0' || key === 'next_position' || key === 'timing_position' || key === 'inferred_root'")
    source_path.write_text(source)
    source_path = root / 'src/model/store.ts'
    source = source_path.read_text()
    source = replace_once(source, '    if (!follower && !harmony)', "    const live = keys.includes('next_position') ? 'next_harm' : keys.includes('timing_position') ? 'grid_timing' : keys.includes('inferred_root') ? 'follower_root' : '';\n    if (!follower && !harmony && !live)")
    source = replace_once(source, 'const count = follower ? 8 : 4;', 'const count = harmony ? 4 : 8;')
    source = replace_once(source, "(follower ? 'follower_snapshot' : 'harmony_snapshot')", "(follower ? 'follower_snapshot' : harmony ? 'harmony_snapshot' : live + '_snapshot')")
    source = replace_once(source, "fields[0] === (follower ? 'fp1' : 'hp1')", "fields[0] === (follower ? 'fp1' : harmony ? 'hp1' : 'dp1')")
    source_path.write_text(source)
