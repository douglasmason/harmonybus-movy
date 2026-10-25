/** Native status and existing pad settings share one bounded visible-page read. */
export const harmonyStatusKeys = ['current_harmony','final_harmony','next_harmony','next_model',
    'pad_display','next_lookahead','pad_pulse_rate','pad_next_pulse'];
export function harmonyStatusHierarchy(hierarchy:any):void {
    if(!hierarchy.levels?.root)return;
    const names=['Current Harmony','Effective Harmony','Next Harmony','Lookahead Model'];
    const short=['Current','Effective','Next','Model'];
    hierarchy.levels.harmony_status={name:'Harmony & Pads',knobs:harmonyStatusKeys,
        params:harmonyStatusKeys.map((key,index)=>index<4?
            {key,name:names[index],short_name:short[index],type:'string',access:'read',readOnly:true}:{key})};
    hierarchy.levels.root.params.unshift({level:'harmony_status'});
}
