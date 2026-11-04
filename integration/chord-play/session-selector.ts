// Included in router-buttons.ts: selection is transient; mode owners stay authoritative.
const inputModeNames=['Clips','Normal Play','Motif Play','Joint Play','Grid Sequencer','Field Play','Chord Play','HB Settings'];
let inputModeChoice=-1,sessionSelectorHeld=false;
let sessionPressAt=-Infinity,sessionTapReleased=-Infinity;
let sessionGestureUsed=false,sessionSecondTap=false,physicalShiftHeld=false;
interface InputView {mode:number;view:number;panel:TrackSnapshot['modulePanel'];origin:number;}
const inputViewHistory:InputView[]=[];
let clipsReturnView:InputView|null=null,clipsReturnHistory:InputView[]=[];
function currentInputView():InputView{
    const mode=sessionPlayMode(),view=appState.currentView,origin=paramPageState.origin;
    return {mode,view,origin,panel:mode===1||mode===2?beginTrackSwitch().modulePanel:null};
}
function rememberInputView():void{inputViewHistory.push(currentInputView());if(inputViewHistory.length>16)inputViewHistory.shift();}
function rememberClipsInputView():void{clipsReturnView=currentInputView();clipsReturnHistory=inputViewHistory.slice();}
export function rememberClipsReturn(view:number):void{inputViewHistory.splice(0,inputViewHistory.length,{mode:0,view,panel:null,origin:paramPageState.origin});}
function restoreInputView(previous:InputView):boolean{
    selectInputMode(previous.mode,false);
    if(sessionPlayMode()!==previous.mode)return false;
    appState.currentView=previous.view;paramPageState.origin=previous.origin;
    if(previous.panel)followModulePanel(appState.activeTrack.index,previous.panel);
    appState.dirty=true;return true;
}
function toggleClipsInputView():void{
    if(!seqState.sessionMode){selectInputMode(0);return;}
    if(!clipsReturnView){selectInputMode(1);return;}
    if(restoreInputView(clipsReturnView))inputViewHistory.splice(0,inputViewHistory.length,...clipsReturnHistory);
}
export function returnPreviousInputView():boolean{
    if(seqState.sessionMode)return false;
    const previous=inputViewHistory.pop()??{mode:0,view:appState.currentView,panel:null,origin:paramPageState.origin};
    if(!restoreInputView(previous))inputViewHistory.push(previous);
    appState.dirty=true;return true;
}
const selectorReleases=new Set<number>();
let clipsPanel:TrackSnapshot['modulePanel']=null;
export function clipsReturnPanel():TrackSnapshot['modulePanel']{return clipsPanel;}
export const inputModeSelectorOpen=():boolean=>inputModeChoice>=0;
export const inputModeSelectorChoice=():number=>inputModeChoice;
export const sessionModifierHeld=():boolean=>sessionSelectorHeld;
export function resetInputModeSelector():void{
    inputModeChoice=-1;sessionSelectorHeld=sessionGestureUsed=sessionSecondTap=physicalShiftHeld=false;
    appState.shiftHeld=false;sessionPressAt=sessionTapReleased=-Infinity;
    inputViewHistory.length=0;clipsReturnView=null;clipsReturnHistory=[];clipsPanel=null;
    selectorReleases.clear();appState.dirty=true;
}
/** Observe gestures before modal dispatch; releases must also escape modal gates. */
export function sessionModifierMidi(data:number[]):boolean{
    const status=data[0]&240,key=data[1],value=data[2];
    if(status===176&&key===MoveShift){
        physicalShiftHeld=value>0;appState.shiftHeld=physicalShiftHeld||sessionSelectorHeld;
        if(value>0){sessionTapReleased=-Infinity;if(sessionSelectorHeld)sessionGestureUsed=true;}
        appState.dirty=true;return true;
    }
    if(status===176&&key===CC_NOTE_SESSION){
        if(!value&&sessionSelectorHeld)return sessionSelectorButton(0,false);
        return false;
    }
    // Pressure, note-offs and zero encoder deltas cannot consume a clean tap.
    if(value>0&&(status===176||status===144)){
        sessionTapReleased=-Infinity;
        if(sessionSelectorHeld){sessionGestureUsed=true;inputModeChoice=-1;appState.dirty=true;}
    }
    return false;
}
function sessionSelectorButton(value:number,shiftHeld:boolean):boolean{
    const now=Date.now();
    if(value>0){
        if(sessionSelectorHeld)return true;
        physicalShiftHeld=shiftHeld;sessionSelectorHeld=true;sessionGestureUsed=shiftHeld;sessionPressAt=now;
        sessionSecondTap=inputModeSelectorOpen()&&now-sessionTapReleased>=0&&now-sessionTapReleased<=350;
        appState.shiftHeld=true;
        if(shiftHeld){sessionTapReleased=-Infinity;selectInputMode(0);}
    }else{
        if(!sessionSelectorHeld)return true;
        sessionSelectorHeld=false;appState.shiftHeld=physicalShiftHeld;sessionButtonDown(false);
        const cleanTap=!sessionGestureUsed&&now-sessionPressAt>=0&&now-sessionPressAt<=350;
        if(cleanTap&&sessionSecondTap){sessionTapReleased=-Infinity;toggleClipsInputView();}
        else if(cleanTap){toggleInputModeSelector();sessionTapReleased=inputModeSelectorOpen()?now:-Infinity;}
        else sessionTapReleased=-Infinity;
        sessionGestureUsed=sessionSecondTap=false;
    }
    appState.dirty=true;return true;
}
function toggleInputModeSelector():void{
    inputModeChoice=inputModeSelectorOpen()?-1:sessionPlayMode();appState.dirty=true;
}
export function inputModeSelectorMidi(data:number[]):boolean{
    if(sessionModifierMidi(data))return true;
    if((data[0]&240)!==176)return false;
    const key=data[1],value=data[2];
    if(!value&&selectorReleases.delete(key))return true;
    if(!inputModeSelectorOpen())return false;
    if(key===14||key===MoveMainButton||key===51)sessionPressAt=sessionTapReleased=-Infinity;
    if(key===14){const delta=value<64?value:value-128;inputModeChoice=Math.max(0,Math.min(inputModeNames.length-1,inputModeChoice+delta));appState.dirty=true;return true;}
    if(key===MoveMainButton||key===51){
        if(value){selectorReleases.add(key);if(key===51)inputModeChoice=-1;else selectInputMode(inputModeChoice);appState.dirty=true;}
        return true;
    }
    return false;
}
export function renderInputModeSelector():void{
    if(inputModeSelectorOpen())renderBrowseView(inputModeNames.map((name,index)=>({name:(index===sessionPlayMode()?'* ':'  ')+name})),inputModeChoice,'View','Back:cancel Click:enter');
}
