/** Apply host-only portability changes to disposable source exports. */
import {readFile,writeFile} from 'node:fs/promises';
const [movy,schwung]=process.argv.slice(2);
async function replace(path,before,after){const text=await readFile(path,'utf8');if(text.split(before).length!==2)throw new Error(`Port anchor changed: ${path}: ${before}`);await writeFile(path,text.replace(before,after));}
await replace(`${movy}/crates/movy-dsp/Cargo.toml`,'["cdylib", "rlib"]','["staticlib", "rlib"]');
await replace(`${movy}/crates/movy-dsp/src/chain_slots.rs`,'self.pool = Some(RenderPool::new(LANES - 1, RENDER_SLOTS));','// Static browser host uses the existing serial fallback; no worker pool.');
for(const name of ['dlopen','dlsym','dlerror'])await replace(`${movy}/crates/movy-dsp/src/chain_host.rs`,`    fn ${name}(`,`    #[link_name = "browser_${name}"]\n    fn ${name}(`);
await replace(`${schwung}/src/host/plugin_api_v1.h`,'offsetof(host_api_v1_t, reserved) == 120','offsetof(host_api_v1_t, reserved) == (sizeof(void *) == 4 ? 68 : 120)');
const library=`${movy}/crates/movy-dsp/src/lib.rs`;
await writeFile(library,(await readFile(library,'utf8'))+`\n// Browser host verifies the C/Rust ABI before dereferencing callbacks.\n#[no_mangle]\npub extern "C" fn browser_abi(index: u32) -> usize {\n match index {\n  0 => std::mem::size_of::<ffi::host_api_v1_t>(),\n  1 => std::mem::offset_of!(ffi::host_api_v1_t, reserved),\n  2 => std::mem::size_of::<ffi::plugin_api_v2_t>(),\n  3 => std::mem::offset_of!(ffi::plugin_api_v2_t, render_block),\n  _ => 0,\n }\n}\n`);
await replace(`${schwung}/src/modules/chain/dsp/chain_host.c`,'malloc_trim(0);','/* Emscripten owns heap growth; there is no glibc heap to trim. */');
// OS scheduling has no browser equivalent; worker effects are not registered.
await replace(`${schwung}/src/modules/chain/dsp/chain_bus.c`,'sched_setscheduler(0, SCHED_OTHER, &sp);','(void)sp;');
await replace(`${schwung}/src/modules/chain/dsp/chain_bus.c`,'sched_setaffinity(0, sizeof(set), &set);','(void)set;');
