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
import {scaleFindingActive,scaleFindingCanApply,scaleFindingCanClear,clearScaleFindingPreview,commitScaleFindingPreview,scaleMicrophoneListening,scaleMicrophoneAvailable,setScaleMicrophoneListening} from './scale-finding.js';
import {seqToast} from './render.js';
import {fieldEraseAvailable,fieldEraseActive,setFieldEraseHeld} from './field-play.js';
import {motifEditing,motifAction,motifPage,motifFinish} from '../renderer/hb-motif.js';
import {schwungActiveFor} from '../renderer/schwung-grid.js';
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
        'Copy: motif to slot',
        'X: cancel motif draft',
        'Loop Edit: Session mode']},
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
        'X+pad: erase output lane',
        'Only in Outputs view',
        'Jog: settings/routing']},
    6:{name:'Chord Play',lines:[
        'X: harmony Off',
        'Loop: cycle / Hold',
        'Copy: normal clipboard',
        'K8: range / Off']},
    8:{name:'Scale Finding',lines:[
        'Sample: listen / stop mic',
        'K5: layout K6: window',
        'K7: tonic K8: tune',
        'Copy: key+scale X: clear']},
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
function motifActionPage(){
    if(sessionPlayMode()!==2||inputModeSelectorOpen())return null;
    const page=schwungActiveFor(appState.activeTrack.index,'midi_fx1');
    return page?.ready&&page.moduleId==='harmonybus'&&motifPage(page)?page:null;
}
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
        if(cc===CC_MODE_SAMPLE)return !scaleMicrophoneAvailable()?WHITE_OFF:
            scaleMicrophoneListening()?WHITE_BRIGHT:WHITE_DIM;
        if(cc===CC_MODE_LOOP)return WHITE_OFF; // Evidence looping remains unimplemented.
    }
    if(sessionPlayMode()===2){
        if(cc===CC_MODE_COPY)return motifActionPage()&&!motifEditing()?WHITE_DIM:WHITE_OFF;
        if(cc===CC_MODE_CLEAR&&motifEditing())return WHITE_DIM;
    }
    if(fieldEraseAvailable()&&cc===CC_MODE_CLEAR)return fieldEraseActive()?WHITE_BRIGHT:WHITE_DIM;
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
        if(cc===CC_MODE_CLEAR){setGridEraseHeld(false);setFieldEraseHeld(false);}
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
        if(scaleFindingActive()){seqToast('Use Sample to listen');return true;}
        if(gridActive()){dismissModeHelp();toggleGridFollow();return true;}
        // Other modes have no verified Loop operation. They cannot enter the
        // old bar editor accidentally. The Session selector owns that view.
        seqToast('Loop Edit: Session');
        return true;
    }
    if(shiftHeld||inputModeSelectorOpen())return false;
    if(cc===CC_MODE_SAMPLE&&scaleFindingActive()){
        // Scale Finding owns Sample, including the release. Never open the
        // stock sampler or record audio while entering this input mode.
        if(down){
            capturedReleases.add(cc);dismissModeHelp();
            if(setScaleMicrophoneListening(!scaleMicrophoneListening())){
                seqToast(scaleMicrophoneListening()?'Mic listening':'Mic stopped');
            }
        }
        return true;
    }
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
        if(motifEditing()&&sessionPlayMode()===2){
            if(down){capturedReleases.add(cc);dismissModeHelp();motifFinish(true);}
            return true;
        }
        if(fieldEraseAvailable()){
            if(down){capturedReleases.add(cc);dismissModeHelp();setFieldEraseHeld(true);}
            else setFieldEraseHeld(false);
            return true;
        }
        if(gridActive()){
            if(down){capturedReleases.add(cc);dismissModeHelp();setGridEraseHeld(true);}
            else setGridEraseHeld(false);
            return true;
        }
    }
    if(cc===CC_MODE_COPY&&sessionPlayMode()===2){
        if(down){
            capturedReleases.add(cc);dismissModeHelp();
            const owner=motifActionPage();
            if(owner&&!motifEditing())motifAction(owner,'motif_copy');
            else seqToast('Choose a motif slot');
        }
        return true; // No surprise clip duplication when the motif page is absent.
    }
    if(cc===CC_MODE_COPY&&scaleFindingActive()){
        if(down){capturedReleases.add(cc);dismissModeHelp();commitScaleFindingPreview();}
        return true;
    }
    return false;
}

/** Presentation facts shared by Move LEDs, Launchpad side lamps and Remote UI.
 * Never touch the DSP from this pure read-only projection.
 */
export interface ModeActionDescriptor {
    cc:number; physical:string; label:string; detail:string;
    available:boolean; active:boolean; gesture:'tap'|'hold'|'hold+pad';
}
export function modeActionDescriptors():ModeActionDescriptor[]{
    const mode=sessionPlayMode(),chord=chordButtonContext(),motif=motifActionPage();
    const result:ModeActionDescriptor[]=[
        {cc:CC_MODE_COPY,physical:'Copy',label:'Copy',detail:'Copy the current clip or steps',available:true,active:false,gesture:'tap'},
        {cc:CC_MODE_CLEAR,physical:'X',label:'Delete',detail:'Delete selected clip or steps',available:true,active:false,gesture:'hold'},
        {cc:CC_MODE_LOOP,physical:'Loop',label:'Loop Edit in Session',detail:'Choose Session > Loop Edit for bar loops',available:false,active:false,gesture:'tap'},
        {cc:CC_MODE_MUTE,physical:'Mute',label:'Mute track',detail:'Mute the currently focused track',available:true,active:false,gesture:'tap'},
        {cc:CC_MODE_SAMPLE,physical:'Sample',label:'Sample',detail:'Native sampling button; microphone finder not yet connected',available:true,active:false,gesture:'tap'},
    ];
    const set=(cc:number,label:string,detail:string,available=true,active=false,gesture:ModeActionDescriptor['gesture']='tap'):void=>{
        const descriptor=result.find(item=>item.cc===cc);
        if(descriptor)Object.assign(descriptor,{label,detail,available,active,gesture});
    };
    if(mode===0)set(CC_MODE_LOOP,'Scenes (hold)','Hold Loop and press a step to launch a scene',true,false,'hold');
    if(mode===2){
        set(CC_MODE_COPY,'Copy motif','Copy selected motif to its armed library slot',!!motif&&!motifEditing());
        set(CC_MODE_CLEAR,motifEditing()?'Cancel motif':'Delete step',
            motifEditing()?'Cancel the current uncommitted motif draft':'Normal step-delete gesture',true,false,'tap');
    }
    if(chord){
        set(CC_MODE_CLEAR,'Harmony Off','Clear the live harmonic override / queued chord',true);
        set(CC_MODE_LOOP,chordQueuedMode()?'Repeat queue':'Loop Edit in Session',
            chordQueuedMode()?'Toggle queued chord ending between Loop and Hold':'Chord queue not enabled',
            chordQueuedMode(),chordQueuedMode()&&chordLoopSelected());
    }else if(mode===4){
        set(CC_MODE_CLEAR,'Erase cell','Hold X then press an occupied Grid cell',true,gridEraseActive(),'hold+pad');
        set(CC_MODE_LOOP,'Follow grid','Toggle moving playhead page vs fixed page',true,gridFollowActive());
    }else if(mode===5){
        set(CC_MODE_CLEAR,'Erase output','Hold X then press a Field output lane',fieldEraseAvailable(),fieldEraseActive(),'hold+pad');
    }else if(mode===8){
        set(CC_MODE_COPY,'Apply key','Apply the selected tonic and scale together to the shared parent key',scaleFindingCanApply());
        set(CC_MODE_CLEAR,'Clear preview','Discard uncommitted key/scale selection only',scaleFindingCanClear());
        set(CC_MODE_SAMPLE,'Listen / stop','Start or stop pitch-class data collection without recording audio',scaleMicrophoneAvailable(),scaleMicrophoneListening());
        set(CC_MODE_LOOP,'Evidence loop','Reserved for bounded evidence looping or replay; not yet implemented',false);
    }else if(mode===9){
        set(CC_MODE_LOOP,'Resize loop','Hold Loop and turn Jog to resize the bar loop',true,false,'hold');
    }
    return result;
}
