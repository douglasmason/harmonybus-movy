/** Clips keeps its performance screen; setup uses the shared settings controller. */
import {createSchwungPage, type SchwungPage} from '../renderer/schwung-page.js';
import {portFor} from '../track/registry.js';
import {appState} from '../app/state.js';
import {clipsSnapshot, turnClipsSetting} from './clips-layout.js';
const controls=[
    {key:'clips_row',name:'Top Pad Row',options:['Bank','Conductor','Drums']},
    {key:'clips_touch',name:'Knob Touch Row',options:['Normal','Conductor','Drums']},
    {key:'clips_drums',name:'Drum Track',options:['5','9','13']}
];
let page:SchwungPage|null=null;
export function clipsSettingsPage():SchwungPage{
    if(page)return page;
    const native=portFor(0);
    const getParam=(key:string):string|null=>{
        const bare=key.replace(/:(base|modulated)$/,'').split(':').pop();
        if(key==='midi_fx1_module')return 'clips_settings';
        if(bare==='chain_params')return JSON.stringify(controls.map(control=>({...control,type:'enum',options_as_string:true,default:control.options[0]})));
        if(bare==='ui_hierarchy')return JSON.stringify({levels:{root:{name:'Clips Settings',knobs:controls.map(control=>control.key),params:controls.map(control=>({key:control.key}))}}});
        if(key.endsWith(':modulated'))return '0';
        const index=controls.findIndex(control=>control.key===bare);if(index<0)return native.getParam(key);
        const layout=clipsSnapshot(),value=[layout.topRow,layout.knobRow,[4,8,12].indexOf(layout.drumTracks[appState.focusGroup])][index];
        return controls[index].options[value];
    };
    const setParam=(key:string,value:string):boolean=>{
        const index=controls.findIndex(control=>control.key===key.split(':').pop());if(index<0)return false;
        const target=controls[index].options.indexOf(value),current=controls[index].options.indexOf(getParam(key)??'');
        if(target<0||current<0)return false;
        for(let step=0;step<Math.abs(target-current);step++)turnClipsSetting(index,Math.sign(target-current));
        return true;
    };
    page=createSchwungPage({...native,getParam,setParam,getMany:keys=>keys.map(getParam),setMany:pairs=>pairs.every(([key,value])=>setParam(key,value)),setParamTimeout:setParam},'midi_fx1');
    return page;
}
