"""Finish captured performance releases before generic knob work."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_touch_release(root: Path) -> None:
    """Keep release I/O bounded and give short gestures the native button burst."""
    path: Path = root / 'src/renderer/performance-touch.ts'
    source: str = path.read_text().replace('cancel = false): void {','cancel = false): boolean {')
    source = source.replace('    if (!release) return;', '    if (!release) return false;')
    source = source.replace('    release(cancel);', '    release(cancel);\n    return true;')
    source += '\nexport function ownsPerformanceTouch(slot: number): boolean { return releases.has(slot); }\n'
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = path.read_text().replace('import { releasePerformanceTouch }', 'import { releasePerformanceTouch, ownsPerformanceTouch }')
    source = replace_once(source, '        ((data[0] & 0xF0) === 0x90 && data[2] === 0))) releasePerformanceTouch(data[1]);', '''        ((data[0] & 0xF0) === 0x90 && data[2] === 0)) && releasePerformanceTouch(data[1])) {
        holdRelease(data[1]);
        appState.dirty = true;
        return;
    }''')
    source = replace_once(source, '            automationKnobTouched(d1);', '''            if (ownsPerformanceTouch(d1)) return;
            automationKnobTouched(d1);''')
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = path.read_text().replace('    let touchPaintPending = false;', '    let touchPaintPending = false;\n    let gestureHoldMs = 350;\n    let gestureConfigAt = -Infinity;')
    source = replace_once(source, '        ctl.tick();', '''        const gestureNow=Date.now();
        if (hostedModuleId === 'harmonybus' && ctl.page?.keys?.includes('approach_scale_next') &&
            (gestureNow < gestureConfigAt || gestureNow-gestureConfigAt >= 1000)) {
            gestureConfigAt=gestureNow;
            const threshold=Number(port.getParam(qualify('touch_hold_ms')));
            if (Number.isFinite(threshold) && threshold>=150 && threshold<=500) gestureHoldMs=threshold;
        }
        ctl.tick();''')
    source = replace_once(source, '                const started = Date.now();', '                const started = Date.now();\n                const threshold = gestureHoldMs;')
    source = replace_once(source, "                    port.setParam(qualify(gestureKey), cancel ? 'Cancel' : 'Up,' + Math.max(0, Date.now() - started));", '''                    const released=Date.now();
                    const elapsed=Math.max(0,released-started);
                    port.setParam(qualify(gestureKey), cancel ? 'Cancel' : 'Up,' + elapsed);
                    // Paint only: calling onClick would fire the modifier again.
                    if (!cancel && elapsed<threshold) {
                        const previous=ctl.state.triggerFiredAt[key] || [];
                        ctl.state.triggerFiredAt[key]=previous.filter((stamp: number)=>released-stamp<400).slice(-3).concat(released);
                    }''')
    path.write_text(source)
