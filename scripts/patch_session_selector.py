"""Replace eager Session cycling with an explicit, read-free mode chooser."""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_session_selector(root: Path) -> None:
    """Reuse mode transitions and the existing browse renderer without preview loads."""
    assets: Path = Path(__file__).resolve().parents[1] / 'integration/chord-play'
    (root / 'src/seq/shared-panel.ts').write_text((assets / 'shared-panel.ts').read_text())
    path: Path = root / 'src/seq/router-buttons.ts'
    source: str = path.read_text()
    source = "import { invalidateInputModeLeds } from './led-cache.js';\nimport { beginTrackSwitch, followModulePanel, type TrackSnapshot } from '../track/switch.js';\nimport { renderBrowseView } from '../renderer/browse-view.js';\n" + source
    source = source.replace('return settingsOpen() ? 7 : seqState.sessionMode ? 0 :', 'return seqState.sessionMode ? 0 : settingsOpen() ? 7 :')
    source = source.replace("import { momentaryDown, momentaryUp } from './momentary.js';\n", '')
    start: int = source.index('function advanceSessionMode(')
    end: int = source.index('    if(next===7)', start)
    source = source[:start] + '''function selectInputMode(next: number, remember=true): void {
    if(next===sessionPlayMode()){inputModeChoice=-1;return;}
    if(motifEditing()){seqToast('Finish motif edit first');return;}
    if(next===2&&schwungActiveFor(appState.activeTrack.index,'midi_fx1')?.moduleId!=='harmonybus'){seqToast('Motif Play requires HB');return;}
    if(next===3&&(!jointAvailable()||!schwungLibAvailable())){seqToast('Joint Play unavailable');return;}
    if(remember)rememberInputView();
    inputModeChoice=-1;
    invalidateInputModeLeds();
    if(next===0){
        const mode=sessionPlayMode();
        clipsPanel=mode===1||mode===2?beginTrackSwitch().modulePanel:null;
        if(paramPageActive())appState.currentView=closeParamPage();
        releaseAllLive();captureClear();seqState.sessionMode=true;inputViewHistory.length=0;
        seqToast('Clips');return;
    }
    if(next!==7){
        releaseAllLive();captureClear();
        if(paramPageActive())appState.currentView=closeParamPage();
    }
''' + source[end:]
    source = source.replace('if(next===7){setSettingsOpen(true,false);', 'if(next===7){seqState.sessionMode=false;setSettingsOpen(true,false);')
    source = source.replace('let sessionPlayPrev = 0;\n', '').replace('let sessionPrev = false;\n', '').replace('let settingsShortcut = false;\n', '')
    start = source.index('    /* Note/Session: momentary.')
    end = source.index('    /* Copy/Delete:', start)
    source = source[:start] + '''    // Open/close on the press edge; release never enters a mode.
    if(d1===CC_NOTE_SESSION){
        if(d2>0){
            if(sessionSelectorHeld)return true;
            sessionSelectorHeld=true;sessionPressAt=Date.now();
            if(shiftHeld||(inputModeSelectorOpen()&&sessionPressAt-sessionTapReleased>=0&&sessionPressAt-sessionTapReleased<=350)){
                sessionTapReleased=-Infinity;selectInputMode(0);appState.dirty=true;
            }else toggleInputModeSelector();
        }else{
            if(sessionSelectorHeld)sessionTapReleased=inputModeSelectorOpen()&&Date.now()-sessionPressAt<=350?Date.now():-Infinity;
            sessionSelectorHeld=false;sessionButtonDown(false);
        }
        return true;
    }

''' + source[end:]
    source += '\n' + (assets / 'session-selector.ts').read_text()
    path.write_text(source)
    path = root / 'src/seq/router.ts'
    source = path.read_text().replace("import { seqHandleButtonCc }", "import { inputModeSelectorMidi, seqHandleButtonCc }")
    source = replace_once(source, '    if (settingsMidi(data))', '''    if(statusType===0xB0&&d1===50)return seqHandleButtonCc(d1,d2,shiftHeld);
    if(inputModeSelectorMidi(data))return true;
    if (settingsMidi(data))''')
    path.write_text(source)
    path = root / 'src/renderer/browse-view.ts'
    source = path.read_text().replace("title = 'Module'): void", "title = 'Module', footer = 'Back:cancel  Click:load'): void")
    source = source.replace("fontPrint(2, FOOTER_Y + 1, 'Back:cancel  Click:load', 0)", 'fontPrint(2, FOOTER_Y + 1, footer, 0)')
    path.write_text(source)
    path = root / 'src/app/tick.ts'
    source = "import { renderInputModeSelector } from '../seq/router-buttons.js';\n" + path.read_text()
    source = replace_once(source, '        /* Track-volume slider', '        renderInputModeSelector();\n        /* Track-volume slider')
    path.write_text(source)
    path = root / 'src/app/input-reset.ts'
    source = "import { resetInputModeSelector } from '../seq/router-buttons.js';\n" + path.read_text()
    source = replace_once(source, 'export function resetHeldInput(notifyEngine: boolean): void {', 'export function resetHeldInput(notifyEngine: boolean): void {\n    resetInputModeSelector();')
    path.write_text(source)
    path = root / 'src/track/switch.ts'
    source = "import { clipsReturnPanel, rememberClipsReturn } from '../seq/router-buttons.js';\n" + path.read_text()
    source = replace_once(source, 'function followModulePanel(track:', 'export function followModulePanel(track:')
    source = replace_once(source, 'followModulePanel(track, prev.modulePanel)', 'followModulePanel(track, prev.modulePanel ?? (prev.session ? clipsReturnPanel() : null))')
    source = replace_once(source, '    appState.trackView[prev.track] = prev.view;', '    if(prev.session)rememberClipsReturn(prev.view);\n    appState.trackView[prev.track] = prev.view;')
    path.write_text(source)
    patch_selector_tests(root)


def patch_selector_tests(root: Path) -> None:
    """Retain existing clip/mute tests while updating the deliberate mode-entry gesture."""
    path: Path = root / 'browser-test/hb-joint-panels.mjs'
    source: str = path.read_text()
    start: int = source.index('// Session owns navigation;')
    end: int = source.index('// Fixed actor settings', start)
    source = source[:start] + (Path(__file__).resolve().parents[1] / 'integration/chord-play/session-selector-tests.mjs').read_text() + '\n' + source[end:]
    path.write_text(source)
    path = root / 'browser-test/logic/seq-session.mjs'
    source = path.read_text().replace("    eq('Note/Session enters session', seqState.sessionMode, true);", "    seqHandleMidi([0xB0,50,0],false);\n    seqHandleMidi([0xB0,14,127],false);\n    seqHandleMidi([0xB0,MoveMainButton,127],false);seqHandleMidi([0xB0,MoveMainButton,0],false);\n    eq('Session selector enters Clips on confirmation', seqState.sessionMode, true);")
    path.write_text(source)
    path = root / 'browser-test/logic/seq-router.mjs'
    source = path.read_text().replace("    eq('held Session shows the clip grid', seqState.sessionMode, true);", "    eq('Session opens selector without a clip peek', seqState.sessionMode, false);")
    source = source.replace("    eq('the peek still reverts', seqState.sessionMode, false);", "    eq('Session release leaves the current mode unchanged', seqState.sessionMode, false);\n    seqHandleMidi([0xB0,51,127],false);seqHandleMidi([0xB0,51,0],false);")
    path.write_text(source)
