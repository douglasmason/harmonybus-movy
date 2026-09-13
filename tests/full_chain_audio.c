/* Load production Movy -> production chain -> production HB -> PCM probe.
 * Host callbacks model the USB packet contract, not Move's proprietary synth.
 * Each executable run gets fresh dlopen globals, as a device module reload does.
 */
#include "host/plugin_api_v1.h"
#include <assert.h>
#include <dlfcn.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
static int sent_on,sent_off,rejected;
static unsigned rendered_mask;
static double beat;
static void log_message(const char *message){fprintf(stderr,"%s\n",message);}
static float bpm(void){return 120;}
static double position(void){return beat;}
static int clock_status(void){return 0;}
static int send_packet(const uint8_t *packet,int length){
    if(length!=4){rejected++;return 0;}
    if((packet[1]&0xf0)==0x90&&packet[3]){sent_on++;rendered_mask|=1u<<(packet[2]%12);}
    if((packet[1]&0xf0)==0x80||((packet[1]&0xf0)==0x90&&!packet[3]))sent_off++;
    return 4;
}
static host_api_v1_t host={.api_version=1,.sample_rate=44100,.frames_per_block=128,
    .log=log_message,.midi_send_internal=send_packet,.midi_inject_to_move=send_packet,
    .get_bpm=bpm,.get_beat_position=position,.get_clock_status=clock_status};
static const plugin_api_v2_t *api;
static void *instance;
static void set(const char *key,const char *value){api->set_param(instance,key,value);}
static long render(int blocks){
    long energy=0;int16_t output[256];
    for(int block=0;block<blocks;block++){
        memset(output,0,sizeof(output));api->render_block(instance,output,128);
        beat+=256.0/44100.0;
        for(int sample=0;sample<256;sample++)energy+=abs(output[sample]);
    }
    return energy;
}
int main(int argc,char **argv){
    assert(argc==4);
    void *handle=dlopen(argv[1],RTLD_NOW|RTLD_LOCAL);
    if(!handle){fprintf(stderr,"%s\n",dlerror());return 2;}
    plugin_api_v2_t *(*init)(const host_api_v1_t*)=dlsym(handle,"move_plugin_init_v2");assert(init);
    api=init(&host);instance=api->create_instance(argv[2],NULL);assert(instance);
    char parameter[1024];snprintf(parameter,sizeof(parameter),"%s/chain|%s/movy",argv[2],argv[2]);
    set("chain_host",parameter);set("chtracks","1");
    /* Populate all sixteen chains; shared-module initialization is part of
       this test, unlike the previous isolated HB fixture. */
    for(int track=0;track<16;track++){
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:module",track);set(parameter,"harmonybus");
        snprintf(parameter,sizeof(parameter),"ch%d:synth:module",track);set(parameter,"probe");
    }
    render(64);
    for(int track=0;track<16;track++){
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:role",track);set(parameter,track%4==0?"Conductor":"Follower");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:source_channel",track);set(parameter,"1");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:render_channel",track);set(parameter,"4");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:boundary_buffer_ms",track);set(parameter,"0 ms");
        snprintf(parameter,sizeof(parameter),"ch%d:mix",track);set(parameter,"1,0,1,0,0");
    }
    /* Physical pads 68,69,70 map to C-E-G. */
    for(int mode=0;mode<2;mode++)for(int track=0;track<2;track++){
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:chord_mode",track);set(parameter,mode?"Scale Root":"Off");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:follower_scale",track);set(parameter,"Major");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:follower_root_policy",track);set(parameter,"Explicit");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:follower_explicit_root",track);set(parameter,"C");
        snprintf(parameter,sizeof(parameter),"ch%d:mix",track);set(parameter,"1,0,0,0,0");
        char mapping[256];int used=snprintf(mapping,sizeof(mapping),"%d",track);
        for(int pad=0;pad<32;pad++)used+=snprintf(mapping+used,sizeof(mapping)-used,",%d",pad==1?64:pad==2?67:60);
        set("padmap",mapping);render(256);sent_on=sent_off=rejected=0;
        for(int pad=68;pad<(mode?69:71);pad++){uint8_t message[]={0x90,(uint8_t)pad,100};api->on_midi(instance,message,3,0);}
        long energy=render(64);
        for(int pad=68;pad<(mode?69:71);pad++){uint8_t message[]={0x80,(uint8_t)pad,0};api->on_midi(instance,message,3,0);}
        render(64);long tail=render(64);
        printf("%s mode=%d track=%d local_pcm=%ld routed_on=%d routed_off=%d rejected=%d tail=%ld\n",argv[3],mode,track,energy,sent_on,sent_off,rejected,tail);fflush(stdout);
        assert(energy>0);assert(sent_on>=3&&sent_off>=3&&rejected==0);assert(tail==0);
        snprintf(parameter,sizeof(parameter),"ch%d:mix",track);set(parameter,"1,0,1,0,0");
    }
    set("ch0:mix","1,0,0,0,0");set("ch1:mix","1,0,1,0,0");
    set("padmap","0,60,64,67,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60");
    set("ch0:midi_fx1:master_transpose","D");render(32);
    set("cmd","link 0;rec 0");render(800);
    uint8_t down[]={0x90,68,100},up[]={0x80,68,0};
    api->on_midi(instance,down,3,0);set("cmd","non 0 60 100");render(32);
    api->on_midi(instance,up,3,0);set("cmd","nof 0 60");render(16);
    set("cmd","stop");render(16);
    char state[32768];api->get_param(instance,"state",state,sizeof(state));
    char *clip=strstr(state,"cl 0 0 ");assert(clip);
    char *end=strchr(clip,'\n');assert(end);*end=0;
    printf("recorded %s\n",clip);
    int steps,start,consumed=0;
    assert(sscanf(clip,"cl 0 0 %d %d %n",&steps,&start,&consumed)==2);
    int count=0;unsigned pitches=0;char *voice=clip+consumed;
    while(*voice){
        int tick,gate,pitch,velocity,step,rendered=0;
        assert(sscanf(voice,"%d:%d:%d:%d:%d:%d",&tick,&gate,&pitch,&velocity,&step,&rendered)==6);
        assert(rendered==1);pitches|=1u<<(pitch%12);count++;
        voice=strchr(voice,';');if(!voice)break;voice++;
    }
    assert(count==3&&pitches==((1u<<0)|(1u<<4)|(1u<<7)));
    // A changed chord form must not regenerate the three saved voices on replay.
    set("ch0:midi_fx1:chord_form","Ninth");
    set("ch0:midi_fx1:master_transpose","F");render(32);
    sent_on=sent_off=rejected=0;rendered_mask=0;
    set("cmd","play");long replay=render(345);set("cmd","stop");render(32);
    printf("replay local_pcm=%ld routed_on=%d routed_off=%d rejected=%d\n",replay,sent_on,sent_off,rejected);
    assert(replay>0&&sent_on==3&&sent_off==3&&rejected==0);
    assert(rendered_mask==((1u<<5)|(1u<<9)|(1u<<0)));
    // Changing master again moves the same recorded triad, without regeneration.
    set("ch0:midi_fx1:master_transpose","D");render(16);rendered_mask=0;
    set("cmd","play");render(345);set("cmd","stop");render(32);
    assert(rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)));
    // Real hosted HB subscribers: audible only from the receiver chain,
    // while the original cable-2 host callback still receives all notes.
    for(int t=0;t<16;t++){snprintf(parameter,sizeof(parameter),"ch%d:mix",t);set(parameter,"1,0,1,0,0");}
    set("ch0:midi_fx1:chord_form","Triad");set("ch0:midi_fx1:render_channel","2");
    set("ch12:midi_fx1:role","Receiver");set("ch12:midi_fx1:receive_channel","2");
    set("ch12:mix","1,0,0,0,0");render(32);
    sent_on=sent_off=rejected=0;
    api->on_midi(instance,down,3,0);long received=render(32);
    api->on_midi(instance,up,3,0);render(32);long receiver_tail=render(32);
    printf("receiver local_pcm=%ld routed_on=%d routed_off=%d tail=%ld\n",received,sent_on,sent_off,receiver_tail);
    assert(received>0&&sent_on==3&&sent_off==3&&receiver_tail==0);
    set("ch12:midi_fx1:receive_channel","3");render(16);sent_on=sent_off=0;
    api->on_midi(instance,down,3,0);assert(render(32)==0);
    api->on_midi(instance,up,3,0);render(32);assert(sent_on==3&&sent_off==3);
    api->destroy_instance(instance);return 0;
}
