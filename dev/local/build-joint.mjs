import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
/** Reuse upstream host stubs and the real Schwung page controller in the browser. */
export async function buildJoint({root,source,schwung,esbuild}) {
  const environment=await readFile(resolve(source,'browser-test/env.mjs'),'utf8');
  const start=environment.indexOf('export function installEnv()');
  if(start<0)throw new Error('Upstream environment entry changed');
  await writeFile(resolve(root,'build/joint-env.mjs'),
    'const SHADOW_UI_SLOTS=4; const serveModuleLayout=()=>null;\n'+environment.slice(start)+'\ninstallEnv();\n');
  await esbuild.build({entryPoints:[resolve(root,'joint.mjs')],bundle:true,format:'esm',platform:'browser',
    external:['/wasm/*'],outfile:resolve(root,'build/joint.js'),alias:{movy:resolve(source,'src')},
    plugins:[{name:'schwung-shared-pages',setup(build){
      // Only adapt the device boot-ready predicate. The Worker/native owner has
      // already loaded and verified the engine; the UI must not dlopen hardware paths.
      build.onLoad({filter:/\/seq\/engine\.ts$/},async args=>{
        const text=await readFile(args.path,'utf8'),anchor="return bootState === 'ok';";
        if(text.split(anchor).length!==2)throw new Error('Engine readiness adapter anchor changed');
        return {contents:text.replace(anchor,"return globalThis.host_browser_engine_ready?.() === true;"),loader:'ts'};
      });
      build.onResolve({filter:/^\/data\/UserData\/schwung\/shared\//},args=>({path:resolve(schwung,'src/shared',args.path.split('/shared/')[1])}));
    }}]});
}
