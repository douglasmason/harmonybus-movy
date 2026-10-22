/** Read-only projection of production snapshots. Readers never advance any clock. */
export function observation(params,{epoch,sequence,sampleFrame,build=null}){
 const status=Object.fromEntries(String(params.status??'').split(' ').map(field=>field.split('=')));
 const views={};
 for(const [key,value] of Object.entries(params))if(/(?:harmony_source_snapshot|harmony_snapshot|shared_context_snapshot|field_outputs_view2|^source_preview_|^source_route_|^variation_)/.test(key))views[key]=value;
 return {schema:1,epoch,sequence,build,clock:{sampleFrame,sampleRate:44100,seconds:sampleFrame/44100,transportTick:Number(status.tick??0),ppqn:96,bpm:Number(status.bpm??12000)/100,playing:status.play==='1',recording:status.rec==='1',meter:[4,4]},structure:null,views};
}
export function eventObservation(packet,{epoch,sequence,sampleFrame,operation,key}){
 const trigger=operation==='midi'||key==='surface_events'?'live-input':['step','render'].includes(operation)?'render':'control';
 return {epoch,sequence,packet,sampleFrame,sampleRate:44100,provenance:{stage:'final-output',trigger,performance:trigger==='live-input'?'live':'unresolved'},timePrecision:'request-boundary'};
}
