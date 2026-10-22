/** Read-only, bounded observations of existing Field LFO routes. No DSP clock or writes. */
import { portFor } from '../track/registry.js';
import { TRACK_COUNT, trackKind } from '../track/ref.js';

export interface FieldRoute {
    track:number; slot:number; channel:number; target:string; parameter:string;
    depth:number; bipolar:boolean; enabled:boolean; configured:boolean; bypassed:boolean;
    base:string|null; effective:string|null; observedAt:number; delivery:string|null;
}
const properties=['shape','target','target_param','depth','polarity','enabled','active','status'];
const keys=['lfo1:field_source_version','midi_fx1:bypassed',
    ...[1,2].flatMap(slot=>properties.map(property=>`lfo${slot}:${property}`))];
type Observation = {attemptedAt:number; observedAt:number|null; state:'ok'|'unsupported'|'unavailable'};
const observations=new Map<number,Observation>();
const statuses=new Set(['inactive','disabled','unassigned','unmanaged','bypassed','pending','applied','rejected']);
const staleAfter=5000;
const byTrack=new Map<number,FieldRoute[]>();
let cursor=0, lastRead=-Infinity, alternate=false, scanned=new Set<number>();
export let routesOpen=false;
let selectedKey='';
export function resetFieldRoutes():void {
    byTrack.clear();observations.clear();scanned.clear();cursor=0;lastRead=-Infinity;selectedKey='';alternate=false;
}
export function setFieldRoutesOpen(open:boolean):void {
    routesOpen=open;if(open)resetFieldRoutes();
}
export function fieldRoutes():FieldRoute[]{return [...byTrack.values()].flat().sort((left,right)=>left.track-right.track||left.slot-right.slot);}
export function selectedFieldRoute():FieldRoute|undefined {
    const rows=fieldRoutes();return rows.find(row=>`${row.track}:${row.slot}`===selectedKey)??rows[0];
}
export function stepFieldRoute(delta:number):void {
    const rows=fieldRoutes(),selected=selectedFieldRoute();if(!rows.length)return;
    const index=Math.max(0,Math.min(rows.length-1,rows.indexOf(selected!)+delta));
    selectedKey=`${rows[index].track}:${rows[index].slot}`;
}
/** At most one bulk round trip every 125 ms, independent of track count.
 * Selected track alternates with the scan; all others refresh within four seconds.
 * Each track has a timestamp: the aggregate is deliberately not an atomic engine frame.
 */
export function tickFieldRoutes(now:number):boolean {
    if(!routesOpen)return false;
    if(now<lastRead)resetFieldRoutes();
    if(now-lastRead<125)return false;lastRead=now;
    const selected=selectedFieldRoute();alternate=!alternate;
    const track=alternate&&selected?selected.track:cursor++%TRACK_COUNT;
    scanned.add(track);
    if(trackKind(track)!=='movy'){byTrack.delete(track);observations.set(track,{attemptedAt:now,observedAt:now,state:'unsupported'});return true;}
    const previous=byTrack.get(track)??[];
    const assigned=selected?.track===track?previous.filter(row=>/^(synth|fx[1-8])$/.test(row.target)&&/^[a-zA-Z0-9_.:-]+$/.test(row.parameter)):[];
    const readKeys=[...keys,...assigned.flatMap(row=>[`${row.target}:${row.parameter}:base`,`${row.target}:${row.parameter}:effective`])];
    const port=portFor(track),values=port.getMany(readKeys, false);
    const unavailable=()=>{observations.set(track,{attemptedAt:now,observedAt:observations.get(track)?.observedAt??null,state:'unavailable'});return true;};
    if(values.length!==readKeys.length||!['0','1'].includes(values[0]??''))return unavailable();
    if(values[0]==='0'){byTrack.delete(track);observations.set(track,{attemptedAt:now,observedAt:now,state:'unsupported'});return true;}
    if(!['0','1'].includes(values[1]??''))return unavailable();
    const rows:FieldRoute[]=[];
    for(let slot=1;slot<=2;slot++){
        const offset=2+(slot-1)*properties.length;
        const [shapeText,targetText,parameterText,depthText,polarity,enabled,active,delivery]=values.slice(offset,offset+8);
        const shape=Number(shapeText),depth=Number(depthText);
        if(!shapeText||!Number.isInteger(shape)||shape<0||shape>21)return unavailable();
        if(shape<6)continue;
        if(!depthText||!Number.isFinite(depth)||Math.abs(depth)>1||!['0','1'].includes(enabled??'')||!['0','1'].includes(polarity??'')||!['0','1'].includes(active??''))return unavailable();
        if(active==='1'&&(!targetText||!parameterText))return unavailable();
        const target=targetText??'',parameter=parameterText??'';
        rows.push({track,slot,channel:shape-5,target,parameter,depth,bipolar:polarity==='1',
            enabled:enabled==='1',configured:active==='1',bypassed:values[1]==='1',base:null,effective:null,observedAt:now,delivery:delivery&&statuses.has(delivery)?delivery:null});
    }
    // Readouts share the batch with config. Retargeting invalidates old-key readings.
    assigned.forEach((prior,index)=>{
        const row=rows.find(candidate=>candidate.slot===prior.slot&&candidate.target===prior.target&&candidate.parameter===prior.parameter);
        if(row){row.base=values[keys.length+index*2]||null;row.effective=values[keys.length+index*2+1]||null;}
    });
    byTrack.set(track,rows);observations.set(track,{attemptedAt:now,observedAt:now,state:'ok'});return true;
}
/** UI age is independent of musical time; unavailable never means no routes. */
export function fieldRouteFreshness(track:number,now=Date.now()):'fresh'|'stale'|'unavailable' {
    const observation=observations.get(track);
    if(!observation||observation.state==='unavailable')return 'unavailable';
    return observation.observedAt===null||now<observation.observedAt||now-observation.observedAt>staleAfter?'stale':'fresh';
}
export function fieldRoutesSnapshot(now=Date.now()){return {version:2,open:routesOpen,scanned:scanned.size,total:TRACK_COUNT,
    selected:selectedFieldRoute()?{track:selectedFieldRoute()!.track,slot:selectedFieldRoute()!.slot}:null,
    tracks:Array.from({length:TRACK_COUNT},(_,track)=>({track,...observations.get(track),freshness:fieldRouteFreshness(track,now)})),
    routes:fieldRoutes().map(row=>({...row,freshness:fieldRouteFreshness(row.track,now)}))};}
export function fieldRouteStatus(row:FieldRoute,now=Date.now()):string {
    const freshness=fieldRouteFreshness(row.track,now);
    if(freshness!=='fresh')return freshness==='stale'?'Stale':'Unavailable';
    if(row.bypassed)return 'HB bypass';
    if(!row.enabled)return 'Disabled';
    if(!row.target||!row.parameter)return 'No target';
    const labels:Record<string,string>={inactive:'Inactive',disabled:'Disabled',unassigned:'No target',unmanaged:'Unmanaged',bypassed:'HB bypass',pending:'Pending',applied:'Applied',rejected:'Rejected'};
    return row.delivery?labels[row.delivery]:row.configured?'Enabled':'Inactive';
}
