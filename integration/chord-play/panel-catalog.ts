/** Stable panel identities and deliberate navigation policy, independent of labels. */
export const PANEL_LAYOUT_VERSION = 2;
export type PanelSpec = {id:string; group:string; order:number; owner:string; known:boolean};
const shared:Record<string,string> = {};
function register(group:string,levels:string[]):void {for(const level of levels)shared[level]=group;}
register('Core',['root','harmony_status','follower_touch','operations_9_16','approach_bank_0','approach_bank_1','harm_play_controls','pitch_play','secondary']);
register('Operation Settings',['motion_operation','motion_timing','motion_conditions','harm_play_settings','motif_record','motif_tools','motifs']);
register('Harmony & Scales',['global_transpose','explicit_key','track_scales','secondary_scale']);
register('Harmony & Timing',['follower_root','next_harm','grid_timing']);
register('Chords & Arp',['chord_player','chord_forms','arp_player']);
register('Rhythm & Motifs',['rhythm_generate','rhythm_edit','motif_targets','motif_load','motif_global','motif_play']);
register('Mapping',['follower_source','follower_play','follower_play_tools']);
register('Diagnostics',['follower_this','diagnostics']);
register('Display',['pad_display','joint_pads']);
register('Routing',['shared_context']);
register('Defaults',['role_defaults','conductor_chord_defaults','follower_chord_defaults','conductor_scale_defaults','follower_scale_defaults','chord_defaults_status']);
register('Usage',['interface_usage']);
register('Song Sections',['joint_sections','joint_section_shape','joint_section_sound']);
register('Recording',['joint_record']);
register('Harmony & Timing',['joint_overview']);
for(const [index,actor] of ['Root','Bass','Comp','Melody'].entries()){
    for(const family of ['actor','rhythm','weave','conditions','sources','source_expression','source_gestures','source_operations','source_automation','preview','variation'])shared[`joint_${family}_${index}`]=actor;
}
shared.joint_comp_weave='Comp';
const chordCore=['root','cp_bank_0','cp_bank_1','cp_bank_2','cp_scale_controls','cp_Conductor_follower_touch','cp_Conductor_operations_9_16','cp_Conductor_motif_play'];
const playCore=['root','harmony_status','follower_touch','operations_9_16'];
const motifCore=['root','approach_bank_0','approach_bank_1','harm_play_controls','follower_touch','operations_9_16','pitch_play','secondary','harmony_status'];
const chord:Record<string,string>={cp_clips:'Conductor Content',cp_motifs:'Conductor Content',cp_edit:'Chord Editing',cp_edit_scale:'Chord Editing',cp_overview:'Conductor Settings',cp_comp_library:'Libraries',cp_bass_library:'Libraries',cp_setup:'Setup'};
for(const family of ['Sound','Conductor','Comp','Melody']){
    for(const level of ['chord_player','arp_player','chord_forms','follower_source','follower_play','follower_touch','operations_9_16','motif_play','motif_global','motif_load','motif_targets','global_transpose','explicit_key','secondary_scale','rhythm_generate','rhythm_edit','motion_operation','motion_timing','motion_conditions','track_scales','live']){
        chord[`cp_${family}_${level}`]=family==='Sound'?'Sound':family==='Conductor'?(['motif_load','motif_targets','rhythm_generate','rhythm_edit'].includes(level)?'Conductor Content':'Conductor Settings'):family==='Melody'?(level.startsWith('motion_')||['follower_touch','operations_9_16'].includes(level)?'Melody Operations':['chord_player','arp_player'].includes(level)?'Melody Sound':'Melody Mapping'):'Comp';
    }
}
const groupOrder=['Sound','Conductor Content','Chord Editing','Conductor Settings','Root','Bass','Comp','Melody','Melody Mapping','Melody Sound','Melody Operations','Song Sections','Recording','Operation Settings','Harmony & Timing','Harmony & Scales','Chords & Arp','Rhythm & Motifs','Mapping','Libraries','Defaults','Display','Routing','Diagnostics','Usage','Setup','Other Settings'];
export function normalizedMode(name:string):string{return name.replace(/ Setup$/, '').replace(/^Play$/, 'Normal Play').replace(/^Joint$/, 'Joint Play');}
const specCache=new WeakMap<object,Map<string,PanelSpec>>();
/** Generated overflow retains its owner's group, but never inherits a Core slot. */
export function panelSpec(modeName:string,page:any):PanelSpec{
    const cached=page&&specCache.get(page)?.get(modeName);if(cached)return cached;
    const mode=normalizedMode(modeName),level=String(page?.level??''),base=level.replace(/_more$/, '');
    const core=mode==='Chord Play'?chordCore:mode==='Normal Play'?playCore:motifCore;
    let group:string|undefined=mode==='Chord Play'?chord[base]:shared[base];
    if(mode==='Joint Play'&&level.startsWith('cp_'))group=chord[base];
    if(mode==='Joint Play'&&level==='joint_setup')group='Setup';
    if(mode==='Joint Play'&&level==='cp_selection')group='Conductor Settings';
    let order=core.indexOf(level);
    if(mode==='Joint Play'&&['cp_bank_1','cp_bank_2','cp_scale_controls'].includes(level))order=['cp_bank_1','cp_bank_2','cp_scale_controls'].indexOf(level)+1;
    if(mode==='Field Play') {group=['root','field_mapping','field_display','field_spread'].includes(level)?'Core':undefined;order=['root','field_mapping','field_display','field_spread'].indexOf(level);}
    else if(mode==='Grid Sequencer') {group=['root','grid_rows','field_mapping'].includes(level)?'Core':shared[base];order=['root','grid_rows','field_mapping'].indexOf(level);}
    else if(order>=0)group='Core';
    else if(group==='Core')group='Operation Settings';
    const actor=/^cp_(Conductor|Comp|Melody|Sound)_/.exec(base)?.[1]??(/^joint_/.test(base)?(['Root','Bass','Comp','Melody'].find(actor=>group===actor)??'Shared'):'Track');
    // Same-level overflow from the shared planner is distinguished by its controls.
    const keys=(page?.keys??[]).filter((key:string)=>!key.startsWith('cp_blank_')).map((key:string)=>key.replace(/^cp_track_\d+_/, 'cp_owner_')).join(',');
    const result={id:mode+'/'+level+'/'+keys,group:group??'Other Settings',order:order<0?1000:order,owner:actor,known:!!group};
    if(page){const cache=specCache.get(page)??new Map<string,PanelSpec>();cache.set(modeName,result);specCache.set(page,cache);}
    return result;
}
export function orderPanelGroups(groups:string[]):string[]{return groups.sort((a,b)=>(groupOrder.indexOf(a)<0?999:groupOrder.indexOf(a))-(groupOrder.indexOf(b)<0?999:groupOrder.indexOf(b)));}
