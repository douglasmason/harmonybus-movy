/* Minimal boundary around the production Movy plugin API. */
#include "host/plugin_api_v1.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
extern size_t browser_abi(unsigned);
extern plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *);
static const plugin_api_v2_t *api;
static void *instance;
static double position;
static uint32_t events[8192];
static int count,overflow;
static float tempo(void){return 120;}
static double beat(void){return position;}
static int clock_status(void){return 0;}
static int capture(const uint8_t *packet,int length){
    if(length!=4)return 0;
    if(count<8192)events[count++]=((uint32_t)packet[0]<<24)|((uint32_t)packet[1]<<16)|((uint32_t)packet[2]<<8)|packet[3];else overflow++;
    return length;
}
static host_api_v1_t host={.api_version=1,.sample_rate=44100,.frames_per_block=128,.midi_send_internal=capture,.midi_send_external=capture,.midi_inject_to_move=capture,.get_bpm=tempo,.get_beat_position=beat,.get_clock_status=clock_status};
void full_clear(void){count=overflow=0;}
int full_count(void){return count;}
int full_overflow(void){return overflow;}
uint32_t full_event(int index){return index>=0&&index<count?events[index]:0;}
void full_set(const char *key,const char *value){api->set_param(instance,key,value);}
const char *full_get(const char *key){static char value[1048576];value[0]=0;int length=api->get_param(instance,key,value,sizeof(value));return length<0||length>=sizeof(value)?NULL:value;}
void full_step(int blocks){
    if(blocks<0||blocks>4096)return;
    int16_t output[256];
    for(int block=0;block<blocks;block++){memset(output,0,sizeof(output));api->render_block(instance,output,128);position+=128.0/44100.0*2.0;}
}
int full_midi(int status,int note,int velocity){
    if((status!=128&&status!=144&&status!=160)||note<68||note>99||velocity<0||velocity>127)return -1;
    uint8_t message[]={(uint8_t)status,(uint8_t)note,(uint8_t)velocity};api->on_midi(instance,message,3,0);return 0;
}
int full_init(const char *root){
    if(instance)return -1;
    if(browser_abi(0)!=sizeof(host_api_v1_t)||browser_abi(1)!=offsetof(host_api_v1_t,reserved)||browser_abi(2)!=sizeof(plugin_api_v2_t)||browser_abi(3)!=offsetof(plugin_api_v2_t,render_block))return -2;
    api=move_plugin_init_v2(&host);if(!api||!(instance=api->create_instance(root,NULL)))return -1;
    char key[128],value[4096];snprintf(value,sizeof(value),"%s/chain|%s/movy",root,root);
    full_set("chain_host",value);full_set("chtracks","1");full_set("cmd","link 0");
    for(int track=0;track<16;track++){
        snprintf(key,sizeof(key),"ch%d:midi_fx1:module",track);full_set(key,"harmonybus");
        snprintf(key,sizeof(key),"ch%d:synth:module",track);full_set(key,"probe");
    }
    full_step(64);
    for(int track=0;track<16;track++){
        const char *names[]={"role","receive_channel","render_channel","boundary_buffer_ms","follower_root_policy","follower_explicit_root","follower_scale","chord_mode","quant_timing","travel_map","content_map","chromatic_map"};
        const char *values[]={track%4==0?"Conductor":"Follower","Off",(const char*[]){"1","2","3","4"}[track%4],"0 ms","Explicit","C","Major","Off","Off","Closest","Chord","Off"};
        for(size_t index=0;index<sizeof(names)/sizeof(*names);index++){snprintf(key,sizeof(key),"ch%d:midi_fx1:%s",track,names[index]);full_set(key,values[index]);}
        snprintf(key,sizeof(key),"ch%d:mix",track);full_set(key,"1,0,0,0,0");
    }
    full_step(16);position=0;full_clear();return 0;
}
