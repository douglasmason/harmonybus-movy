/** Compact related settings without changing native parameters or their owners. */
type Level = {name:string; knobs:string[]; params:any[]; [key:string]:any};
type Link = {level:string};
const bareKey=(key:string):string=>key.replace(/^cp_track_\d+_/, '');

export function compactChordSettings(levels:Record<string,Level>,links:Link[]):void {
    const assign=(level:Level,keys:string[]):void=>{
        const entries=new Map((level.params??[]).map(entry=>[entry.key,entry]));
        level.knobs=keys;level.params=keys.map(key=>entries.get(key)??{key});
    };
    const move=(source:string,target:string,key:string):void=>{
        const from=levels[source],to=levels[target];
        const actual=from?.knobs.find(candidate=>bareKey(candidate)===key);
        if(!actual||!to)return;
        assign(from,from.knobs.filter(candidate=>candidate!==actual));
        if(!to.knobs.includes(actual))assign(to,[...to.knobs,actual]);
    };
    // These values belong alongside the controls that explain them.
    move('cp_Conductor_secondary_scale','cp_Conductor_explicit_key','track_defaults_reset');
    move('cp_Conductor_chord_forms','cp_Conductor_secondary_scale','conductor_default_chord_form');
    move('cp_Comp_chord_forms','cp_Comp_follower_source','pad_adjacent_shading');
    move('cp_Melody_track_scales','cp_Melody_follower_source','local_dominant');
    const keyPage=levels.cp_Conductor_global_transpose,liveKey=levels.cp_Conductor_explicit_key;
    if(keyPage&&liveKey){
        const keys=[...new Set([...keyPage.knobs,...liveKey.knobs])];
        assign(keyPage,keys.slice(0,7));assign(liveKey,keys.slice(7));
        liveKey.name='Conductor Live Key / Reset';
    }

    // Keep Range / Off in the same position on every page. Overflow is collected
    // below by musical purpose, rather than making one page per displaced knob.
    for(const link of [...links]){
        const level=levels[link.level],keys=level.knobs.filter(key=>key!=='cp_off');
        assign(level,[...keys.slice(0,7),...Array.from({length:Math.max(0,7-keys.length)},(_,index)=>'cp_blank_'+index),'cp_off']);
        for(let offset=7;offset<keys.length;offset+=7){
            const id=link.level+'_more'+(offset===7?'':offset);
            const extra=keys.slice(offset,offset+7);
            levels[id]={name:level.name+' More',knobs:[...extra,...Array.from({length:7-extra.length},(_,index)=>'cp_blank_'+index),'cp_off'],params:extra.map(key=>({key}))};
            links.push({level:id});
        }
    }
    const collect=(id:string,name:string,sources:string[],context?:string):void=>{
        const extraIds=sources.map(source=>source+'_more').filter(source=>levels[source]);
        const keys=[...new Set(extraIds.flatMap(source=>levels[source].knobs.filter(key=>key!=='cp_off'&&!key.startsWith('cp_blank_'))))];
        if(!keys.length)return;
        if(context){
            const control=sources.flatMap(source=>levels[source]?.knobs??[]).find(key=>bareKey(key)===context);
            if(control&&!keys.includes(control))keys.unshift(control);
        }
        // Preserve the original pages if a future family outgrows one page.
        if(keys.length>7)return;
        const index=links.findIndex(link=>extraIds.includes(link.level));
        for(let position=links.length-1;position>=0;position--)if(extraIds.includes(links[position].level))links.splice(position,1);
        for(const extraId of extraIds)delete levels[extraId];
        levels[id]={name,knobs:[...keys,...Array.from({length:7-keys.length},(_,index)=>'cp_blank_'+index),'cp_off'],params:keys.map(key=>({key}))};
        links.splice(index,0,{level:id});
    };
    for(const actor of ['Conductor','Comp','Melody']){
        collect('cp_'+actor+'_operation_details',actor+' Op Details',
            ['follower_touch','operations_9_16','motion_operation','motion_timing','motion_conditions'].map(source=>'cp_'+actor+'_'+source),'motion_lane');
    }
    collect('cp_Melody_sound_details','Melody Sound Details',['cp_Melody_chord_player','cp_Melody_arp_player']);
}
