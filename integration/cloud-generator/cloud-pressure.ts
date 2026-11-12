/** Cloud input response. Stored deposits already contain the mapped pressure. */
export type CloudPressure={target:'Velocity'|'Length'|'Spread'|'Probability'|'Rate';curve:'Linear'|'Soft'|'Firm';reverse:boolean;low:number;high:number};
const targets:CloudPressure['target'][]=['Velocity','Length','Spread','Probability','Rate'];
const defaults:CloudPressure={target:'Velocity',curve:'Linear',reverse:false,low:1,high:127};
let settings:CloudPressure={...defaults};
export function cloudPressureSnapshot():CloudPressure {return {...settings};}
export function cloudPressureTarget():number {return targets.indexOf(settings.target);}
export function cloudPressureTargets():readonly CloudPressure['target'][] {return targets;}
export function restoreCloudPressure(value:unknown):void {
 const candidate=value as Partial<CloudPressure>|null;
 settings={...defaults};
 if(!candidate)return;
 if(targets.includes(candidate.target!))settings.target=candidate.target!;
 if(['Linear','Soft','Firm'].includes(candidate.curve??''))settings.curve=candidate.curve!;
 settings.reverse=candidate.reverse===true;
 if(Number.isInteger(candidate.low)&&Number.isInteger(candidate.high)&&candidate.low!>=1&&candidate.high!<=127&&candidate.low!<=candidate.high!){settings.low=candidate.low!;settings.high=candidate.high!;}
}
export function cloudPressureRead(key:string):string|null {
 return key==='cg_pressure_target'?settings.target:key==='cg_pressure_curve'?settings.curve:key==='cg_pressure_direction'?(settings.reverse?'Reverse':'Normal'):key==='cg_pressure_low'?String(settings.low):key==='cg_pressure_high'?String(settings.high):null;
}
export function cloudPressureWrite(key:string,value:string):boolean|null {
 if(key==='cg_pressure_target'){if(!targets.includes(value as CloudPressure['target']))return false;settings.target=value as CloudPressure['target'];return true;}
 if(key==='cg_pressure_curve'){if(!['Linear','Soft','Firm'].includes(value))return false;settings.curve=value as CloudPressure['curve'];return true;}
 if(key==='cg_pressure_direction'){if(!['Normal','Reverse'].includes(value))return false;settings.reverse=value==='Reverse';return true;}
 if(key==='cg_pressure_low'||key==='cg_pressure_high'){
  const amount=Number(value);if(!Number.isInteger(amount)||amount<1||amount>127||key==='cg_pressure_low'&&amount>settings.high||key==='cg_pressure_high'&&amount<settings.low)return false;
  if(key==='cg_pressure_low')settings.low=amount;else settings.high=amount;return true;
 }
 return null;
}
/** Zero is a release, including Reverse. A softly held contact remains >= 1. */
export function mapCloudPressure(pressure:number):number {
 if(!Number.isFinite(pressure)||pressure<=0)return 0;
 const normalized=(Math.max(1,Math.min(127,pressure))-1)/126;
 const curved=settings.curve==='Soft'?Math.sqrt(normalized):settings.curve==='Firm'?normalized*normalized:normalized;
 return Math.round(settings.low+(settings.reverse?1-curved:curved)*(settings.high-settings.low));
}
export function cloudPressureParameters():any[] {return [
 {key:'cg_pressure_target',name:'Pressure Target',short_name:'Target',type:'enum',options:targets,short_options:['Vel','Length','Spread','Prob','Rate'],options_as_string:true,default:'Velocity'},
 {key:'cg_pressure_curve',name:'Pressure Response',short_name:'Response',type:'enum',options:['Linear','Soft','Firm'],options_as_string:true,default:'Linear'},
 {key:'cg_pressure_direction',name:'Pressure Direction',short_name:'Direction',type:'enum',options:['Normal','Reverse'],options_as_string:true,default:'Normal'},
 {key:'cg_pressure_low',name:'Pressure Low',short_name:'Low',type:'int',min:1,max:127,step:1,default:1},
 {key:'cg_pressure_high',name:'Pressure High',short_name:'High',type:'int',min:1,max:127,step:1,default:127}
];}
