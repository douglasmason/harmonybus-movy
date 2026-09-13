"""Keep performance releases ahead of parameter reads and background saves."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_performance_touch(root: Path) -> None:
    """Capture the touch owner and defer optional UI work during the gesture."""
    path: Path = root / 'src/renderer/performance-touch.ts'
    path.write_text('''/* Physical knob slots own their release, even across a page/track change. */
const releases = new Map<number, () => void>();
let quietUntil = 0;
export function ownPerformanceTouch(slot: number, release: () => void): void {
    releases.set(slot, release);
}
export function finishPerformanceTouch(slot: number): void {
    releases.delete(slot);
    quietUntil = Date.now() + 100;
}
export function releasePerformanceTouch(slot: number): void {
    const release = releases.get(slot);
    if (!release) return;
    finishPerformanceTouch(slot);
    release();
}
export function performanceTouchActive(): boolean {
    return releases.size > 0 || Date.now() < quietUntil;
}
''')
    path = root / 'src/renderer/schwung-page.ts'
    source: str = path.read_text()
    source = "export { releasePerformanceTouch, performanceTouchActive } from './performance-touch.js';\nimport { ownPerformanceTouch, finishPerformanceTouch, performanceTouchActive } from './performance-touch.js';\n" + source
    source = replace_once(source, '        ctl.reloadIfChanged();', '        if (performanceTouchActive()) return;\n        ctl.reloadIfChanged();')
    source = source.replace("heldKey === 'mod_scale_above')", "heldKey === 'mod_scale_above' || heldKey === 'play_bypass')")
    source = source.replace("key === 'mod_scale_above')", "key === 'mod_scale_above' || key === 'play_bypass')")
    source = replace_once(source, '                touchActions.delete(slot);', '''                touchActions.delete(slot);
                if (heldKey) finishPerformanceTouch(slot);''')
    source = replace_once(source, '''                touchActions.set(slot, key);
                ctl.commitEnum(key, 1);
            }
        },''', '''                touchActions.set(slot, key);
                ownPerformanceTouch(slot, () => {
                    touchActions.delete(slot);
                    ctl.commitEnum(key, 0);
                    ctl.onKnobTouch(slot, false);
                });
                ctl.commitEnum(key, 1);
            }
        },''')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text()
    source = "import { releasePerformanceTouch } from '../renderer/performance-touch.js';\n" + source
    source = replace_once(source, '    if (!data || data.length < 3) return;', '''    if (!data || data.length < 3) return;
    // Commit Off before modal/session dispatch, model lookup, or automation reads.
    if (data[1] < 8 && ((data[0] & 0xF0) === 0x80 ||
        ((data[0] & 0xF0) === 0x90 && data[2] === 0))) releasePerformanceTouch(data[1]);''')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = "import { performanceTouchActive } from '../renderer/performance-touch.js';\n" + source
    source = replace_once(source, 'const modelDirty  = activeModel?.tick() ?? false;', 'const modelDirty  = performanceTouchActive() ? false : (activeModel?.tick() ?? false);')
    source = replace_once(source, 'const masterDirty = masterModel?.tick() ?? false;', 'const masterDirty = performanceTouchActive() ? false : (masterModel?.tick() ?? false);')
    path.write_text(source)
    path = root / 'src/seq/set-session.ts'
    source = path.read_text()
    source = "import { performanceTouchActive } from '../renderer/performance-touch.js';\n" + source
    source = replace_once(source, '    if (!saveNeeded() && !force) return;', '''    if (!saveNeeded() && !force) return;
    // Teardown still saves; periodic autosave waits for the performance release.
    if (!force && performanceTouchActive()) return;''')
    path.write_text(source)
