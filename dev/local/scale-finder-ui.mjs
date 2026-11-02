/** Browser-only Scale Finding UI; same 12-value evidence as production Move mode.
 * The connected Move mirror is read-only and never acquires browser microphone.
 */
import {createScaleMicrophone} from './scale-microphone.mjs';

const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];

export function mountScaleFinderUI({send,isBrowser}){
 const panel=document.querySelector('#scale-finding-browser');
 const layout=document.querySelector('#finder-layout');
 const tonic=document.querySelector('#finder-tonic');
 const listen=document.querySelector('#finder-listen');
 const windowSlider=document.querySelector('#finder-window');
 const windowLabel=document.querySelector('#finder-window-value');
 const status=document.querySelector('#finder-mic-status');
 const chroma=document.querySelector('#finder-chroma');
 const candidates=document.querySelector('#finder-candidates');
 const apply=document.querySelector('#finder-apply');
 const clear=document.querySelector('#finder-clear');
 let active=false,started=false,requestedListening=false,listenPending=false,stopPending=false,lastCandidates='',lastChroma='';
 const request=(action,value)=>{if(active&&isBrowser())send({type:'move_scale_mic',action,value});};
 const analyzer=createScaleMicrophone({
  onChroma:values=>{if(active&&requestedListening&&isBrowser())request('chroma',values);},
  onStatus:message=>{status.textContent=message;}
 });
 for(let index=0;index<12;index++){
  const item=document.createElement('div');
  const name=document.createElement('span');name.textContent=names[index];
  const level=document.createElement('meter');level.min=0;level.max=1;level.value=0;
  level.setAttribute('aria-label',names[index]+' intensity');
  item.append(name,level);chroma.append(item);
  const option=new Option(names[index],String(index));tonic.append(option);
 }
 const meters=[...chroma.querySelectorAll('meter')];
 const stop=()=>{
   const wasListening=analyzer.active||requestedListening;
   active=false;requestedListening=false;listenPending=false;stopPending=false;started=false;lastCandidates='';lastChroma='';
   panel.hidden=true;
   if(analyzer.active)analyzer.stop();
   if(wasListening&&isBrowser())send({type:'move_scale_mic',action:'listen',value:false});
 };
 async function startMicrophone(){
   if(!active||!isBrowser())return;
   if(!analyzer.supported()){
    status.textContent='This browser needs HTTPS and microphone permission';
    request('available',false);return;
   }
   const success=await analyzer.start();
   if(!active||!isBrowser()){
    if(analyzer.active)analyzer.stop();return;
   }
   if(success){requestedListening=true;listenPending=true;request('available',true);request('listen',true);}
   else{requestedListening=false;listenPending=false;request('listen',false);request('available',false);}
 }
 listen.onclick=()=>{
   if(analyzer.active||requestedListening){
    requestedListening=false;listenPending=false;stopPending=true;analyzer.stop();request('listen',false);
   }else{void startMicrophone();}
 };
 layout.onchange=()=>request('layout',layout.value);
 tonic.onchange=()=>request('tonic',Number(tonic.value));
 windowSlider.oninput=()=>{
   windowLabel.textContent=(Number(windowSlider.value)/1000).toFixed(2)+' s';
   request('window',Number(windowSlider.value));
 };
 clear.onclick=()=>request('clear',null);
 apply.onclick=()=>request('apply',null);
 function update(frame){
   const finder=frame?.scaleFinding;
   if(!isBrowser()||!finder?.active){if(active)stop();return;}
   active=true;panel.hidden=false;
   if(!started){
    started=true;status.textContent='Microphone stopped · press Sample to listen';
    request('available',analyzer.supported());
   }
   const shouldListen=!!finder.listening;
   if(shouldListen)listenPending=false;
   else stopPending=false;
   if(shouldListen&&!stopPending&&!analyzer.active&&!requestedListening){
    // Physical/simulated Sample was pressed. Browser may ask for permission;
    // the explicit on-page Listen button works on stricter mobile browsers.
    void startMicrophone();
   }else if(!shouldListen&&analyzer.active&&!requestedListening&&!listenPending){
    analyzer.stop();
   }else if(!shouldListen&&analyzer.active&&requestedListening&&!listenPending){
    requestedListening=false;analyzer.stop();
   }
   listen.setAttribute('aria-pressed',String(shouldListen));
   listen.textContent=shouldListen?'Stop listening (Sample)':'Start listening (Sample)';
   if(layout.value!==finder.layout)layout.value=finder.layout;
   if(tonic.value!==String(finder.tonic))tonic.value=String(finder.tonic);
   if(Number(windowSlider.value)!==finder.windowMs)windowSlider.value=String(finder.windowMs);
   const shownWindow=(finder.windowMs/1000).toFixed(2)+' s';
   if(windowLabel.textContent!==shownWindow)windowLabel.textContent=shownWindow;
   const chromaKey=JSON.stringify(finder.chroma);
   if(chromaKey!==lastChroma){
    lastChroma=chromaKey;
    finder.chroma.forEach((value,index)=>{meters[index].value=value;});
   }
   const options=JSON.stringify([finder.candidates,finder.candidateIndex]);
   if(options!==lastCandidates){
    lastCandidates=options;candidates.replaceChildren();
    for(const [index,candidate] of finder.candidates.entries()){
     const button=document.createElement('button');button.type='button';
     button.dataset.selected=String(index===finder.candidateIndex);
     button.textContent=names[candidate.tonic]+' '+candidate.name+
       (candidate.compatible?'':' · extra notes');
     button.title='Evidence score '+candidate.score+
       (candidate.compatible?' · compatible':' · conflicts '+candidate.conflicts);
     button.onclick=()=>request('candidate',index);
     candidates.append(button);
    }
   }
   apply.disabled=!finder.candidates[finder.candidateIndex]?.compatible||
     !finder.candidates.length||(!(finder.latchedNotes||finder.heldNotes||finder.chroma.some(value=>value>0))&&finder.layout!=='family');
   if(finder.layout==='family')apply.disabled=finder.selectedPad<0;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&analyzer.active){
   requestedListening=false;analyzer.stop();request('listen',false);
 }});
 window.addEventListener('pagehide',()=>{if(analyzer.active)analyzer.stop();});
 return {update,stop};
}
