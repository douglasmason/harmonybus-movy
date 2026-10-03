/** Trail glyphs sample the same decay function used by pad colors. No native reads. */
import type { ViewModel } from '../types/viewmodel.js';
import { trailStyle } from '../seq/trail-settings.js';
import { trailFade, TRAIL_EXPONENTS, TrailCurve, TrailExponent } from '../seq/trail-history.js';
import { fontPrint } from '../font/index.js';

function graph(x:number,y:number,w:number,h:number,curve:TrailCurve,exponent:TrailExponent,color=1):void{
    let previous=0;
    for(let column=0;column<w;column++){
        const age=column/(w-1)*(curve==='exponential'?4:1);
        const row=Math.round((1-trailFade(age,1,curve,exponent,trailStyle().settings.floor))*(h-1));
        if(column===0)previous=row;
        fill_rect(x+column,y+Math.min(previous,row),1,Math.abs(row-previous)+1,color);
        previous=row;
    }
}
function isTrails(vm:ViewModel):boolean{return vm.moduleName==='SET PARAMETERS'&&(vm.bankIndex===2||vm.bankIndex===3);}
export function drawTrailCurves(vm:ViewModel):void{
    if(!isTrails(vm))return;
    const slot=vm.bankIndex===2?7:1,x=(slot%4)*32,y=slot<4?11:35;
    const style=trailStyle().settings;
    fill_rect(x,y,32,15,0);
    graph(x+3,y+1,26,13,vm.bankIndex===2?style.curve:'exponential',style.exponent??1);
}
export function drawTrailCurveOverlay(vm:ViewModel):boolean{
    if(!isTrails(vm)||!vm.overlay)return false;
    const ov=vm.overlay,exponents=vm.bankIndex===3&&ov.slot===1;
    if(!exponents&&!(vm.bankIndex===2&&ov.slot===7))return false;
    const x=ov.slot%4<2?0:32;
    fill_rect(x,11,96,47,0);
    ov.options.forEach((label,index)=>{
        const y=12+index*11,selected=index===ov.selected,color=selected?0:1;
        if(selected)fill_rect(x,y,95,10,1);
        graph(x+2,y+1,22,8,exponents?'exponential':(['none','linear','exponential'] as TrailCurve[])[index],exponents?TRAIL_EXPONENTS[index]:trailStyle().settings.exponent??1,color);
        fontPrint(x+28,y+2,label,color);
    });
    return true;
}
