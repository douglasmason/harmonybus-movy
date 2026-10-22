/* A deterministic instrument: received notes produce real stereo PCM. */
#include "host/plugin_api_v1.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef struct { unsigned char held[128]; unsigned phase; int cutoff,attack_cutoff; } Probe;
static void *create(const char *dir,const char *config){(void)dir;(void)config;return calloc(1,sizeof(Probe));}
static void destroy(void *instance){free(instance);}
static void midi(void *instance,const uint8_t *message,int length,int source){
    (void)source;Probe *probe=instance;if(length<3)return;
    int status=message[0]&0xf0,pitch=message[1];if(pitch>=128)return;
    if(status==0x90){probe->held[pitch]=message[2]>0;if(message[2])probe->attack_cutoff=probe->cutoff;}
    if(status==0x80)probe->held[pitch]=0;
    if(status==0xb0&&(pitch==120||pitch==123))memset(probe->held,0,128);
}
static void render(void *instance,int16_t *output,int frames){
    Probe *probe=instance;int voices=0;for(int pitch=0;pitch<128;pitch++)voices+=probe->held[pitch];
    for(int frame=0;frame<frames;frame++)output[2*frame]=output[2*frame+1]=voices?((probe->phase++%100<50)?1000:-1000):0;
}
static void set_param(void *instance,const char *key,const char *value){
    Probe *probe=instance;if(!strcmp(key,"cutoff"))probe->cutoff=atoi(value);
}
static int get_param(void *instance,const char *key,char *buffer,int length){
    Probe *probe=instance;
    if(!strcmp(key,"cutoff"))return snprintf(buffer,length,"%d",probe->cutoff);
    if(!strcmp(key,"attack_cutoff"))return snprintf(buffer,length,"%d",probe->attack_cutoff);
    return 0;
}
static plugin_api_v2_t api={.api_version=2,.create_instance=create,.destroy_instance=destroy,.on_midi=midi,.render_block=render,.set_param=set_param,.get_param=get_param};
plugin_api_v2_t *move_plugin_init_v2(const host_api_v1_t *host){(void)host;return &api;}
