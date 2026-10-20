"""Report knob touch gestures to the shared HarmonyBus performance state."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_tap_hold(root: Path) -> None:
    """Preserve physical release ownership and distinguish teardown from a tap."""
    path: Path = root / 'src/renderer/performance-touch.ts'
    source: str = path.read_text().replace('() => void', '(cancel?: boolean) => void')
    source = replace_once(source, 'export function releasePerformanceTouch(slot: number): void {', 'export function releasePerformanceTouch(slot: number, cancel = false): void {')
    source = replace_once(source, '    release();', '    release(cancel);')
    source += '''\nexport function cancelPerformanceTouches(): void {
    for (const slot of [...releases.keys()]) releasePerformanceTouch(slot, true);
}
'''
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text().replace('export { releasePerformanceTouch, performanceTouchActive }', 'export { releasePerformanceTouch, performanceTouchActive, cancelPerformanceTouches }').replace('import { ownPerformanceTouch, finishPerformanceTouch, performanceTouchActive }', 'import { ownPerformanceTouch, finishPerformanceTouch, performanceTouchActive, releasePerformanceTouch }')
    source = replace_once(source, '                const heldKey = touchActions.get(slot);', '''                const heldKey = touchActions.get(slot);
                if (heldKey === 'approach_scale_next' || heldKey === 'approach_chrom_next' || heldKey === 'mod_chrom_below' || heldKey === 'mod_scale_above') {
                    releasePerformanceTouch(slot);return;
                }''')
    source = replace_once(source, "            if (key === 'next_reset') {", '''            if (key === 'approach_scale_next' || key === 'approach_chrom_next' || key === 'mod_chrom_below' || key === 'mod_scale_above') {
                const gestureKey = key === 'approach_scale_next' || key === 'mod_scale_above' ? 'performance_gesture_above' : 'performance_gesture_below';
                const started = Date.now();
                touchActions.set(slot, key);
                ownPerformanceTouch(slot, (cancel = false) => {
                    touchActions.delete(slot);
                    port.setParam(qualify(gestureKey), cancel ? 'Cancel' : 'Up,' + Math.max(0, Date.now() - started));
                    ctl.onKnobTouch(slot, false);touchPaintPending = true;
                });
                port.setParam(qualify(gestureKey), 'Down');
            } else if (key === 'next_reset') {''')
    path.write_text(source)
    for relative, signature in [('src/app/input-reset.ts','export function resetHeldInput(notifyEngine: boolean): void {'),('src/app/unload.ts','export function onUnload(): void {')]:
        path = root / relative
        source = "import { cancelPerformanceTouches } from '../renderer/performance-touch.js';\n" + path.read_text()
        source = replace_once(source, signature, signature+'\n    cancelPerformanceTouches();')
        path.write_text(source)
