"""Install Scale Finding as a silent, shared-key performance mode on Move."""
from pathlib import Path

from patch_responsive_persistence import replace_once


def patch_scale_finding(root: Path) -> None:
    """Reuse the existing key-center, pad LED and Session controller paths."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/scale-finding'
    (root / 'src/seq/scale-finding.ts').write_text(
        (assets / 'scale-finding.ts').read_text()
    )
    (root / 'browser-test/hb-scale-finding.mjs').write_text(
        (assets / 'hb-scale-finding.mjs').read_text()
    )

    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = path.read_text()
    source = "import { scaleFindingEnabled, setScaleFindingEnabled } from './scale-finding.js';\n" + source
    source = replace_once(source, 'return seqState.sessionMode ? 0 : settingsOpen() ? 7 :',
                          'return seqState.sessionMode ? 0 : scaleFindingEnabled() ? 8 : settingsOpen() ? 7 :')
    source = replace_once(source, '    if(remember)rememberInputView();',
                          '    if(remember)rememberInputView();\n    setScaleFindingEnabled(false);')
    source = replace_once(source, '    if(next===7){seqState.sessionMode=false;setSettingsOpen(true,false);',
                          """    if(next===8){
        setSettingsOpen(false);setChordEnabled(false);
        setGridEnabled(false);setFieldEnabled(false);setJointEnabled(false);
        seqState.sessionMode=false;setScaleFindingEnabled(true);
        seqToast('Scale Finding');return;
    }
    if(next===7){seqState.sessionMode=false;setSettingsOpen(true,false);""")
    path.write_text(source)

    path = root / 'src/seq/router-pads.ts'
    source = path.read_text()
    source = "import { scaleFindingActive } from './scale-finding.js';\n" + source
    source = replace_once(source, '!seqState.sessionMode && !gridActive() && !fieldActive()',
                          '!seqState.sessionMode && !gridActive() && !fieldActive() && !scaleFindingActive()')
    path.write_text(source)

    path = root / 'src/seq/router.ts'
    source = "import { scaleFindingMidi } from './scale-finding.js';\n" + (root / 'src/seq/router.ts').read_text()
    source = replace_once(source, '    if (chordMidi(data,',
                          '    if (scaleFindingMidi(data)) return true;\n    if (chordMidi(data,')
    (root / 'src/seq/router.ts').write_text(source)

    path = root / 'src/app/tick.ts'
    source = "import { scaleFindingActive, renderScaleFinding, paintScaleFinding } from '../seq/scale-finding.js';\n" + (root / 'src/app/tick.ts').read_text()
    source = replace_once(source, 'if(padSweepPending||chordActive())paintPriorityPads();',
                          'if(padSweepPending||chordActive()||scaleFindingActive())paintPriorityPads();')
    source = replace_once(source, '    if(force)chromaticCache.fill(255);',
                          '    if(force)chromaticCache.fill(255);\n    if(scaleFindingActive())return paintScaleFinding(force);')
    source = replace_once(source, 'if(!jointActive()&&!gridActive()&&!fieldActive())refreshHarmonyPads(track);',
                          'if(!jointActive()&&!gridActive()&&!fieldActive()&&!scaleFindingActive())refreshHarmonyPads(track);')
    source = replace_once(source, '        } else if (chordActive()) {',
                          '        } else if (scaleFindingActive()) {\n            renderScaleFinding();\n        } else if (chordActive()) {')
    path.write_text(source)

    path = root / 'src/seq/leds.ts'
    source = "import { paintScaleFindingSteps } from './scale-finding.js';\n" + path.read_text()
    source = replace_once(source, '    if (paintChordSteps()) { paintTransport(); return; }',
                          '    if (paintScaleFindingSteps()) { paintTransport(); return; }\n    if (paintChordSteps()) { paintTransport(); return; }')
    path.write_text(source)

    path = root / 'src/app/input-reset.ts'
    source = "import { setScaleFindingEnabled } from '../seq/scale-finding.js';\n" + path.read_text()
    source = replace_once(source, '    resetJointInput();',
                          '    setScaleFindingEnabled(false);\n    resetJointInput();')
    path.write_text(source)

    path = root / 'src/seq/router-buttons.ts'
    source = replace_once(path.read_text(),
                          "'Chord Play','HB Settings'];",
                          "'Chord Play','HB Settings','Scale Finding'];")
    path.write_text(source)

    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), '    entryPoints: [',
                          "    entryPoints: [\n        resolve(root, 'src/seq/scale-finding.ts'),")
    path.write_text(source)
