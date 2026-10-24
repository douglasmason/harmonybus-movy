// Included in router-buttons.ts: selection is transient; mode owners stay authoritative.
const inputModeNames=['Clips','Normal Play','Motif Play','Joint Play','Grid Sequencer','Field Play','Chord Play','HB Settings'];
let inputModeChoice=-1,sessionSelectorHeld=false;
const selectorReleases=new Set<number>();
export const inputModeSelectorOpen=():boolean=>inputModeChoice>=0;
export const inputModeSelectorChoice=():number=>inputModeChoice;
export function resetInputModeSelector():void{inputModeChoice=-1;sessionSelectorHeld=false;selectorReleases.clear();appState.dirty=true;}
function toggleInputModeSelector():void{
    inputModeChoice=inputModeSelectorOpen()?-1:sessionPlayMode();appState.dirty=true;
}
export function inputModeSelectorMidi(data:number[]):boolean{
    if((data[0]&240)!==176)return false;
    const key=data[1],value=data[2];
    if(!value&&selectorReleases.delete(key))return true;
    if(!inputModeSelectorOpen())return false;
    if(key===14){const delta=value<64?value:value-128;inputModeChoice=Math.max(0,Math.min(inputModeNames.length-1,inputModeChoice+delta));appState.dirty=true;return true;}
    if(key===MoveMainButton||key===51){
        if(value){selectorReleases.add(key);if(key===51)inputModeChoice=-1;else selectInputMode(inputModeChoice);appState.dirty=true;}
        return true;
    }
    return false;
}
export function renderInputModeSelector():void{
    if(inputModeSelectorOpen())renderBrowseView(inputModeNames.map((name,index)=>({name:(index===sessionPlayMode()?'* ':'  ')+name})),inputModeChoice,'Input Mode','Back:cancel Click:enter');
}
