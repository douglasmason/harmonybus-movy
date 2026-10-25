"""Give navigation buttons one LED owner, using the same bounds as input."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_navigation_lights(root: Path) -> None:
    path = root / 'src/seq/leds.ts'
    source = """import {chordActive,chordPage} from './chord-play.js';
import {gridActive,gridCanNavigate} from './grid.js';
import {settingsActive} from './hb-settings.js';
import {keyboardState,OCT_MIN,OCT_MAX} from '../keyboard/state.js';
import {trackIsDrum} from '../app/state.js';
import {anyStepHeld} from './step-edit.js';
""" + path.read_text()
    source = replace_once(source, '    if (stepRecActive()) {\n        const blink = blinkPhase();', '''    if (!settingsActive() && chordActive()) {
        const navigation=chordPage().ctl.hbNavigation;
        cachedSetButtonLED(CC_LEFT,navigation?.canMove(-1)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_RIGHT,navigation?.canMove(1)?WHITE_DIM:WHITE_OFF);
    } else if (!settingsActive() && gridActive()) {
        cachedSetButtonLED(CC_LEFT,gridCanNavigate(-1,0)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_RIGHT,gridCanNavigate(1,0)?WHITE_DIM:WHITE_OFF);
    } else if (anyStepHeld() && !stepRecActive()) {
        cachedSetButtonLED(CC_LEFT,WHITE_DIM);cachedSetButtonLED(CC_RIGHT,WHITE_DIM);
    } else if (stepRecActive()) {
        const blink = blinkPhase();''')
    source = replace_once(source, '        cachedSetButtonLED(CC_UP, groupArrowColor(GROUP_DIR_UP));\n    }', '''        cachedSetButtonLED(CC_UP, groupArrowColor(GROUP_DIR_UP));
    } else if (!settingsActive() && gridActive()) {
        cachedSetButtonLED(CC_DOWN,gridCanNavigate(0,-1)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_UP,gridCanNavigate(0,1)?WHITE_DIM:WHITE_OFF);
    } else {
        const track=appState.activeTrack.index,octave=keyboardState.octave[track];
        const transpose=anyStepHeld()&&seqState.watchLane<0,melodic=!trackIsDrum(track);
        cachedSetButtonLED(CC_DOWN,melodic&&(transpose||octave>OCT_MIN)?WHITE_DIM:WHITE_OFF);
        cachedSetButtonLED(CC_UP,melodic&&(transpose||octave<OCT_MAX)?WHITE_DIM:WHITE_OFF);
    }''')
    source=source.replace('Outside it\n     * they are the pad octave and app/tick.ts owns them (it knows whether the\n     * track is a drum, which has no octave).', 'Outside it\n     * they belong to Grid rows, held-step transpose, or melodic pad octaves.')
    path.write_text(source)
    path=root / 'src/app/tick.ts'
    source=path.read_text()
    for line in source.splitlines(True):
        if 'setButtonLED(MoveUp,' in line or 'setButtonLED(MoveDown,' in line:
            source=source.replace(line,'')
    path.write_text(source)
    path=root / 'src/midi/router.ts'
    source=path.read_text()
    source=source.replace('            setButtonLED(d1, d2 > 0 ? WHITE_BRIGHT : WHITE_DIM, true);\n','')
    source=source.replace('            setButtonLED(d1, WHITE_BRIGHT, true);\n        } else {\n            setButtonLED(d1, WHITE_DIM, true);\n','')
    path.write_text(source)
