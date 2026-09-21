/* Replay actual seq-core MIDI and bridge positions through production HB. */
#include <assert.h>
#include <sys/mman.h>
#include <unistd.h>
#include "modules/harmonybus/dsp/harmonybus.c"
static hb_global_shared_t globals;
static uint8_t output[64][3];
static int lengths[64], local_ons, render_ons;
static unsigned long trace_tick;
static float tempo(void){return 120;}
static int clock_status(void){return 2;}
static int inject(const uint8_t *packet,int size){
    assert(size==4);
    if((packet[1]&0xf0)==0x90&&packet[3]){
        assert(trace_tick>=384&&packet[2]==62);
        render_ons++;
    }
    return size;
}
static void midi(Inst *instance,int status,int pitch,int velocity){
    uint8_t message[3]={(uint8_t)status,(uint8_t)pitch,(uint8_t)velocity};
    API.process_midi(instance,message,3,output,lengths,64);
}
int main(int argc,char **argv){
    assert(argc==2);
    FILE *trace=fopen(argv[1],"r");assert(trace);
    host_api_v1_t host={.sample_rate=48000,.get_bpm=tempo,.get_clock_status=clock_status,.midi_inject_to_move=inject};
    g_global_shared=&globals;
    move_midi_fx_init(&host);
    Inst *conductor=API.create_instance("",NULL),*follower=API.create_instance("",NULL);
    API.set_param(conductor,"role","Conductor");
    API.set_param(follower,"role","Follower");
    API.set_param(follower,"render_channel","4");
    API.set_param(conductor,"source_channel","1");
    API.set_param(follower,"source_channel","1");
    API.set_param(follower,"follower_root_policy","Explicit");
    API.set_param(follower,"follower_explicit_root","C");
    g_bus.quant_timing=3; /* quarter-note boundaries */
    /* First press is exactly 1/16 before the bar. Use an explicit wider
       window: musical buffers now exclude that nominal leading edge by 1 ms. */
    API.set_param(follower,"boundary_buffer_ms","150 ms");
    char line[256],block[64];unsigned long serial=0,previous=~0UL;
    while(fgets(line,sizeof(line),trace)&&trace_tick<480){
        if(line[0]=='T'){
            trace_tick=strtoul(line+2,NULL,10);
            API.set_param(conductor,"hb_movy_clip",line+2);
        }else if(line[0]=='N'){
            int status,pitch,velocity;
            assert(sscanf(line+2,"%d %d %d",&status,&pitch,&velocity)==3);
            midi(conductor,status,pitch,velocity);
        }else if(line[0]=='E'){
            /* Rapid repeated presses straddle the bar. Pre-bar presses must
               remain raw until the boundary, including the render destination. */
            if(trace_tick!=previous&&trace_tick>=360&&trace_tick<=410){
                if(trace_tick%4==0)midi(follower,0x90,60,100);
                if(trace_tick%4==2)midi(follower,0x80,60,0);
            }
            previous=trace_tick;
            snprintf(block,sizeof(block),"%lu,64,48000",++serial);
            API.set_param(conductor,"hb_movy_block",block);
            int count=API.tick(follower,64,48000,output,lengths,64);
            for(int index=0;index<count;index++)if((output[index][0]&0xf0)==0x90&&output[index][2]){
                assert(trace_tick>=384&&output[index][1]==62);
                local_ons++;
            }
        }
    }
    assert(local_ons==13&&render_ons==13);
    assert(follower->follower_queue_count==0);
    fclose(trace);
    API.destroy_instance(conductor);API.destroy_instance(follower);
    puts("follower_trace: all 13 repeated notes use the new chord locally and at Render To");
}
