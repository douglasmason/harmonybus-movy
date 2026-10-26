// Included in router-buttons.ts: selection is transient; mode owners stay authoritative.
const inputModeNames=['Clips','Normal Play','Motif Play','Joint Play','Grid Sequencer','Field Play','Chord Play','HB Settings'];
let inputModeChoice=-1,sessionSelectorHeld=false;
let sessionPressAt=-Infinity,sessionTapReleased=-Infinity;
const inputViewHistory:{mode:number;view:number;panel:TrackSnapshot['modulePanel']}[]=[];
function rememberInputView():void{const mode=sessionPlayMode();inputViewHistory.push({mode,view:appState.currentView,panel:mode===1||mode===2?beginTrackSwitch().modulePanel:null});if(inputViewHistory.length>16)inputViewHistory.shift();}
export function rememberClipsReturn(view:number):void{inputViewHistory.splice(0,inputViewHistory.length,{mode:0,view,panel:null});}
export function returnPreviousInputView():boolean{
    if(seqState.sessionMode)return false;
    const previous=inputViewHistory.pop()??{mode:0,view:appState.currentView,panel:null};
    selectInputMode(previous.mode,false);
    if(sessionPlayMode()===previous.mode){appState.currentView=previous.view;if(previous.panel)followModulePanel(appState.activeTrack.index,previous.panel);}
    appState.dirty=true;return true;
}
const selectorReleases=new Set<number>();
let clipsPanel:TrackSnapshot['modulePanel']=null;
export function clipsReturnPanel():TrackSnapshot['modulePanel']{return clipsPanel;}
export const inputModeSelectorOpen=():boolean=>inputModeChoice>=0;
export const inputModeSelectorChoice=():number=>inputModeChoice;
export function resetInputModeSelector():void{inputModeChoice=-1;sessionSelectorHeld=false;sessionPressAt=sessionTapReleased=-Infinity;inputViewHistory.length=0;selectorReleases.clear();appState.dirty=true;}
function toggleInputModeSelector():void{
    inputModeChoice=inputModeSelectorOpen()?-1:sessionPlayMode();appState.dirty=true;
}
export function inputModeSelectorMidi(data:number[]):boolean{
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
