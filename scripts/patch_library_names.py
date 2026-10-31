"""Connect library metadata editing after the shared input-ownership patches."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_library_names(root: Path) -> None:
    """Keep keyboard input ahead of performance controls, using the existing review."""
    path: Path = root / 'src/seq/chord-play.ts'
    source: str = "import {partReviewMidi} from './part-library.js';\n" + path.read_text()
    source = replace_once(source, '    if(surface?!controlsActive():!chordActive())return false;',
                          '    if(surface?!controlsActive():!chordActive())return false;\n    if(partReviewMidi(data))return true;')
    path.write_text(source)
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/part-library'
    keyboard: Path = root / 'src/vendor/schwung/shared/text_entry.mjs'
    # The shared keyboard's host print() draws text in Schwung; Movy uses its
    # own mixed-case font path in both browser and device bundles.
    keyboard.write_text("import {fontPrint as print} from '../../../font/index.js';\n" + keyboard.read_text())
    (root / 'src/vendor/schwung/shared/text_entry.d.mts').write_text((assets / 'text_entry.d.mts').read_text())
    if (assets / 'hb-library-names.mjs').exists():
        (root / 'browser-test/hb-library-names.mjs').write_text((assets / 'hb-library-names.mjs').read_text())
