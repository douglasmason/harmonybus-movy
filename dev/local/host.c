/* Development host: all processor calls execute on this one stdin-driven thread. */
#include "host/plugin_api_v1.h"
#include <dlfcn.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static double position;
static int event_count, overflow;
static uint8_t events[8192][4];
static const plugin_api_v2_t *api;
static void *instance;
static float tempo(void) { return 120.0f; }
static double beat(void) { return position; }
static int clock_status(void) { return 0; }
static void log_message(const char *message) { fprintf(stderr, "%s\n", message); }
static int capture(const uint8_t *packet, int length) {
    if (length != 4) return 0;
    if (event_count < 8192) memcpy(events[event_count++], packet, 4);
    else overflow++;
    return length;
}
static host_api_v1_t host = {.api_version=1,.sample_rate=44100,.frames_per_block=128,
    .log=log_message,.midi_send_internal=capture,.midi_send_external=capture,
    .midi_inject_to_move=capture,.get_bpm=tempo,.get_beat_position=beat,.get_clock_status=clock_status};
static void set(const char *key, const char *value) { api->set_param(instance,key,value); }
static void advance(int blocks) {
    int16_t output[256];
    for (int block=0; block<blocks; block++) {
        memset(output,0,sizeof(output)); api->render_block(instance,output,128);
        position += 128.0 / 44100.0 * 2.0;
    }
}
static void quote(const char *value) {
    putchar('"');
    for (const unsigned char *cursor=(const unsigned char *)value; *cursor; cursor++) {
        if (*cursor=='"' || *cursor=='\\') { putchar('\\'); putchar(*cursor); }
        else if (*cursor<32) printf("\\u%04x",*cursor);
        else putchar(*cursor);
    }
    putchar('"');
}
static void param(const char *key) {
    char value[32768]={0}; int length=api->get_param(instance,key,value,sizeof(value));
    if(length<0 || length>=(int)sizeof(value)) printf("null"); else quote(value);
}
static void snapshot(void) {
    const char *keys[]={"role","version","travel_map","master_transpose","harmony_snapshot","follower_snapshot","shared_context_snapshot","pad_view"};
    putchar('{');
    for(int track=0;track<4;track++) for(size_t index=0;index<sizeof(keys)/sizeof(*keys);index++) {
        char key[128];snprintf(key,sizeof(key),"ch%d:midi_fx1:%s",track,keys[index]);
        if(track||index) putchar(','); quote(key);putchar(':');param(key);
    }
    printf(",\"status\":");param("status");putchar('}');
}
int main(int count,char **arguments) {
    if(count!=3) {fprintf(stderr,"usage: host libmovy_dsp.so module-root\n");return 2;}
    void *library=dlopen(arguments[1],RTLD_NOW|RTLD_LOCAL);
    if(!library) {fprintf(stderr,"%s\n",dlerror());return 2;}
    plugin_api_v2_t *(*initialize)(const host_api_v1_t *)=dlsym(library,"move_plugin_init_v2");
    if(!initialize || !(api=initialize(&host)) || !(instance=api->create_instance(arguments[2],NULL))) return 2;
    char key[128],value[8192];
    snprintf(value,sizeof(value),"%s/chain|%s/movy",arguments[2],arguments[2]);
    set("chain_host",value);set("chtracks","1");
    for(int track=0;track<16;track++) {
        snprintf(key,sizeof(key),"ch%d:midi_fx1:module",track);set(key,"harmonybus");
        snprintf(key,sizeof(key),"ch%d:synth:module",track);set(key,"probe");
    }
    advance(64);
    for(int track=0;track<16;track++) {
        const char *names[]={"role","receive_channel","render_channel","boundary_buffer_ms","follower_root_policy","follower_explicit_root","follower_scale","chord_mode","quant_timing","travel_map","content_map","chromatic_map"};
        const char *values[]={track%4==0?"Conductor":"Follower","Off",(const char*[]){"1","2","3","4"}[track%4],"0 ms","Explicit","C","Major","Off","Off","Closest","Chord","Off"};
        for(size_t index=0;index<sizeof(names)/sizeof(*names);index++) {
            snprintf(key,sizeof(key),"ch%d:midi_fx1:%s",track,names[index]);set(key,values[index]);
        }
        snprintf(key,sizeof(key),"ch%d:mix",track);set(key,"1,0,0,0,0");
    }
    advance(16); position=0;event_count=0;
    char line[16384];
    while(fgets(line,sizeof(line),stdin)) {
        line[strcspn(line,"\r\n")]=0;
        char *argument=strchr(line,'\t');if(argument)*argument++=0;
        int valid=1;
        if(!strcmp(line,"set") && argument) {
            char *setting=strchr(argument,'\t');if(setting){*setting++=0;set(argument,setting);}else valid=0;
        } else if(!strcmp(line,"step") && argument) {int blocks=atoi(argument);if(blocks<0||blocks>4096)valid=0;else advance(blocks);}
        else if(strcmp(line,"snapshot") && strcmp(line,"get") && strcmp(line,"read_many"))valid=0;
        printf("{\"ok\":%s,\"beat\":%.12f,\"value\":",valid?"true":"false",position);
        if(!strcmp(line,"read_many")) {
            putchar('{');int first=1;char *key=argument?strtok(argument,","):NULL;
            while(key){if(!first)putchar(',');first=0;quote(key);putchar(':');param(key);key=strtok(NULL,",");}putchar('}');
        } else if(!strcmp(line,"get")&&argument)param(argument);else if(!strcmp(line,"snapshot"))snapshot();else printf("null");
        printf(",\"events\":[");
        for(int index=0;index<event_count;index++){if(index)putchar(',');printf("[%u,%u,%u,%u]",events[index][0],events[index][1],events[index][2],events[index][3]);}
        printf("],\"overflow\":%d}\n",overflow);fflush(stdout);event_count=overflow=0;
    }
    api->destroy_instance(instance);dlclose(library);return 0;
}
