/** Compose canonical web editors; source markup and handlers remain in HarmonyBus. */
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export async function buildWorkspace({root,harmonybus,esbuild}){
 const moduleRoot=resolve(harmonybus,'modules/harmonybus');
 const html=await readFile(resolve(moduleRoot,'web_ui.html'),'utf8');
 const style=html.match(/<style>([\s\S]*?)<\/style>/)?.[1];
 const field=html.slice(html.indexOf('<h1>'),html.indexOf('<details id="choices">'));
 const choices=html.slice(html.indexOf('<details id="choices">'),html.indexOf('<script'));
 if(!style||!field.includes('id="outputs"')||!choices.includes('id="choice-rows"'))throw new Error('HB web editor markup changed');
 // Browser presentation adapter only: preserve canonical handlers and meaningful
 // green output cells/grey markers. CSS variables inherit through the shadow root.
 const colors={'#111713':'--ui-panel','#e9f5ed':'--ui-fg','#a8b9ae':'--ui-muted','#9aac9f':'--ui-muted',
  '#26352b':'--ui-control','#56725e':'--ui-border','#1b241e':'--ui-control','#7aff9c':'--ui-focus'};
 const themedStyle=style.replace(/#[0-9a-f]{3,8}\b/gi,color=>colors[color]?`var(${colors[color]},${color})`:color)
  .replace('color-scheme:dark','color-scheme:var(--ui-scheme,dark)');
 const generated=`import ${JSON.stringify(resolve(moduleRoot,'field-web.js'))};\nimport ${JSON.stringify(resolve(moduleRoot,'choice-web.js'))};
const templates=${JSON.stringify({field,choices})},style=${JSON.stringify(themedStyle.replaceAll(':root',':host').replace('body{','section{'))};
export function mountHBComponent(kind,container,api){
 const root=container.attachShadow({mode:'open'});
 root.innerHTML='<style>'+style+'</style><section>'+templates[kind]+'</section>';
 if(kind==='choices')root.getElementById('choices').open=true;
 const component=(kind==='field'?window.mountHBField:window.mountHBChoices)({root,api});
 return {...component,root};
}`;
 await writeFile(resolve(root,'build/hb-components-entry.mjs'),generated);
 await esbuild.build({entryPoints:[resolve(root,'build/hb-components-entry.mjs')],bundle:true,format:'esm',platform:'browser',outfile:resolve(root,'build/hb-components.mjs')});
}
