/** Contextual Move button controls. Shared by the real Move and browser trial.
 *
 * The original global functions for Capture, Shift, Undo/Redo, Play and Rec
 * are never intercepted. Copy is not repurposed as a fake Queue -> Clip commit:
 * the semantic writer + phase-safe handoff must exist first. Shift+Copy opens
 * this guide without engaging the generic clipboard.
 */
import {appState} from '../app/state.js';
import {seqState} from './state.js';
import {WHITE_BRIGHT, WHITE_DIM} from './colors.js';
import {sessionPlayMode, inputModeSelectorOpen} from './router-buttons.js';
import {chordActive, chordQueuedMode, chordLoopSelected, chordLoopButton, chordPadModalActive, harmonyOff} from './chord-play.js';
import {jointActive, jointChordKnobs} from './joint-play.js';
import {settingsActive} from './hb-settings.js';
import {fontPrint} from '../font/index.js';
import {drawHeader} from '../renderer/header.js';

export const CC_MODE_LOOP=58;
export const CC_MODE_COPY=60;
export const CC_MODE_MUTE=88;
export const CC_MODE_SAMPLE=118;
export const CC_MODE_CLEAR=119;

/** Numbered lines use a 128x64 canvas with no second renderer. */
const MODE_GUIDES:Readonly<Record<number,{name:string;lines:readonly string[]}>>={
    2:{name:'Motif Play',lines:[
        'Pads: melody / harmony',
        'Touch: relative operations',
        'Loop: step/bar view',
        'Copy: normal clipboard']},
    3:{name:'Joint Play',lines:[
        'Pads: selected actors',
        'X: Off with chord knobs',
        'Loop: chord cycle / Hold',
        'Copy: clipboard (for now)']},
    4:{name:'Grid Sequencer',lines:[
        'Pads: time / pitch cells',
        'Arrows: time and rows',
        'Loop: clip bars',
        'Copy: steps or bars']},
    5:{name:'Field Play',lines:[
        'Pads: speed / shape',
        'Shift+pad: clear output',
        'Jog: settings/routing',
        'Copy: normal clipboard']},
    6:{name:'Chord Play',lines:[
        'X: harmony Off',
        'Loop: cycle / Hold',
        'Copy: normal clipboard',
        'K8: range / Off']},
    8:{name:'Scale Finding',lines:[
        'K1-4: scale families',
        'K7: arm key selection',
        'K8: reference tonic',
        'White: tonic Green: key']}
};
export interface ModeHelpSnapshot{mode:number;visible:boolean;reopenable:boolean;lines:readonly string[];}
let shown=new Set<number>();
let guideMode=-1,expiresAt=0;
let helpCopyHeld=false;
const DISPLAY_MS=2600;
export function modeHelpSnapshot(now=Date.now()):ModeHelpSnapshot{
    const current=sessionPlayMode(),guide=MODE_GUIDES[current];
    return {mode:current,visible:guideMode===current&&now<expiresAt&&!inputModeSelectorOpen(),
        reopenable:!!guide,lines:guide?.lines??[]};
}
/** The first entry offers help. Shift+Copy can reopen it at any time. */
export function showModeHelp(mode:number,force=false,now=Date.now()):boolean{
    if(!MODE_GUIDES[mode]||(!force&&shown.has(mode)))return false;
    shown.add(mode);guideMode=mode;expiresAt=now+DISPLAY_MS;
    appState.dirty=true;
    return true;
}
export function dismissModeHelp():void{
    if(!expiresAt)return;
    expiresAt=0;guideMode=-1;appState.dirty=true;
}
export function tickModeHelp(now=Date.now()):void{
    if(expiresAt&&now>=expiresAt)dismissModeHelp();
}
export function renderModeHelp(now=Date.now()):boolean{
    const snapshot=modeHelpSnapshot(now);
    if(!snapshot.visible)return false;
    const guide=MODE_GUIDES[snapshot.mode];
    clear_screen();
    drawHeader(guide.name,'Buttons');
    guide.lines.forEach((label,index)=>fontPrint(2,13+index*10,label,1));
    fontPrint(2,55,'Shift+Copy: help',1);
    return true;
}
export function resetModeHelp():void{
    // Track switches and held-input resets do not make first-entry help repeat.
    dismissModeHelp();helpCopyHeld=false;
}
function chordButtonContext():boolean{
    return !settingsActive()&&!inputModeSelectorOpen()&&
        (chordActive()||jointActive()&&jointChordKnobs())&&
        !chordPadModalActive();
}
/** Use the single cached button painter, not a second LED writer. */
export function modeButtonColor(cc:number,fallback:number):number{
    if(!chordButtonContext())return fallback;
    if(cc===CC_MODE_CLEAR)return WHITE_DIM; // press lights automatically
    if(cc===CC_MODE_LOOP&&chordQueuedMode())return chordLoopSelected()?WHITE_BRIGHT:WHITE_DIM;
    return fallback;
}
/** Take only buttons with fully implemented mode-specific actions. */
export function modeButtonMidi(cc:number,value:number,shiftHeld:boolean):boolean{
    const down=value>0;
    if(cc===CC_MODE_COPY&&helpCopyHeld){
        if(!down)helpCopyHeld=false;
        return true;
    }
    if(cc===CC_MODE_COPY&&shiftHeld&&MODE_GUIDES[sessionPlayMode()]&&!inputModeSelectorOpen()){
        if(down){helpCopyHeld=true;showModeHelp(sessionPlayMode(),true);}
        return true;
    }
    if(!chordButtonContext()||shiftHeld)return false;
    if(cc===CC_MODE_CLEAR){
        if(down){dismissModeHelp();harmonyOff();}
        return true; // A release cannot also delete a clip.
    }
    if(cc===CC_MODE_LOOP&&chordQueuedMode()){
        if(down){dismissModeHelp();chordLoopButton();}
        return true; // An explicit chord-cycle button never enters bar Loop.
    }
    return false;
}
