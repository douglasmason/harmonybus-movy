"""Refresh HarmonyBus follower rows together with one bounded host read."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_follower_snapshot(root: Path) -> None:
    """Use HB's complete read-only page snapshot, retaining older HB fallback."""
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = replace_once(source, '    const touchActions = new Map<number, string>();', '''    const touchActions = new Map<number, string>();
    let followerValues: Record<string, string> | null = null;
    let followerSnapshotAt = -Infinity;
''')
    source = replace_once(source, '        getParam: (k: string) => {', '''        getParam: (k: string) => {
            const followerKey = k.split(':').pop() || '';
            if (followerValues && Object.prototype.hasOwnProperty.call(followerValues, followerKey))
                return followerValues[followerKey];''')
    source = replace_once(source, '        ctl.tick();                 /* exactly one get_param */', '''        const followerKeys = ctl.page?.keys;
        if (Array.isArray(followerKeys) && followerKeys.length === 8 &&
            followerKeys.every((key: string, index: number) => key === `fpath_0_${Math.floor(index / 4)}_${index % 4}`)) {
            const now = Date.now();
            if (now - followerSnapshotAt >= 40) {
                followerSnapshotAt = now;
                const raw = port.getParam(qualify('follower_snapshot'));
                const fields = typeof raw === 'string' ? raw.split('|') : [];
                if (fields.length === 9 && fields[0] === 'fp1' && fields.slice(1).every(Boolean)) {
                    const snapshot: Record<string, string> = {};
                    followerKeys.forEach((key: string, index: number) => { snapshot[key] = fields[index + 1]; });
                    followerValues = snapshot;
                    // Publish every field together; the normal cursor now reads this cache.
                    Object.assign(ctl.state.values, snapshot);
                }
            }
        } else {
            followerValues = null;
            followerSnapshotAt = -Infinity;
        }
        ctl.tick();                 /* cached follower cells, normal I/O elsewhere */''')
    path.write_text(source)
