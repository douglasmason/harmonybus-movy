/* Browser host boundary for the unchanged production HB MIDI module. */
#include <stdint.h>
#include <stdlib.h>
#include <stdio.h>
#include <string.h>
#include <sys/types.h>
#include "schwung_midi_api.h"
#include "hb-host.h"
extern midi_fx_api_v1_t *move_midi_fx_init(const host_api_v1_t *);
static const midi_fx_api_v1_t *api;
static void *instances[4];
static uint8_t output[256][3];
static int lengths[256], count;
static uint32_t captured[512];
static int capture(const uint8_t *packet, int length) {
    if(length!=4 || count>=512)return 0;
    captured[count++]=((uint32_t)packet[1]<<16)|((uint32_t)packet[2]<<8)|packet[3];
    return 4;
}
static double position;
static double beat(void){return position;}
static float tempo(void){return 120.0f;}
static host_api_v1_t host={.api_version=1,.sample_rate=44100,.frames_per_block=128,.midi_inject_to_move=capture,.get_beat_position=beat,.get_bpm=tempo};
static void append(int returned) {
    for(int index=0;index<returned&&count<512;index++)if(lengths[index]==3)
        captured[count++]=((uint32_t)output[index][0]<<16)|((uint32_t)output[index][1]<<8)|output[index][2];
}
/* Only HB's global settings mapping is present. Hardware monitor is absent.
   One module memory owns all instances, so they share this same allocation. */
static void *settings;
static size_t settings_size;
int browser_shm_open(const char *name, int flags, unsigned mode) {
    (void)flags; (void)mode;
    return strstr(name,"global") ? 7 : -1;
}
int browser_ftruncate(int descriptor, off_t size) {
    if (descriptor != 7 || size <= 0) return -1;
    if (settings) return settings_size == (size_t)size ? 0 : -1;
    settings = calloc(1, (size_t)size); settings_size = (size_t)size;
    return settings ? 0 : -1;
}
void *browser_mmap(void *address, size_t size, int prot, int flags, int descriptor, off_t offset) {
    (void)address; (void)prot; (void)flags;
    return descriptor == 7 && !offset && size == settings_size ? settings : (void *)-1;
}
int browser_close(int descriptor) { return descriptor == 7 ? 0 : -1; }
void hb_set(int track, const char *key, const char *value) {
    if (track >= 0 && track < 4) api->set_param(instances[track], key, value);
}
const char *hb_get(int track,const char *key){static char value[32768];value[0]=0;if(track>=0&&track<4)api->get_param(instances[track],key,value,sizeof(value));return value;}
void hb_init(void) {
    if (api) return;
    api = move_midi_fx_init(&host);
    for (int track=0; track<4; track++) {
        instances[track]=api->create_instance("/harmonybus",NULL);
        hb_set(track,"role",track ? "Follower":"Conductor");
        hb_set(track,"receive_channel","1");
        hb_set(track,"render_channel",(const char *[]){"1","2","3","4"}[track]);
        hb_set(track,"boundary_buffer_ms","0 ms");
        hb_set(track,"follower_root_policy","Explicit"); hb_set(track,"follower_explicit_root","C");
        hb_set(track,"follower_scale","Major"); hb_set(track,"chord_mode","Off");
        hb_set(track,"quant_timing","Off"); hb_set(track,"travel_map","Closest Chord Tone");
        hb_set(track,"content_map","Chord"); hb_set(track,"chromatic_map","Off");
    }
}
int hb_midi(int track,int status,int pitch,int velocity) {
    count=0;
    if(track<0||track>=4||(status!=128&&status!=144)||pitch<0||pitch>127||velocity<0||velocity>127)return -1;
    uint8_t message[3]={(uint8_t)status,(uint8_t)pitch,(uint8_t)velocity};
    append(api->process_midi(instances[track],message,3,output,lengths,256));return count;
}
int hb_tick(int track,int frames) {
    count=0;if(track<0||track>=4||frames<0||frames>44100)return -1;
    append(api->tick(instances[track],frames,44100,output,lengths,256));if(track==3)position+=(double)frames/44100.0*2.0;return count;
}
uint32_t hb_event(int index) {
    if(index<0||index>=count)return 0;
    return captured[index];
}
#ifdef NATIVE_ORACLE
int main(void) {
    hb_init();char line[256];int track,status,pitch,velocity,frames;
    while(fgets(line,sizeof(line),stdin)) {
        if(sscanf(line,"m %d %d %d %d",&track,&status,&pitch,&velocity)==4)hb_midi(track,status,pitch,velocity);
        else if(sscanf(line,"t %d %d",&track,&frames)==2)hb_tick(track,frames);
        else return 2;
        putchar('[');for(int index=0;index<count;index++){if(index)putchar(',');printf("%u",hb_event(index));}puts("]");
    }
}
#endif
