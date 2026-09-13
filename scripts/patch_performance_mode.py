"""Expose a persistent global Steps/Perform choice and a visible active-mode label."""
import base64
import json
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_performance_mode(root: Path) -> None:
    """Add one UI-only preference, its change handler, and the performance footer."""
    path: Path = root / 'src/seq/flags-def.ts'
    source: str = path.read_text()
    insertion: int = source.index('\n];', source.index('export const FLAGS: FlagDef[] = ['))
    source = source[:insertion] + """
    {
        key: 'hbsteprow', name: 'Step Row', labels: ['STEPS','PERFORM'],
        min: 0, max: 1, def: 0, uiOnly: true, release: true,
        hint: 'Step row: sequencer or HB effects.',
    },""" + source[insertion:]
    path.write_text(source)
    path = root / 'browser-test/logic/flags.mjs'
    source = replace_once(path.read_text(),
        "relKeys(), 'chtracks,chtrackset');",
        "relKeys(), 'chtracks,chtrackset,hbsteprow');")
    path.write_text(source)
    path = root / 'src/seq/flags-page.ts'
    source = "import { setHbPerformanceMode } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, "    if (def.key === 'chtracks')", "    if (def.key === 'hbsteprow') { setHbPerformanceMode(next); return; }\n    if (def.key === 'chtracks')")
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { drawHbPerformanceMode } from '../renderer/hb-performance.js';\n" + path.read_text()
    source = replace_once(source, '        songBandTick(viewRepainted);\n    }', '''        songBandTick(viewRepainted);
    }
    if (!seqToastActive() && !jogToastShown && !captureOverlayActive() &&
        !leaveModalActive() && !undoToastActive() && !quantOverlayActive()) drawHbPerformanceMode();''')
    path.write_text(source)
    baseline_path: Path = Path(__file__).resolve().parents[1] / 'integration/performance/baselines.json'
    baselines: dict[str, str] = json.loads(baseline_path.read_text())
    for relative_path, encoded_png in baselines.items():
        (root / relative_path).write_bytes(base64.b64decode(encoded_png))
