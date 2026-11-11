/** One generator workspace and one active poller in Remote UI and standalone. */
import {mountCloud} from './cloud-web.mjs';
import {mountEuclidean} from './euclidean-web.mjs';
export function mountGenerators({root,api}){
 root.innerHTML=`<style>:host{font:14px system-ui;color:var(--ui-fg,#eee)}nav{display:flex;gap:8px;margin-bottom:14px}nav button{font:inherit;color:inherit;background:var(--ui-control,#252528);border:1px solid var(--ui-border,#555);border-radius:7px;padding:10px 16px}nav button[aria-pressed=true]{border-color:var(--ui-focus,#e74b50);box-shadow:inset 0 0 0 1px var(--ui-focus,#e74b50)}[hidden]{display:none!important}</style><nav aria-label="Generator editors"><button data-editor="cloud" aria-pressed="true">Cloud</button><button data-editor="euclidean" aria-pressed="false">Euclidean</button></nav><section data-editor-panel="cloud"></section><section data-editor-panel="euclidean" hidden></section>`;
 const panels=new Map([...root.querySelectorAll('[data-editor-panel]')].map(element=>[element.dataset.editorPanel,element]));
 const components=new Map([['cloud',mountCloud({root:panels.get('cloud').attachShadow({mode:'open'}),api})],['euclidean',mountEuclidean({root:panels.get('euclidean').attachShadow({mode:'open'}),api})]]);
 let active='cloud',suspended=false;components.get('euclidean').suspend();
 for(const button of root.querySelectorAll('[data-editor]'))button.onclick=()=>{
  if(button.dataset.editor===active)return;
  components.get(active).suspend();active=button.dataset.editor;
  for(const [name,panel] of panels)panel.hidden=name!==active;
  for(const tab of root.querySelectorAll('[data-editor]'))tab.setAttribute('aria-pressed',String(tab.dataset.editor===active));
  if(!suspended)components.get(active).resume();
 };
 return {padGesture:(...args)=>!suspended&&active==='cloud'&&components.get('cloud').padGesture(...args),release(){for(const component of components.values())component.release();},isHeld:()=>components.get(active).isHeld(),suspend(){suspended=true;for(const component of components.values())component.suspend();},resume(){suspended=false;components.get(active).resume();},dispose(){for(const component of components.values())component.dispose();}};
}
