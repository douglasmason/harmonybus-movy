/** Passive, bounded connection evidence. Never retain addresses, keys or device content. */
const version=value=>typeof value==='string'&&value.length<=80&&/^\d+\.\d+\.\d+(?:-hbclean\.\d+)?$/.test(value)?value:null;
const digest=value=>typeof value==='string'&&/^[a-f0-9]{40}$|^[a-f0-9]{64}$/.test(value)?value:null;
const protocol=value=>['http:','https:'].includes(value)?value:null;
const reasons=new Set(['user','hidden','page-exit','engine-change','browser-failed','reconnect']);
const codes=new Set(['browser-startup-failed','browser-engine-failed','browser-activation-failed','browser-ownership-ready','endpoint-rejected','pairing-key-invalid','mirror-connecting','mirror-screen','mirror-surface','mirror-heartbeat','mirror-unreachable','mirror-lost','mirror-timeout','mirror-invalid','mirror-closed','transport-connecting','transport-ready','transport-requested','transport-sent','transport-rejected','transport-unreachable','transport-lost','transport-timeout','transport-invalid','transport-closed']);
export function createMoveDiagnostics({build={},pageProtocol,secureContext,eventSourceAvailable,webSocketAvailable,now=()=>performance.now(),date=()=>new Date()}={}){
 const started=now();let attempt=0,attemptAt=null,lastFrameAt=null,events=[],endpointProtocol=null;
 let metadata={state:'not-checked'},mirror,transport,ownerFailure=null;
 function clearAttempt(){
  mirror={state:'not-started',screenFrames:0,surfaceFrames:0,heartbeats:0,firstScreenAfterMs:null,lastFailure:null,closedBy:null};
  transport={requested:false,state:'not-started',everReady:false,moduleVersion:null,pendingAction:null,requests:{play:0,stop:0},sent:{play:0,stop:0},lastFailure:null};
  attemptAt=null;lastFrameAt=null;events=[];
 }
 clearAttempt();
 const elapsed=since=>since===null?null:Math.max(0,Math.round(now()-since));
 function event(code,detail={}){
  if(!codes.has(code))return;
  if(code.startsWith('browser-'))ownerFailure=code==='browser-ownership-ready'?null:code;
  else if(code==='mirror-connecting')mirror.state='connecting';
  else if(code==='mirror-screen'){
   mirror.screenFrames++;lastFrameAt=now();mirror.state='connected';
   if(mirror.firstScreenAfterMs===null)mirror.firstScreenAfterMs=elapsed(attemptAt);
   if(mirror.screenFrames>1)return;
  }else if(code==='mirror-surface'){mirror.surfaceFrames++;if(mirror.surfaceFrames>1)return;}
  else if(code==='mirror-heartbeat'){mirror.heartbeats++;return;}
  else if(code==='mirror-closed'){mirror.state='disconnected';mirror.closedBy=reasons.has(detail.reason)?detail.reason:'user';}
  else if(code.startsWith('mirror-')||code==='endpoint-rejected'){mirror.state='error';mirror.lastFailure=code;}
  else if(code==='transport-connecting')transport.state='connecting';
  else if(code==='transport-ready'){transport.state='ready';transport.everReady=true;transport.moduleVersion=version(detail.version);}
  else if(code==='transport-requested'&&['play','stop'].includes(detail.action)){transport.requests[detail.action]++;transport.pendingAction=detail.action;}
  else if(code==='transport-sent'&&['play','stop'].includes(detail.action)&&detail.action===transport.pendingAction){transport.sent[detail.action]++;transport.pendingAction=null;}
  else if(code==='transport-closed'){if(transport.requested)transport.state='disconnected';}
  else if(code!=='transport-sent'){transport.state='error';transport.lastFailure=code;}
  events.push({afterMs:elapsed(started),code});if(events.length>20)events.shift();
 }
 return {
  event,
  reset(){clearAttempt();ownerFailure=null;metadata={state:'not-checked'};endpointProtocol=null;attempt=0;},
  begin(address,paired){
   clearAttempt();attempt++;attemptAt=now();transport.requested=paired===true;
   try{endpointProtocol=protocol(new URL(String(address).includes('://')?address:'http://'+address).protocol);}catch{endpointProtocol=null;}
  },
  metadata(state,info={}){
   metadata={state:['checking','available','unavailable','timeout','not-checked'].includes(state)?state:'not-checked'};
   if(state==='available')Object.assign(metadata,{moduleVersion:version(info.moduleVersion),supportedModule:info.supportedModule===true,stateReadPreservesDirty:info.stateReadPreservesDirty===true,companionTransportEnabled:info.companionTransportEnabled===true});
  },
  snapshot(){return {
   schema:1,type:'hb-movy-connection-report',capturedAt:date().toISOString(),
   build:{integrationVersion:version(build.engineSource?.integrationVersion),hostCommit:digest(build.hostSource?.commit),engineCommit:digest(build.engineSource?.commit),sourceTree:digest(build.hostSource?.tree),wasmSha256:digest(build.wasmSha256),harmonyBusVersion:version(build.harmonyBus?.version)},
   environment:{pageProtocol:protocol(pageProtocol),secureContext:secureContext===true,eventSourceAvailable:eventSourceAvailable===true,webSocketAvailable:webSocketAvailable===true},
   endpointProtocol,ownerFailure,attempt,elapsedMs:elapsed(attemptAt),lastScreenAgeMs:elapsed(lastFrameAt),
   metadata:{...metadata},mirror:{...mirror},transport:{...transport,requests:{...transport.requests},sent:{...transport.sent}},events:events.map(item=>({...item})),
   limits:{hostVersion:null,deviceExecutionConfirmed:false,semanticStateAvailable:false,physicalAcceptanceVerified:false},
  };},
 };
}
