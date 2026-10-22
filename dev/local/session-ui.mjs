/** Device-local persistence and portable backups; engine serialization stays in the Worker. */
const MAX_BYTES=8*1024*1024;
function database(){return new Promise((resolve,reject)=>{const request=indexedDB.open('harmonybus-browser',1);request.onupgradeneeded=()=>request.result.createObjectStore('sessions');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
async function stored(value){
 const db=await database();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('sessions',value===undefined?'readonly':'readwrite'),store=tx.objectStore('sessions');const request=value===undefined?store.get('current'):store.put(value,'current');let result;request.onsuccess=()=>{result=request.result;};tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error??new Error('Device storage failed'));});}finally{db.close();}
}
export async function mountSessions({sessions,captureUI,restoreUI,disableAudio,isStopped,release}){
 const panel=document.querySelector('#sessions');panel.hidden=false;
 const status=document.querySelector('#session-status'),buttons=[...panel.querySelectorAll('button')];
 let busy=false,armed=false,lastSavedPayload=null;
 function message(text){status.textContent=text;}
 async function run(action){if(busy)return;busy=true;buttons.forEach(button=>button.disabled=true);try{await action();}catch(error){message(`${error.message}. Current session retained.`);}finally{busy=false;buttons.forEach(button=>button.disabled=false);}}
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
 document.querySelector('#session-save').onclick=()=>run(()=>save());
 document.querySelector('#session-open').onclick=()=>run(async()=>open(await stored()));
 document.querySelector('#session-export').onclick=()=>run(async()=>{
  const session=await snapshot();const url=URL.createObjectURL(new Blob([JSON.stringify(session,null,2)],{type:'application/json'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=`harmonybus-${new Date().toISOString().replace(/[:.]/g,'-')}.hb-session.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  message('Backup download requested. Check Safari Downloads / Files.');
 });
 const input=document.querySelector('#session-file');
 document.querySelector('#session-import').onclick=()=>input.click();
 input.onchange=()=>run(async()=>{
  const file=input.files[0];input.value='';if(!file)return;
  if(file.size>MAX_BYTES)throw new Error('Session exceeds 8 MB limit');
  const session=JSON.parse(await file.text());await open(session);await stored(session);
 });
 // Restore before arming autosave so an empty startup can never overwrite a saved performance.
 await run(async()=>{const session=await stored();if(session)await open(session);else{armed=true;message('Autosaves while stopped. Export a backup before clearing browser data.');}});
 const timer=setInterval(()=>{if(armed&&!busy&&isStopped()&&!document.hidden)void run(()=>save(true));},5000);
 document.querySelector('#stop').addEventListener('click',()=>{if(armed&&!busy)void run(()=>save(true));});
 window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
 return {save,open};
}
