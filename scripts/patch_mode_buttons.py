"""Shared mode-specific Move buttons and on-device control guide.

Patch the fully composed controller once; no duplicated renderers or LED caches.
"""
from pathlib import Path
from patch_responsive_persistence import replace_once


def patch_mode_buttons(root: Path) -> None:
    """Install read-free LED policy, Chord Loop/X and first-entry help."""
    asset: Path = Path(__file__).resolve().parents[1] / 'integration/mode-buttons'
    (root / 'src/seq/mode-buttons.ts').write_text((asset / 'mode-buttons.ts').read_text())
    (root / 'browser-test/hb-mode-buttons.mjs').write_text((asset / 'hb-mode-buttons.mjs').read_text())

    path: Path = root / 'src/seq/chord-play.ts'
    source: str = path.read_text()
    source = replace_once(source,
        'export const chordActive=():boolean=>enabled&&!seqState.sessionMode;',
        '''export const chordActive=():boolean=>enabled&&!seqState.sessionMode;
let buttonQueueLoop=false;
/** Read-only LED snapshot. Never query a native parameter from LED painting. */
export function chordQueuedMode():boolean{return setup.playMode===1;}
export function chordLoopSelected():boolean {
    if(!setup.playMode)return false;
    const queue=statusCache?.values.queue_snapshot;
    if(queue?.startsWith('cq1|'))return queue.split('|')[8]==='1';
    return buttonQueueLoop;
}
/** Loop toggles native Queue End, not the unrelated step/bar Loop overlay. */
export function chordLoopButton():void {
    if(!setup.playMode)return;
    const native=portFor(conductorTrack()),current=native.getParam('midi_fx1:chord_queue_end');
    if(current!=='Loop'&&current!=='Hold'){seqToast('Queue unavailable');return;}
    const next=current==='Loop'?'Hold':'Loop';
    if(native.setParam('midi_fx1:chord_queue_end',next)===false){seqToast('Queue update failed');return;}
    buttonQueueLoop=next==='Loop';
    statusCache=null;appState.dirty=true;
    seqToast(next==='Loop'?'Queue repeats':'Queue holds at end');
}''')
    # Knob editing Queue End and the Loop button drive the same retained state.
    source = replace_once(source,
        'if(target){statusCache=null;return portFor(target.track).setParam(target.key,value);}',
        '''if(target){
            statusCache=null;
            const written=portFor(target.track).setParam(target.key,value);
            if(written!==false&&target.track===conductorTrack()&&target.key==='chord_queue_end')
                buttonQueueLoop=value==='Loop';
            return written;
        }''')
    path.write_text(source)

    path = root / 'src/seq/router-buttons.ts'
    source = "import { modeButtonMidi, showModeHelp } from './mode-buttons.js';\n" + path.read_text()
    source = replace_once(source,
        'export function seqHandleButtonCc(d1: number, d2: number, shiftHeld: boolean): boolean {',
        '''export function seqHandleButtonCc(d1: number, d2: number, shiftHeld: boolean): boolean {
    if(modeButtonMidi(d1,d2,shiftHeld))return true;''')
    source = replace_once(source,
        '    invalidateInputModeLeds();',
        '    invalidateInputModeLeds();\n    if(remember)showModeHelp(next);')
    path.write_text(source)

    path = root / 'src/seq/router.ts'
    source = "import { dismissModeHelp } from './mode-buttons.js';\n" + path.read_text()
    source = replace_once(source,
        '    const d2 = data[2];',
        '''    const d2 = data[2];
    if(d2>0&&(statusType===0xB0||statusType===0x90))dismissModeHelp();''')
    path.write_text(source)

    path = root / 'src/seq/leds.ts'
    source = "import { modeButtonColor } from './mode-buttons.js';\n" + path.read_text()
    for before,after in (
        ('cachedSetButtonLED(CC_SAMPLE, sampleLedColor())',
         'cachedSetButtonLED(CC_SAMPLE, modeButtonColor(CC_SAMPLE,sampleLedColor()))'),
        ('cachedSetButtonLED(CC_LOOP, seqState.loopMode ? WHITE_BRIGHT : WHITE_DIM)',
         'cachedSetButtonLED(CC_LOOP,modeButtonColor(CC_LOOP,seqState.loopMode ? WHITE_BRIGHT : WHITE_DIM))'),
        ('cachedSetButtonLED(CC_COPY, WHITE_DIM)',
         'cachedSetButtonLED(CC_COPY,modeButtonColor(CC_COPY,WHITE_DIM))'),
        ('cachedSetButtonLED(CC_DELETE_BTN, WHITE_DIM)',
         'cachedSetButtonLED(CC_DELETE_BTN,modeButtonColor(CC_DELETE_BTN,WHITE_DIM))'),
        ('cachedSetButtonLED(CC_MUTE, seqState.muted.some((m) => m) ? WHITE_BRIGHT : WHITE_DIM)',
         'cachedSetButtonLED(CC_MUTE,modeButtonColor(CC_MUTE,seqState.muted.some((m) => m) ? WHITE_BRIGHT : WHITE_DIM))'),
    ):
        source = replace_once(source,before,after)
    path.write_text(source)

    path = root / 'src/app/tick.ts'
    source = "import { tickModeHelp, renderModeHelp } from '../seq/mode-buttons.js';\n" + path.read_text()
    source = replace_once(source, '    seqToastTick();',
                          '    seqToastTick();\n    tickModeHelp();')
    source = replace_once(source, '        if (undoToastActive()) drawUndoOverlay(undoToast()!);',
                          '''        if (undoToastActive()) drawUndoOverlay(undoToast()!);
        if(!captureOverlayActive())renderModeHelp();''')
    path.write_text(source)

    path = root / 'src/app/input-reset.ts'
    source = "import { resetModeHelp } from '../seq/mode-buttons.js';\n" + path.read_text()
    source = replace_once(source, '    resetInputModeSelector();',
                          '    resetInputModeSelector();\n    resetModeHelp();')
    path.write_text(source)
