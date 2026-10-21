"""Extend existing LFO source choices only when the installed host supports them."""
from pathlib import Path


def patch_field_lfo(root: Path) -> None:
    """Patch upstream's existing LFO UI; keep assignments and persistence intact."""
    path: Path = root / "src/lfo/params.ts"
    source: str = path.read_text()
    marker: str = "export const LFO_SHAPES = ['Sine', 'Tri', 'Saw', 'Square', 'S&H', 'Swishy'];"
    replacement: str = marker + """
export const FIELD_LFO_SHAPES = [...LFO_SHAPES, ...Array.from({length:16}, (_, index) => 'Field ' + (index + 1))];
export function lfoShapes(scope: LfoScope): string[] {
    return scope.port.getParam(scope.keyPrefix + 'lfo1:field_source_version') === '1' ? FIELD_LFO_SHAPES : LFO_SHAPES;
}
"""
    if "FIELD_LFO_SHAPES" not in source:
        if marker not in source:
            raise RuntimeError("Missing LFO source list seam")
        path.write_text(source.replace(marker, replacement))
    path = root / "src/lfo/model.ts"
    source = path.read_text()
    if "const sourceShapes" not in source:
        source = source.replace('LFO_SHAPES, LFO_DIVISIONS,', 'LFO_SHAPES, lfoShapes, LFO_DIVISIONS,')
        source = source.replace('let bank = 0;', 'const sourceShapes = lfoShapes(scope);\n    let bank = 0;')
        source = source.replace('LFO_SHAPES.length - 1', 'sourceShapes.length - 1')
        # Shared field has its own time, so these local oscillator controls do nothing.
        source = source.replace('const v = vals[bank];', 'const v = vals[bank];')
        path.write_text(source)
    path = root / "src/lfo/io.ts"
    source = path.read_text()
    if "FIELD_LFO_SHAPES" not in source:
        source = source.replace("LFO_SHAPES", "FIELD_LFO_SHAPES")
    path.write_text(source)
    path = root / "src/lfo/cells.ts"
    source = path.read_text()
    if "sourceShapes" not in source:
        source = source.replace('buildCells(scope: LfoScope, v: LfoVals)', 'buildCells(scope: LfoScope, v: LfoVals, sourceShapes: string[] = LFO_SHAPES)')
        source = source.replace('options: LFO_SHAPES, enumIndex:', 'options: sourceShapes, enumIndex:')
        source = source.replace('LFO_SHAPES[v.shape]', "sourceShapes[v.shape] || 'Host update'")
        source = source.replace('LFO_SHAPES.length - 1', 'sourceShapes.length - 1')
        source = source.replace('buildLfoVM(scope: LfoScope, st: LfoPageState)', 'buildLfoVM(scope: LfoScope, st: LfoPageState, sourceShapes: string[] = LFO_SHAPES)')
        source = source.replace('buildCells(scope, v)', 'buildCells(scope, v, sourceShapes)')
        source = source.replace('lfoViz: [{', 'lfoViz: v.shape >= 6 ? [] : [{')
        path.write_text(source)
    path = root / "src/lfo/model.ts"
    source = path.read_text().replace('touched, overlay });', 'touched, overlay }, sourceShapes);')
    path.write_text(source)
    path = root / "src/lfo/model.ts"
    source = path.read_text()
    marker: str = "            const v = vals[bank];\n            if (k === 5) {"
    source = source.replace(marker, "            const v = vals[bank];\n            if (v.shape >= 6 && (k === 0 || k === 1 || k === 5 || k === 6)) return;\n            if (k === 5) {")
    path.write_text(source)
    path = root / "src/lfo/cells.ts"
    source = path.read_text()
    source = source.replace("        cell({ shortName: 'RATE'", "        v.shape >= 6 ? null : cell({ shortName: 'RATE'")
    source = source.replace("        cell({ shortName: 'SYNC'", "        v.shape >= 6 ? null : cell({ shortName: 'SYNC'")
    source = source.replace("        cell({ shortName: 'PHASE'", "        v.shape >= 6 ? null : cell({ shortName: 'PHASE'")
    source = source.replace("        scope.hasRetrigger\n", "        scope.hasRetrigger && v.shape < 6\n")
    path.write_text(source)
