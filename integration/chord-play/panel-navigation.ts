import { renderBrowseView } from './browse-view.js';
import { drawHeader, drawBankBar } from './header.js';
import { fontPrint } from '../font/index.js';
import { appState } from '../app/state.js';

// Deliberately explicit: new editors and generated overflow pages belong in
// Settings until they are consciously promoted to the playing sequence.
const chordPlayMain = new Set([
    'root','cp_bank_0','cp_bank_1','cp_bank_2','cp_scale_controls',
    'cp_Conductor_follower_touch','cp_Conductor_operations_9_16','cp_Conductor_motif_play',
]);

/** Navigation only: the shared controller continues to own parameters and gestures. */
export function panelNavigation(ctl:any,enabled:()=>boolean,modeName:()=>string){
    let category='Core',menu=false,choice=0,returnIndex=0,coreReturnIndex=0;
    const jump=ctl.goToPage.bind(ctl),jog=ctl.onJog.bind(ctl);
    const mode=():string=>modeName().replace(/ Setup$/, '').replace(/^Play$/, 'Normal Play');
    function group(page:any):string {
        const level=String(page.level??''),name=String(page.name??'');
        if(/Grid|Field/.test(mode()))return 'Core';
        if(mode()==='Chord Play'){
            if(chordPlayMain.has(level))return 'Core';
            if(/^cp_(comp_library|bass_library)/.test(level))return 'Libraries';
            if(level==='cp_setup')return 'Setup';
            if(/^cp_Comp_/.test(level))return 'Comp';
            if(/^cp_Melody_/.test(level))return 'Melody';
            return 'Conductor';
        }
        if(/^cp_Conductor_(follower_touch|operations_9_16|motion_operation|motif_play|motif_global|motif_load|motif_targets|rhythm_generate)/.test(level))return 'Core';
        if(/^cp_(comp_library|bass_library)/.test(level))return 'Libraries';
        if(level==='cp_setup')return 'Setup';
        if(/^cp_(Conductor|Comp|Melody)_/.test(level))return level.split('_')[1];
        if(level==='joint_comp_weave')return 'Comp';
        if(/^joint_(actor|rhythm|weave|conditions)_/.test(level))return ['Root','Bass','Comp','Melody'][Number(level.split('_').slice(-1)[0])]??'Actors';
        if(level==='root'||/^cp_(bank|edit|intent|bass_edit|scale_controls|comp_library|bass_library|setup|overview)/.test(level)||/^approach_bank_|^harm_play_|^pitch_play$|^secondary$|^follower_touch$|^operations_9_16$|^motion_/.test(level))return 'Core';
        if(/diagnostic|status|follower_this|next_harm|follower_root/.test(level))return 'Diagnostics';
        if(/defaults/.test(level))return 'Defaults';
        if(/display|joint_pads/.test(level))return 'Display';
        if(/shared_context|routing/.test(level))return 'Routing';
        if(/motif|rhythm|record/.test(level))return 'Rhythm & Motifs';
        if(/chord|arp/.test(level))return 'Chords & Arp';
        if(/scale|key|transpose|follower_root/.test(level))return 'Harmony & Scales';
        if(/follower|travel|mapping/.test(level))return 'Mapping';
        return name==='Play Setup'?'Core':'Other Settings';
    }
    const groups=():string[]=>[...new Set<string>((ctl.pages??[]).map(group))].filter(name=>name!=='Core');
    let previousMode='';
    const available=():boolean=>{if(previousMode!==mode()){previousMode=mode();category='Core';menu=false;}return enabled()&&groups().length>0;};
    const indices=():number[]=>(ctl.pages??[]).flatMap((page:any,index:number)=>group(page)===category?[index]:[]);
    const modal=():boolean=>!!(ctl.state.peek||ctl.state.pickerOpen||ctl.state.hintLines||ctl.state.menuEntered);
    function close():void {menu=false;jump(Math.max(0,Math.min(ctl.pages.length-1,returnIndex)),{remember:false});category=group(ctl.page);appState.dirty=true;}
    function open():void {returnIndex=ctl.pageIndex;if(category==='Core')coreReturnIndex=returnIndex;const names=groups();choice=Math.max(0,names.indexOf(category));menu=true;appState.dirty=true;}
    ctl.onJog=(delta:number,options:any={})=>{
        if(!available()||modal())return jog(delta,options);
        if(menu){if(delta<0){if(choice===0)close();else choice--;}else if(delta>0)choice=Math.min(groups().length-1,choice+1);appState.dirty=true;return ctl.pageIndex;}
        const pages=indices(),position=pages.indexOf(ctl.pageIndex),next=position+Math.sign(delta);
        if(next>=pages.length&&category==='Core'){open();return ctl.pageIndex;}
        if(next>=0&&next<pages.length)jump(pages[next],{remember:false});
        appState.dirty=true;return ctl.pageIndex;
    };
    ctl.goToPage=(index:number,options:any={})=>{available();const result=jump(index,options);category=group(ctl.page);menu=false;return result;};
    const navigation={
        restore(state:any):void {returnIndex=Number.isInteger(state?.returnIndex)?state.returnIndex:ctl.pageIndex;coreReturnIndex=Number.isInteger(state?.coreReturnIndex)?state.coreReturnIndex:0;if(state&&groups().includes(state.category)){category=state.category;menu=!!state.menu;choice=Math.max(0,groups().indexOf(category));}else if(state?.menu){category='Core';menu=true;choice=Math.max(0,Math.min(groups().length-1,state.choice??0));}},
        active:available,
        isMenu:()=>available()&&menu,
        click():boolean {if(!available()||modal())return false;if(menu){category=groups()[choice]??'Core';menu=false;const first=indices()[0];if(first!==undefined)jump(first,{remember:false});}else open();appState.dirty=true;return true;},
        back():boolean {if(!available()||modal())return false;if(menu){if(category!=='Core'){menu=false;const target=ctl.pages[coreReturnIndex];jump(target&&group(target)==='Core'?coreReturnIndex:0,{remember:false});category='Core';}else close();}else if(category!=='Core')open();else return false;appState.dirty=true;return true;},
        renderMenu():boolean {if(!available()||!menu)return false;renderBrowseView(groups().map(name=>({name:(name===category?'* ':'  ')+name})),choice,mode()+' > Settings','Left:back Click:enter');return true;},
        renderTrail():void {
            if(!available()||menu)return;
            const pages=indices(),position=Math.max(0,pages.indexOf(ctl.pageIndex));
            // Touch overlays keep category-scoped chrome; never expose all HB pages.
            fill_rect(0,8,128,2,0);drawBankBar(position,pages.length);
            if(modal()||ctl.state.touched>=0)return;
            fill_rect(0,0,128,7,0);drawHeader(ctl.page.level==='root'?mode():ctl.pageLabel(),(position+1)+'/'+pages.length);
            fill_rect(0,57,128,7,0);fontPrint(1,58,mode()+' > '+category,1);
        },
        state:()=>({mode:mode(),category,menu,choice,returnIndex,coreReturnIndex,groups:groups(),indices:indices()})
    };
    ctl.hbNavigation=navigation;
    return navigation;
}
