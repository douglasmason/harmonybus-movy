/** Bounded semantic UI history. No host calls, audio data, parameter values or MIDI output. */
export type UsageContext={view:string;panel:string;group:string;owner:string;track:number;playing:boolean;recording:boolean;shift:boolean};
export type UsageEvent=UsageContext & {at:number;kind:string;control:string;outcome:string;to?:string;count:number;travel:number;reversals:number;duration:number;direction:number};
type UsageRow={id:string;view:string;panel:string;group:string;owner:string;control:string;kind:string;playing:boolean;recording:boolean;count:number;travel:number;reversals:number;navigation:number;sessions:string[]};
export const USAGE_LIMITS={events:512,rows:256,sessions:16};
export class InteractionLog{
    enabled=true;
    events:UsageEvent[]=[];
    rows=new Map<string,UsageRow>();
    omitted=0;
    private navigation=0;
    private session=String(Date.now());
    private pending:UsageEvent|null=null;
    constructor(session=String(Date.now())){this.session=session;}
    record(context:UsageContext,kind:string,control:string,outcome='observed',at=Date.now(),direction=0,duration=0,to?:string):void{
        if(!this.enabled)return;
        const event:UsageEvent={...context,at,kind,control,outcome,count:1,travel:Math.abs(direction),reversals:0,duration,direction:Math.sign(direction),to};
        const previous=this.pending;
        // A burst is one editing gesture. Preserve its travel and reversals separately.
        if(kind==='turn'&&previous?.kind===kind&&at-previous.at<500&&at>=previous.at&&previous.panel===event.panel&&previous.view===event.view&&previous.control===control&&previous.track===event.track&&previous.playing===event.playing&&previous.recording===event.recording&&previous.shift===event.shift){
            previous.count++;previous.travel+=event.travel;previous.duration+=at-previous.at;previous.at=at;
            if(previous.direction&&event.direction!==previous.direction)previous.reversals++;
            previous.direction=event.direction;return;
        }
        this.flush();this.pending=event;
        if(kind!=='turn')this.flush();
    }
    flush():void{
        const event=this.pending;if(!event)return;this.pending=null;
        this.events.push(event);if(this.events.length>USAGE_LIMITS.events)this.events.shift();
        if(event.kind==='navigate')this.navigation++;
        const id=[event.view,event.panel,event.kind,event.control,event.playing?1:0,event.recording?1:0,event.shift?1:0,event.outcome].join('|');
        let row=this.rows.get(id);
        if(!row){
            if(this.rows.size>=USAGE_LIMITS.rows){this.rows.delete(this.rows.keys().next().value!);this.omitted++;}
            row={id,view:event.view,panel:event.panel,group:event.group,owner:event.owner,control:event.control,kind:event.kind,playing:event.playing,recording:event.recording,count:0,travel:0,reversals:0,navigation:0,sessions:[]};this.rows.set(id,row);
        }
        row.count++;row.travel+=event.travel;row.reversals+=event.reversals;
        if(!row.sessions.includes(this.session)){row.sessions.push(this.session);if(row.sessions.length>USAGE_LIMITS.sessions)row.sessions.shift();}
        if(event.kind!=='navigate'){row.navigation+=this.navigation;this.navigation=0;}
    }
    clear():void{this.events=[];this.rows.clear();this.omitted=0;this.navigation=0;this.pending=null;}
    snapshot():any{
        this.flush();
        const rows=[...this.rows.values()];
        return {enabled:this.enabled,events:this.events,rows,omitted:this.omitted,
            suggestions:rows.filter(row=>row.kind!=='navigate'&&row.navigation>0).sort((a,b)=>b.navigation-a.navigation).slice(0,20).map(row=>({view:row.view,panel:row.panel,group:row.group,control:row.control,playing:row.playing,recording:row.recording,uses:row.count,sessions:row.sessions.length,navigationSteps:row.navigation,averageNavigation:Math.round(100*row.navigation/row.count)/100}))};
    }
    restore(value:any):boolean{
        if(!value||typeof value.enabled!=='boolean'||!Array.isArray(value.rows)||value.rows.length>USAGE_LIMITS.rows||!Array.isArray(value.events)||value.events.length>USAGE_LIMITS.events)return false;
        const string=(value:any)=>typeof value==='string'&&value.length<=2048;
        const count=(value:any)=>Number.isFinite(value)&&value>=0;
        if(!value.rows.every((row:any)=>row&&['id','view','panel','group','owner','control','kind'].every(key=>string(row[key]))&&['count','travel','reversals','navigation'].every(key=>count(row[key]))&&Array.isArray(row.sessions)&&row.sessions.length<=USAGE_LIMITS.sessions&&row.sessions.every(string)))return false;
        if(!value.events.every((event:any)=>event&&['view','panel','group','owner','control','kind','outcome'].every(key=>string(event[key]))&&['at','count','travel','reversals','duration'].every(key=>count(event[key]))))return false;
        this.clear();this.enabled=value.enabled;this.events=value.events;this.rows=new Map(value.rows.map((row:UsageRow)=>[row.id,row]));this.omitted=count(value.omitted)?value.omitted:0;return true;
    }
}
