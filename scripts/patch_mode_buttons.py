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
let buttonQueuePresent=false,buttonQueueOverride=false,buttonQueueLoop=true;
/** A single native queue is stored independently of its active output. */
export function chordQueuedMode():boolean{return setup.playMode===1;}
export function chordLoopSelected():boolean{return buttonQueueLoop;}
export function chordMuteSelected():boolean{return buttonQueuePresent&&!buttonQueueOverride;}
/** Mute activates/deactivates the stored progression; it never discards it. */
export function chordMuteButton():void {
    if(!buttonQueuePresent){seqToast('No chord queue');return;}
    const conductor=conductorTrack(),enabled=!buttonQueueOverride;
    send('chord_override',conductor+','+(enabled?'on':'off'));
    buttonQueueOverride=enabled;queueCache=null;statusCache=null;appState.dirty=true;
    seqToast(enabled?'Queue active':'Queue muted');
}
/** Loop is the queue-end policy: repeat the progression or hold its final chord. */
export function chordLoopButton():void {
    const conductor=conductorTrack(),native=portFor(conductor);
    const old=native.getParam('midi_fx1:chord_queue_end');
    if(old!=='Loop'&&old!=='Hold'){seqToast('Queue end unavailable');return;}
    const next=old==='Loop'?'Hold':'Loop';
    native.setParam('midi_fx1:chord_queue_end',next);
    buttonQueueLoop=next==='Loop';
    queueCache=null;statusCache=null;appState.dirty=true;
    seqToast('Queue end: '+next);
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

    # This project uses esbuild's explicit entry list for Node ESM test imports.
    # A TypeScript dependency alone does not emit dist/esm/seq/mode-buttons.js.
    path = root / 'build/browser.mjs'
    source = replace_once(path.read_text(), '    entryPoints: [',
                          "    entryPoints: [\n        resolve(root, 'src/seq/mode-buttons.ts'),")
    path.write_text(source)
