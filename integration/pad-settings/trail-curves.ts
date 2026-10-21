/** One readable preview below the Trail Decay controls. No native reads. */
import type { ViewModel } from '../types/viewmodel.js';
import { trailStyle } from '../seq/trail-settings.js';
import { trailFade } from '../seq/trail-history.js';
import { fontPrint } from '../font/index.js';

function isTrails(vm:ViewModel):boolean{return vm.moduleName==='SET PARAMETERS'&&(vm.bankIndex===2||vm.bankIndex===3);}
export function drawTrailCurves(vm:ViewModel):void{
    if(!isTrails(vm)||vm.bankIndex!==3||vm.overlay)return;
    const settings=trailStyle().settings,floor=settings.floor??0,peak=settings.peak??0.8;
    const x=87,y=36,w=39,h=18;
    fontPrint(65,y,Math.round(peak*100)+'%',1);
    fontPrint(65,y+h-6,Math.round(floor*100)+'%',1);
    let previous=0;
    for(let column=0;column<w;column++){
        const age=column/(w-1)*(settings.curve==='exponential'?4:1);
        const level=trailFade(age,1,settings.curve,settings.exponent,floor,peak);
        const row=Math.round((peak-level)/Math.max(0.000001,peak-floor)*(h-1));
        if(column===0)previous=row;
        fill_rect(x+column,y+Math.min(previous,row),1,Math.abs(row-previous)+1,1);
        previous=row;
    }
}
export function drawTrailCurveOverlay(vm:ViewModel):boolean{
    // Use the standard text selector, with the entire content area cleared so
    // unrelated controls and the preview cannot remain visible beside it.
    if(isTrails(vm)&&vm.overlay)fill_rect(0,11,128,46,0);
    return false;
}
