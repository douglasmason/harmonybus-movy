/* A fixed registry for compiled-in production modules. No ELF loading in Wasm. */
#include <string.h>
#include "chain_internal.h"
extern plugin_api_v2_t *browser_chain_init(const host_api_v1_t *);
extern plugin_api_v2_t *browser_probe_init(const host_api_v1_t *);
extern midi_fx_api_v1_t *move_midi_fx_init(const host_api_v1_t *);
extern void chain_set_external_fx_mode(void *,int);
extern void chain_process_fx(void *,int16_t *,int);
extern int chain_fx_requires_continuous(void *);
extern int chain_take_midi_tick_wake(void *);
static int chain_handle,hb_handle,probe_handle;
void *browser_dlopen(const char *path,int flags){
    (void)flags;if(!path)return NULL;
    const char *names[]={"/movy/chain-dsp.so","/chain/dsp.so","/midi_fx/harmonybus/dsp.so","/sound_generators/probe/dsp.so"};
    for(int index=0;index<4;index++){
        size_t length=strlen(path),suffix=strlen(names[index]);
        if(length>=suffix&&!strcmp(path+length-suffix,names[index]))return index<2?&chain_handle:index==2?&hb_handle:&probe_handle;
    }
    return NULL;
}
void *browser_dlsym(void *handle,const char *name){
    if(!name)return NULL;
    if(handle==&hb_handle&&!strcmp(name,"move_midi_fx_init"))return move_midi_fx_init;
    if(handle==&probe_handle&&!strcmp(name,"move_plugin_init_v2"))return browser_probe_init;
    if(handle!=&chain_handle)return NULL;
    if(!strcmp(name,"move_plugin_init_v2"))return browser_chain_init;
#define ENTRY(symbol) if(!strcmp(name,#symbol))return symbol
    ENTRY(chain_set_external_fx_mode);
    ENTRY(chain_process_fx);
    ENTRY(chain_fx_requires_continuous);
    ENTRY(chain_take_midi_tick_wake);
#undef ENTRY
    return NULL;
}
int browser_dlclose(void *handle){(void)handle;return 0;}
char *browser_dlerror(void){return "Module or symbol is not in the browser static registry";}
