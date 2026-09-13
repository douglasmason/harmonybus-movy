"""Use the step row for HB holds and enclosure triggers on hosted HB pages."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_performance_steps(root: Path) -> None:
    """Install the performance adapter with release-first MIDI routing."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    (root / 'src/renderer/hb-performance.ts').write_text((integration / 'hb-performance.ts').read_text())
    path: Path = root / 'src/renderer/schwung-page.ts'
    source: str = "export { hbPerformancePage, drawHbPerformanceMode, hbPerformanceStep, releaseHbPerformanceStep, paintHbPerformance, resetHbPerformance, setHbPerformanceMode, syncHbPerformanceMode } from './hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '    readonly ctl: any;', '    readonly ctl: any;\n    performanceSet(key: string, value: string): void;\n    performanceGet(key: string): string;')
    source = replace_once(source, '        knobTouch: (slot: number, down: boolean) => {', '''        performanceSet: (key: string, value: string) => { port.setParam(qualify(componentKey + ':' + key), value); },
        performanceGet: (key: string) => String(port.getParam(qualify(componentKey + ':' + key)) ?? ''),
        knobTouch: (slot: number, down: boolean) => {''')
    path.write_text(source)
    path = root / 'src/midi/router.ts'
    source = "import { hbPerformanceStep, releaseHbPerformanceStep } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '    if (!data || data.length < 3) return;', '    if (!data || data.length < 3) return;\n    if (releaseHbPerformanceStep(data)) return;')
    source = replace_once(source, '    if (seqHandleMidi(data, appState.shiftHeld)) return;', '    if (hbPerformanceStep(data)) return;\n    if (seqHandleMidi(data, appState.shiftHeld)) return;')
    path.write_text(source)
    path = root / 'src/seq/leds.ts'
    source = "import { paintHbPerformance } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '    const bar = seqState.barOffset;\n    const base = bar * NUM_STEP_BUTTONS;', '    if (paintHbPerformance()) { paintTransport(); return; }\n    const bar = seqState.barOffset;\n    const base = bar * NUM_STEP_BUTTONS;')
    path.write_text(source)
    for relative, signature in [('src/app/input-reset.ts','export function resetHeldInput(notifyEngine: boolean): void {'),('src/app/unload.ts','export function onUnload(): void {')]:
        path = root / relative
        source = "import { resetHbPerformance } from '../renderer/hb-performance.js';\n" + path.read_text()
        source = replace_once(source, signature, signature+'\n    resetHbPerformance();')
        path.write_text(source)
