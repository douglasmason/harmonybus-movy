/** Production Song gestures shared by the worker and native diagnostic host. */
import {songLoopHold,songSceneStep,resetSong,NUM_SCENES} from 'movy/seq/song.ts';
import {seqCmdFlush} from 'movy/seq/engine.ts';
import {resetSectionPanel} from 'movy/seq/section-panels.ts';
export function createSongActions(page){
 let building=false;
 return {
  get building(){return building;},count:NUM_SCENES,
  hold(value){building=!!value;songLoopHold(building);},
  scene(index){if(!building||!Number.isInteger(index)||index<0||index>=NUM_SCENES)throw new Error('Begin building a song before choosing a scene');songSceneStep(index*2,true);songSceneStep(index*2,false);seqCmdFlush();},
  edit(){building=false;songLoopHold(false);const controller=page(),index=controller.ctl?.pages.findIndex(item=>item.keys?.includes('joint_section_entry'))??-1;if(index>=0)controller.goToPage(index);},
  reset(){building=false;songLoopHold(false);resetSong();resetSectionPanel();}
 };
}
