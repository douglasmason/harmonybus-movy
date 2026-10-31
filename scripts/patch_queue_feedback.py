"""Give Chord Play one persistent queue footer and unambiguous loop counts."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_queue_feedback(root: Path) -> None:
    """Apply after the existing Chord Play composition and status cache patches."""
    path: Path = root / 'src/seq/chord-play.ts'
    source: str = path.read_text()
    source = replace_once(source,
        "    if(setup.playMode&&!entered)seqToast('Queued '+performanceStatus('queue_count')+' / '+performanceStatus('queue_next'));",
        "    // The native queue snapshot owns feedback; enqueue has not necessarily\n"
        "    // reached the audio thread when this gesture returns.")
    source = replace_once(source,
        "        const state=!setup.playMode?'Off':waiting||!valid?((valid&&queue[3]!=='--'?'Hold ':'Fill ')+count+(depth?'/'+depth:' Release')):(queue[8]==='1'?'Loop ':'Ready ')+count;",
        "        const total=valid&&Number.isInteger(Number(queue[10]))?Number(queue[10]):count+(valid&&queue[3]!=='--'?1:0);\n"
        "        const cursor=valid&&Number.isInteger(Number(queue[9]))?Number(queue[9]):-1;\n"
        "        const state=!setup.playMode?'Off':\n"
        "            waiting||!valid?((valid&&queue[3]!=='--'?'Hold ':'Fill ')+count+(depth?'/'+depth:' Release')):\n"
        "            queue[8]==='1'?'Loop '+(cursor+1)+'/'+total:'Ready '+total;")
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = path.read_text()
    source = replace_once(source,
        '        && !isFullScreenView && !captureOverlayActive()) {',
        '        && !isFullScreenView && (!chordActive() || seqState.loopMode || paramPageActive()) && !captureOverlayActive()) {')
    path.write_text(source)
    path = root / 'src/renderer/hb-performance.ts'
    source = path.read_text()
    source = replace_once(source,
        'export function drawHbPerformanceMode(): void {\n    drawMotif();',
        'export function drawHbPerformanceMode(): void {\n'
        '    // Chord Play owns its footer, including while a control is touched.\n'
        '    if (chordActive()) return;\n    drawMotif();')
    path.write_text(source)
