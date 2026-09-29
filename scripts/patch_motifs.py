"""Connect the native step-record gestures to the HB motif draft destination."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_motifs(root: Path) -> None:
    """Add a latched destination without sending motif edits to song clips."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    for name, destination in [('hb-motif.ts', 'renderer'), ('step-rec-target.ts', 'seq'), ('motif-feedback.ts', 'renderer')]:
        (root / 'src' / destination / name).write_text((integration / name).read_text())
    path: Path = root / 'src/seq/step-rec.ts'
    source: str = "import { stepRecTarget } from './step-rec-target.js';\n" + path.read_text()
    source = replace_once(source, 'return active; }', 'return active || stepRecTarget() !== null; }')
    source = replace_once(source, 'return headStep(); }', 'return stepRecTarget()?.head() ?? headStep(); }')
    map_signature_to_hook: dict[str, str] = {
        'export function stepRecCanGoLeft(): boolean {': 'const target=stepRecTarget();if(target)return target.canGoLeft();',
        'export function stepRecDownAt(nowMs: number): boolean {': 'const target=stepRecTarget();if(target){target.end();return true;}',
        'export function stepRecEnd(): void {': 'const target=stepRecTarget();if(target){target.end();return;}',
        'export function stepRecPad(padNote: number, pitch: number, vel: number): boolean {': 'const target=stepRecTarget();if(target)return target.pad(padNote,pitch,vel);',
        'export function stepRecPadRelease(padNote: number): boolean {': 'const target=stepRecTarget();if(target)return target.release(padNote);',
        'export function stepRecArrow(dir: number): boolean {': 'const target=stepRecTarget();if(target)return target.arrow(dir);',
        'export function stepRecStepTap(button: number): boolean {': 'const target=stepRecTarget();if(target)return target.step(button);',
        'export function resetStepRec(): void {': 'stepRecTarget()?.reset();',
    }
    for signature, hook in map_signature_to_hook.items():
        source = replace_once(source, signature, signature + '\n    ' + hook)
    path.write_text(source)
    path = root / 'src/seq/step-rec-view.ts'
    source = "import { stepRecTarget } from './step-rec-target.js';\n" + path.read_text()
    source = replace_once(source, 'export function stepRecHeaderText(): string {', 'export function stepRecHeaderText(): string {\n    const target=stepRecTarget();if(target)return target.header();')
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = "import { motifStep, motifEditing, paintMotif, resetMotif, drawMotif } from './hb-motif.js';\n" + path.read_text()
    source = replace_once(source, '    if (releaseHbPerformanceStep(data)) return true;', '    if (releaseHbPerformanceStep(data)) return true;\n    if (motifStep(data, owner)) return true;\n    if (motifEditing()) return false;')
    source = replace_once(source, '    if (paintedOwner !== owner) {', '    if (paintMotif(owner)) return true;\n    if (paintedOwner !== owner) {')
    source = replace_once(source, 'export function drawHbPerformanceMode(): void {', 'export function drawHbPerformanceMode(): void {\n    if(drawMotif())return;')
    source = replace_once(source, 'export function resetHbPerformance(): void {', 'export function resetHbPerformance(): void {\n    resetMotif();')
    path.write_text(source)
    path = root / 'src/renderer/schwung-page.ts'
    source = "import { motifAction } from './hb-motif.js';\n" + path.read_text()
    # Use the same qualified port as the normal page. No secondary MIDI path.
    source = replace_once(source, '    return {\n        reload, tick,', '''    const motifPort = {
        performanceTrack: port.track.index,
        performanceSet: (key: string, value: string) => port.setParam(qualify(componentKey + ':' + key), value),
        performanceGet: (key: string) => String(port.getParam(qualify(componentKey + ':' + key)) ?? ''),
    };
    return {
        reload, tick,''')
    source = replace_once(source, '            if (!key || !meta || meta.readOnly) return;', '''            if (!key || !meta || meta.readOnly) return;
            if (key.startsWith('motif_') && motifAction(motifPort,key)) {
                touchActions.set(slot,key);return;
            }''')
    path.write_text(source)

    path = root / 'src/keyboard/harmony-pads.ts'
    source = "import { motifFeedbackColor } from '../renderer/motif-feedback.js';\n" + path.read_text()
    source = replace_once(source, '    return colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,', '    return motifFeedbackColor(colorHarmonyPitch(pitch, keyboardState.rootPc, track, scale, current, effective,')
    source = replace_once(source, 'colors[settings[3]], colors[settings[4]], period > 0);', "colors[settings[3]], colors[settings[4]], period > 0),track,pitch,'pitch');")
    path.write_text(source)
    path = root / 'build/browser.mjs'
    source = path.read_text()
    source = replace_once(source, "        resolve(root, 'src/renderer/schwung-page.ts'),", "        resolve(root, 'src/renderer/schwung-page.ts'),\n        resolve(root, 'src/renderer/hb-motif.ts'),\n        resolve(root, 'src/renderer/motif-feedback.ts'),")
    path.write_text(source)
    (root / 'browser-test/hb-motifs.mjs').write_text((integration.parent / 'hb-motifs.mjs').read_text())
