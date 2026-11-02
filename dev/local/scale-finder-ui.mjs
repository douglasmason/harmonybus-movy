/** Browser-only Scale Finding UI; same 12-value evidence as production Move mode.
 * The connected Move mirror is read-only and never acquires browser microphone.
 */
import {createScaleMicrophone,pitchEnergyColor} from './scale-microphone.mjs';
import {createHarmonicFunctionTracker,FUNCTION_LABELS} from './harmonic-function.mjs';

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
 const overrides=document.querySelector('#finder-overrides');
 const resetOverrides=document.querySelector('#finder-reset-overrides');
 const functionPin=document.querySelector('#finder-function-pin');
 const functionUnpin=document.querySelector('#finder-function-unpin');
 const functionClear=document.querySelector('#finder-function-clear');
 const functionSource=document.querySelector('#finder-function-source');
 const functionCurrent=document.querySelector('#finder-function-current');
 const functionTimeline=document.querySelector('#finder-function-timeline');
 const apply=document.querySelector('#finder-apply');
 const clear=document.querySelector('#finder-clear');
 let active=false,started=false,requestedListening=false,listenPending=false,stopPending=false,lastCandidates='',lastChroma='';
 let lastFinder=null,lastFunctionRender='',previousHasEvidence=false;
 const functionTracker=createHarmonicFunctionTracker();
 const renderFunctionTimeline=()=>{
  const state=functionTracker.snapshot();
  const selected=lastFinder?.candidates?.[lastFinder.candidateIndex];
  const pinnable=lastFinder?.layout!=='family'&&selected?.compatible&&
     Array.isArray(selected.notes)&&selected.notes.length===7;
  functionPin.disabled=!pinnable;
  functionUnpin.disabled=!state.pinned;
  functionClear.disabled=!state.segments.length;
  const context=state.pinned?
    'Pinned '+names[state.pinned.tonic]+' '+state.pinned.name+
    ' · browser microphone only'+(requestedListening?' · observing':' · paused; evidence retained'):
    'Select a compatible seven-note scale above and pin it. No tonal center is inferred automatically.';
  const label=state.current?
    FUNCTION_LABELS[state.current.functionName]+
      (state.current.chromatic?' · chromatic evidence':'')+
      ' · '+(state.current.reason==='ambiguous function'?'ambiguous':'advisory'):
    'Unknown · no stable function detected';
  const fingerprint=JSON.stringify([context,label,state.segments]);
  if(fingerprint===lastFunctionRender)return;
  lastFunctionRender=fingerprint;
  functionSource.textContent=context;
  functionCurrent.textContent=label;
  functionTimeline.replaceChildren();
  for(const segment of state.segments){
   const item=document.createElement('span');
   item.className='finder-function-segment';
   item.setAttribute('role','listitem');
   item.dataset.function=segment.functionName;
   item.dataset.chromatic=String(segment.chromatic);
   item.textContent=segment.functionName+(segment.chromatic?' · Chrom':'');
   item.title=FUNCTION_LABELS[segment.functionName]+
     (segment.chromatic?' with out-of-key observations':'')+
     ' · detected duration '+((segment.endMs-segment.startMs)/1000).toFixed(1)+' s';
   functionTimeline.append(item);
  }
 };
 const request=(action,value)=>{if(active&&isBrowser())send({type:'move_scale_mic',action,value});};
 const analyzer=createScaleMicrophone({
  onChroma:values=>{
   if(!active||!requestedListening||!isBrowser())return;
   request('chroma',values);
   if(functionTracker.snapshot().pinned){
    functionTracker.observe(values,Date.now());
    renderFunctionTimeline();
   }
  },
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
 const overrideSelects=[];
 for(let note=0;note<12;note++){
  const label=document.createElement('label');
  const name=document.createElement('span');name.textContent=names[note];
  const select=document.createElement('select');
  select.setAttribute('aria-label',names[note]+' override');
  for(const [value,text] of [['-1','Exclude'],['0','Auto'],['1','Require']])
   select.append(new Option(text,value));
  select.value='0';
  select.onchange=()=>request('override',{note,mode:Number(select.value)});
  label.append(name,select);overrides.append(label);overrideSelects.push(select);
 }
 resetOverrides.onclick=()=>request('resetOverrides',null);
 functionPin.onclick=()=>{
  const selected=lastFinder?.candidates?.[lastFinder?.candidateIndex];
  if(lastFinder?.layout==='family'||!selected?.compatible)return;
  if(functionTracker.pin({tonic:selected.tonic,notes:selected.notes,name:selected.name})){
   lastFunctionRender='';renderFunctionTimeline();
  }
 };
 functionUnpin.onclick=()=>{functionTracker.unpin();lastFunctionRender='';renderFunctionTimeline();};
 functionClear.onclick=()=>{functionTracker.reset();lastFunctionRender='';renderFunctionTimeline();};
 const stop=()=>{
   const wasListening=analyzer.active||requestedListening;
   active=false;requestedListening=false;listenPending=false;stopPending=false;started=false;lastCandidates='';lastChroma='';
   lastFinder=null;previousHasEvidence=false;functionTracker.unpin();lastFunctionRender='';
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
 clear.onclick=()=>{request('clear',null);functionTracker.reset();renderFunctionTimeline();};
 apply.onclick=()=>request('apply',null);
 function update(frame){
   const finder=frame?.scaleFinding;
   if(!isBrowser()||!finder?.active){if(active)stop();return;}
   active=true;panel.hidden=false;lastFinder=finder;
   const hasEvidence=!!(finder.latchedNotes||finder.heldNotes||
     finder.chroma?.some(value=>value>0));
   if(previousHasEvidence&&!hasEvidence){
    // Also catch the physical X button in the browser emulator.
    functionTracker.reset();lastFunctionRender='';
   }
   previousHasEvidence=hasEvidence;
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
    finder.chroma.forEach((value,index)=>{
     const intensity=Math.max(0,Math.min(1,Number(value)||0));
     meters[index].value=intensity;
     meters[index].style.setProperty('--pitch-heat-color',pitchEnergyColor(intensity));
    });
   }
   if(Array.isArray(finder.noteOverrides)&&finder.noteOverrides.length===12){
    for(let note=0;note<12;note++){
     const desired=String(finder.noteOverrides[note]);
     if(overrideSelects[note].value!==desired)overrideSelects[note].value=desired;
    }
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
     !finder.candidates.length||
     (!(finder.latchedNotes||finder.heldNotes||finder.chroma.some(value=>value>0)||
        finder.manualRequired||finder.manualExcluded)&&finder.layout!=='family');
   if(finder.layout==='family')apply.disabled=finder.selectedPad<0;
   renderFunctionTimeline();
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&analyzer.active){
   requestedListening=false;analyzer.stop();request('listen',false);
 }});
 window.addEventListener('pagehide',()=>{if(analyzer.active)analyzer.stop();});
 return {update,stop};
}
