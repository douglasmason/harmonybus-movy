/** Device-local persistence and portable backups; engine serialization stays in the Worker. */
const MAX_BYTES=8*1024*1024;
function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('harmonybus-browser',1);request.onupgradeneeded=()=>request.result.createObjectStore('sessions');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function storeSession(value,key='current'){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('sessions',value===undefined?'readonly':'readwrite'),store=tx.objectStore('sessions');const request=value===undefined?store.get(key):store.put(value,key);let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('Device storage failed'));});}finally{db.close();}
}
async function archiveSession(session,key){
 const db=await database();
 try{await new Promise((resolve,reject)=>{
  const tx=db.transaction('sessions','readwrite'),store=tx.objectStore('sessions');
  // Commit both before replacing the engine. A quota/error abort retains the
  // prior current entry and prevents New session from discarding live work.
  const id=Array.from(crypto.getRandomValues(new Uint32Array(4)),value=>value.toString(16).padStart(8,'0')).join('');
  try{store.put(session,key);store.add(session,`${key}:archive:${Date.now()}:${id}`);}
  catch(error){tx.abort();reject(error);return;}
  tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(tx.error??new Error('Could not preserve this session'));
 });}finally{db.close();}
}
async function archivedSessions(key){
 const db=await database(),prefix=key+':archive:';
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('sessions','readonly'),entries=[];
  const request=tx.objectStore('sessions').openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'),'prev');
  request.onsuccess=()=>{const cursor=request.result;if(cursor){entries.push({key:cursor.key,savedAt:cursor.value.savedAt});cursor.continue();}};
  tx.oncomplete=()=>resolve(entries);tx.onabort=tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
export async function mountSessions({sessions,captureUI,restoreUI,disableAudio,isStopped,release,storageKey='current'}){
 const stored=value=>storeSession(value,storageKey);
 const panel=document.querySelector('#sessions');panel.hidden=false;
 const status=document.querySelector('#session-status'),buttons=[...panel.querySelectorAll('button')];
 let busy=false,armed=false,lastSavedPayload=null;
 function message(text){status.textContent=text;}
 async function run(action){if(busy)return;busy=true;const previous=status.textContent;buttons.forEach(button=>button.disabled=true);message('Working…');try{await action();if(status.textContent==='Working…')message(previous);}catch(error){message(`${error.message}. Current session retained.`);}finally{busy=false;buttons.forEach(button=>button.disabled=false);}}
 async function snapshot(){return sessions.save(captureUI());}
 async function save(automatic=false){
  const session=await snapshot(),payload=JSON.stringify(session.payload);
  if(automatic&&payload===lastSavedPayload)return;
  await stored(session);lastSavedPayload=payload;armed=true;
  message(`Saved on this device · ${new Date(session.savedAt).toLocaleTimeString()}`);
  return session;
 }
 async function open(session){
  if(!session)throw new Error('No saved session on this device');
  disableAudio();release();
  const ui=await sessions.open(session);restoreUI(ui);lastSavedPayload=JSON.stringify(session.payload);armed=true;
  message('Session restored · stopped · tap Enable audio to listen');
 }
 const previousSessions=document.querySelector('#session-previous');
 async function refreshPrevious(){
  if(!previousSessions)return;
  previousSessions.replaceChildren(new Option('Choose a previous session',''));
  for(const entry of await archivedSessions(storageKey))previousSessions.add(new Option(new Date(entry.savedAt).toLocaleString(),entry.key));
 }
 async function preserve(){disableAudio();release();await archiveSession(await snapshot(),storageKey);await refreshPrevious();}
 const newButton=document.querySelector('#session-new');
 if(newButton)newButton.onclick=()=>run(async()=>{
  await preserve();
  restoreUI(await sessions.newSession(captureUI()));lastSavedPayload=null;armed=true;
  try{await save();message('New session · previous session preserved below · tap Enable audio to listen');}
  catch(error){message(`New session started, but browser save failed: ${error.message}. Previous session is preserved. Export a backup.`);}
 });
 const openPrevious=document.querySelector('#session-open-previous');
 if(openPrevious)openPrevious.onclick=()=>run(async()=>{
  const key=previousSessions.value;if(!key)throw new Error('Choose a previous session');
  const session=await storeSession(undefined,key);if(!session)throw new Error('Previous session is unavailable');
  await preserve();await open(session);
  try{await stored(session);}catch(error){message(`Session opened, but browser save failed: ${error.message}. Export a backup.`);}
 });
 document.querySelector('#session-save').onclick=()=>run(()=>save());
 document.querySelector('#session-open').onclick=()=>run(async()=>open(await stored()));
 function download(session){
  const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`harmonybus-${new Date().toISOString().replace(/[:.]/g,'-')}.hb-session.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  message('Backup download requested. Check Safari Downloads / Files.');
 }
 document.querySelector('#session-export').onclick=()=>run(async()=>download(await snapshot()));
 document.querySelector('#session-export-saved').onclick=()=>run(async()=>{
  const session=await stored();if(!session)throw new Error('No saved session on this device');download(session);
 });
 const input=document.querySelector('#session-file');
 document.querySelector('#session-import').onclick=()=>input.click();
 input.onchange=()=>run(async()=>{
  const file=input.files[0];input.value='';if(!file)return;
  if(file.size>MAX_BYTES)throw new Error('Session exceeds 8 MB limit');
  const session=JSON.parse(await file.text());await open(session);
  try{await stored(session);}catch(error){message(`Session imported, but device save failed: ${error.message}. Export a backup.`);}
 });
 // Restore before arming autosave so an empty startup can never overwrite a saved performance.
 await run(async()=>{const session=await stored();if(session)await open(session);else{armed=true;message('Autosaves while stopped. Export a backup before clearing browser data.');}await refreshPrevious();});
 const timer=setInterval(()=>{if(armed&&!busy&&isStopped()&&!document.hidden)void run(()=>save(true));},5000);
 document.querySelector('#stop').addEventListener('click',()=>{if(armed&&!busy)void run(()=>save(true));});
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {save,open};
}
