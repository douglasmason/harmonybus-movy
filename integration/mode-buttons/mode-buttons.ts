/** Contextual Move button controls. Shared by the real Move and browser trial.
 *
 * The original global functions for Capture, Shift, Undo/Redo, Play and Rec
 * are never intercepted. Copy is not repurposed as a fake Queue -> Clip commit:
 * the semantic writer + phase-safe handoff must exist first. Shift+Copy opens
 * this guide without engaging the generic clipboard.
 */
import {appState} from '../app/state.js';
import {seqState} from './state.js';
import {WHITE_BRIGHT, WHITE_DIM, WHITE_OFF} from './colors.js';
import {sessionPlayMode, inputModeSelectorOpen, returnPreviousInputView} from './router-buttons.js';
import {loopEditResizeHold} from './loop-mode.js';
import {gridActive,gridEraseActive,gridFollowActive,setGridEraseHeld,toggleGridFollow} from './grid.js';
import {scaleFindingActive,scaleFindingCanApply,scaleFindingCanClear,clearScaleFindingPreview,commitScaleFindingPreview} from './scale-finding.js';
import {seqToast} from './render.js';
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
        'Loop Edit: Session mode',
        'Copy: normal clipboard']},
    3:{name:'Joint Play',lines:[
        'Pads: selected actors',
        'X: Off with chord knobs',
        'Loop: chord cycle / Hold',
        'Copy: clipboard (for now)']},
    4:{name:'Grid Sequencer',lines:[
        'Pads: time / pitch cells',
        'Arrows: time and rows',
        'Hold X: erase occupied',
        'Loop: follow / hold page',
        'Copy: normal clipboard']},
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
        'X: clear preview',
        'Copy: apply key/scale',
        'K7: arm then press pad',
        'K8: reference tonic']},
    9:{name:'Loop Edit',lines:[
        'Step buttons: bar choice',
        'Two held: loop range',
        'Double tap: one bar',
        'Loop+wheel: resize']}
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
/** A consumed press keeps ownership until its release even across a mode change. */
const capturedReleases=new Set<number>();
/** Read-only LED state: never poll the engine from this painter. */
export function modeButtonColor(cc:number,fallback:number):number {
    if(inputModeSelectorOpen())return cc===CC_MODE_LOOP?WHITE_OFF:fallback;
    if(chordButtonContext()){
        if(cc===CC_MODE_CLEAR)return WHITE_DIM;
        if(cc===CC_MODE_LOOP&&chordQueuedMode())return chordLoopSelected()?WHITE_BRIGHT:WHITE_DIM;
        if(cc===CC_MODE_LOOP)return WHITE_OFF;
        return fallback;
    }
    if(scaleFindingActive()){
        if(cc===CC_MODE_CLEAR)return scaleFindingCanClear()?WHITE_DIM:WHITE_OFF;
        if(cc===CC_MODE_COPY)return scaleFindingCanApply()?WHITE_DIM:WHITE_OFF;
        if(cc===CC_MODE_LOOP)return WHITE_OFF; // mic evidence hold comes later
    }
    if(gridActive()){
        if(cc===CC_MODE_CLEAR)return gridEraseActive()?WHITE_BRIGHT:WHITE_DIM;
        if(cc===CC_MODE_LOOP)return gridFollowActive()?WHITE_BRIGHT:WHITE_DIM;
    }
    if(seqState.loopMode&&cc===CC_MODE_LOOP)return WHITE_DIM;
    if(cc===CC_MODE_LOOP&&!seqState.sessionMode)return WHITE_OFF;
    return fallback;
}
/** An explicit, narrow mode dispatch; unmatched buttons keep stock behavior. */
export function modeButtonMidi(cc:number,value:number,shiftHeld:boolean):boolean {
    const down=value>0;
    if(cc===CC_MODE_COPY&&helpCopyHeld){
        if(!down)helpCopyHeld=false;
        return true;
    }
    if(!down&&capturedReleases.delete(cc)){
        if(cc===CC_MODE_CLEAR)setGridEraseHeld(false);
        if(cc===CC_MODE_LOOP)loopEditResizeHold(false);
        return true;
    }
    if(cc===CC_MODE_COPY&&shiftHeld&&MODE_GUIDES[sessionPlayMode()]&&!inputModeSelectorOpen()){
        if(down){helpCopyHeld=true;showModeHelp(sessionPlayMode(),true);}
        return true;
    }
    if(cc===51&&seqState.loopMode&&!inputModeSelectorOpen()){
        if(down){capturedReleases.add(cc);loopEditResizeHold(false);returnPreviousInputView();}
        return true; // Back leaves Loop Edit; never exits Movy
    }
    if(cc===CC_MODE_LOOP){
        // Clips' held Loop is an existing scene-row modifier, not the Loop
        // editor. Keep its on/off gesture and do not intercept its release.
        if(seqState.sessionMode&&!inputModeSelectorOpen())return false;
        if(!down)return true;
        capturedReleases.add(cc);
        if(inputModeSelectorOpen())return true;
        if(seqState.loopMode){loopEditResizeHold(true);return true;}
        if(shiftHeld)return true;
        if(chordButtonContext()){
            if(chordQueuedMode()){dismissModeHelp();chordLoopButton();}
            return true;
        }
        if(gridActive()){dismissModeHelp();toggleGridFollow();return true;}
        // Other modes have no verified Loop operation. They cannot enter the
        // old bar editor accidentally. The Session selector owns that view.
        seqToast('Loop Edit: Session');
        return true;
    }
    if(shiftHeld||inputModeSelectorOpen())return false;
    if(cc===CC_MODE_CLEAR){
        if(chordButtonContext()){
            if(down){capturedReleases.add(cc);dismissModeHelp();harmonyOff();}
            return true;
        }
        if(scaleFindingActive()){
            if(down){
                capturedReleases.add(cc);
                dismissModeHelp();
                if(clearScaleFindingPreview())seqToast('Preview cleared');
            }
            return true;
        }
        if(gridActive()){
            if(down){capturedReleases.add(cc);dismissModeHelp();setGridEraseHeld(true);}
            else setGridEraseHeld(false);
            return true;
        }
    }
    if(cc===CC_MODE_COPY&&scaleFindingActive()){
        if(down){capturedReleases.add(cc);dismissModeHelp();commitScaleFindingPreview();}
        return true;
    }
    return false;
}
