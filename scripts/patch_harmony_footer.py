"""Add musical context to the existing performance footer without extra polling."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_harmony_footer(root: Path) -> None:
    """Install the formatter after performance-mode patches have settled."""
    integration: Path = Path(__file__).resolve().parents[1] / 'integration/performance'
    (root / 'src/renderer/hb-footer.ts').write_text((integration / 'hb-footer.ts').read_text())
    (root / 'browser-test/hb-footer-test.mjs').write_text((integration / 'hb-footer-test.mjs').read_text())
    path: Path = root / 'src/renderer/hb-performance.ts'
    source: str = path.read_text()
    source = "import { harmonyFooterText } from './hb-footer.js';\nimport { harmonyFooterSnapshot } from '../keyboard/harmony-pads.js';\n" + source
    original: str = "fontPrint(1,58,active ? (flagValue('hbsteprow') === 2 ? 'PERFORM 2 T' : 'HB OPS T') + (appState.activeTrack.index + 1) : 'STEPS',1);"
    source = replace_once(source, original, "fontPrint(1,58,harmonyFooterText(active?flagValue('hbsteprow'):0,appState.activeTrack.index,harmonyFooterSnapshot(appState.activeTrack.index)),1);")
    path.write_text(source)
