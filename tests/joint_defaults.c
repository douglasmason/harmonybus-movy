/* Verify actual generated TS presets through the real HB loader. */
#include <assert.h>
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>
#include "harmonybus.c"
int main(int argc,char **argv){
    assert(argc==5);
    hb_global_shared_t shared={0};g_global_shared=&shared;
    midi_fx_api_v1_t *api=move_midi_fx_init(NULL);
    for(int track=0;track<16;track++){
        int role=track%4;Inst *instance=api->create_instance("",NULL);assert(instance);
        api->set_param(instance,"state",argv[role+1]);
        assert(instance->role==(role==0?0:1));
        assert(instance->render_channel==(role==0?-1:role));
        char value[64];api->get_param(instance,"travel_map",value,sizeof(value));
        assert(!strcmp(value,role==1?"Closest Split":"None"));
        assert(instance->player.config.mode==(role==0?1:role==2?2:0));
        if(role==2)assert(instance->player.config.inversion==8);
        char saved[16384],restored[16384];
        api->set_param(instance,"render_channel","9");
        api->get_param(instance,"state",saved,sizeof(saved));
        api->set_param(instance,"state",saved);api->get_param(instance,"state",restored,sizeof(restored));
        assert(!strcmp(saved,restored));assert(instance->render_channel==8);
        api->destroy_instance(instance);
    }
    puts("All four Joint Play quartets: real HB role, MIDI output, travel, comp voicing and edited-state round trip pass");
}
