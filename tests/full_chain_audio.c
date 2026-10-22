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
static int source_velocity_check;
static int capture_source_velocity,source_velocity_count,source_velocities[16];
static int capture_edges,edge_count,edges[128];
static int move_play_presses,move_play_releases;
static unsigned rendered_mask;
static double beat;
static void log_message(const char *message){fprintf(stderr,"%s\n",message);}
static float bpm(void){return 120;}
static double position(void){return beat;}
static int clock_status(void){return 0;}
static int send_packet(const uint8_t *packet,int length){
    if(length!=4){rejected++;return 0;}
    if(capture_source_velocity&&(packet[1]&0xf0)==0x90&&packet[3]){
        assert(source_velocity_count<16);source_velocities[source_velocity_count++]=packet[3];
    }
    if(capture_edges&&((packet[1]&0xf0)==0x90||(packet[1]&0xf0)==0x80)){
        assert(edge_count<128);
        edges[edge_count++]=(packet[1]&0xf0)==0x90&&packet[3]?1:0;
    }
    if((packet[1]&0xf0)==0x90&&packet[3]){if(source_velocity_check)assert(packet[3]==source_velocity_check);sent_on++;rendered_mask|=1u<<(packet[2]%12);}
    if((packet[1]&0xf0)==0x80||((packet[1]&0xf0)==0x90&&!packet[3]))sent_off++;
    return 4;
}
static int inject_packet(const uint8_t *packet,int length){
    if(length==4&&packet[1]==0xb0&&packet[2]==85){
        if(packet[3])move_play_presses++;else move_play_releases++;
    }
    return send_packet(packet,length);
}
static host_api_v1_t host={.api_version=1,.sample_rate=44100,.frames_per_block=128,
    .log=log_message,.midi_send_internal=send_packet,.midi_inject_to_move=inject_packet,
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
static float field_get(const char *key){char text[128]={0};int n=api->get_param(instance,key,text,sizeof(text));assert(n>0);return strtof(text,0);}
static void test_field_lfos(void){
    set("cmd","stop");render(16);
    assert(field_get("ch0:lfo1:field_source_version")==1);
    set("ch0:midi_fx1:field_glide","0");
    set("ch0:midi_fx1:field_outputs","fo1,10000,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1");
    set("ch0:synth:cutoff","20");
    set("ch0:lfo1:target","synth");set("ch0:lfo1:target_param","cutoff");
    set("ch0:lfo1:depth","0.5");set("ch0:lfo1:polarity","1");set("ch0:lfo1:enabled","1");set("ch0:lfo1:shape","6");render(16);
    assert(field_get("ch0:lfo1:shape")==6);assert(field_get("ch0:synth:cutoff")==20);
    assert(field_get("ch0:synth:cutoff:effective")>=51&&field_get("ch0:synth:cutoff:effective")<=52);
    set("ch0:midi_fx1:bypassed","1");render(16);assert(field_get("ch0:synth:cutoff:effective")==20);
    set("ch0:midi_fx1:bypassed","0");render(16);assert(field_get("ch0:synth:cutoff:effective")>50);
    /* Both slots can address one parameter; clearing one preserves the other. */
    set("ch0:lfo2:shape","7");set("ch0:lfo2:target","synth");set("ch0:lfo2:target_param","cutoff");
    set("ch0:lfo2:depth","0.25");set("ch0:lfo2:polarity","1");set("ch0:lfo2:enabled","1");render(16);
    assert(field_get("ch0:synth:cutoff:effective")>=35&&field_get("ch0:synth:cutoff:effective")<=36);
    /* Overview reads must neither advance the Field nor disturb the combined
       value of two sources addressing the same target. */
    char field_before[2048],field_after[2048];
    assert(api->get_param(instance,"ch0:midi_fx1:field_outputs_view2",field_before,sizeof(field_before))>0);
    const float effective_before=field_get("ch0:synth:cutoff:effective");
    for(int read=0;read<100;read++){
        assert(field_get("ch0:synth:cutoff:base")==20);
        assert(field_get("ch0:synth:cutoff:effective")==effective_before);
        assert(field_get("ch0:lfo1:active")==1);
        assert(field_get("ch0:lfo2:active")==1);
        assert(api->get_param(instance,"ch0:midi_fx1:field_outputs_view2",field_after,sizeof(field_after))>0);
        assert(!strcmp(field_before,field_after));
    }
    set("ch0:lfo1:enabled","0");render(16);assert(field_get("ch0:synth:cutoff:effective")>=4&&field_get("ch0:synth:cutoff:effective")<=5);
    set("ch0:lfo2:enabled","0");render(16);assert(field_get("ch0:synth:cutoff:effective")==20);
    char saved[131072];assert(api->get_param(instance,"ch0:midi_fx1:state",saved,sizeof(saved))>0);
    set("ch0:lfo1:shape","0");set("ch0:lfo2:shape","0");set("ch0:midi_fx1:state",saved);render(16);
    assert(field_get("ch0:lfo1:shape")==6&&field_get("ch0:lfo2:shape")==7);
    set("ch0:lfo1:enabled","1");render(16);
    assert(api->get_param(instance,"ch0:midi_fx1:state",saved,sizeof(saved))>0);
    set("ch0:midi_fx1:module","none");render(16);assert(field_get("ch0:synth:cutoff:effective")==20);
    set("ch0:midi_fx1:module","harmonybus");render(16);set("ch0:midi_fx1:state",saved);render(16);
    assert(field_get("ch0:lfo1:shape")==6&&field_get("ch0:synth:cutoff:effective")>50);
    set("ch0:lfo1:enabled","0");
    set("ch0:lfo1:shape","0");set("ch0:lfo2:shape","0");render(16);
    assert(field_get("ch0:lfo1:shape")==0&&field_get("ch0:synth:cutoff:effective")==20);
    puts("Field LFOs: real Movy source selection, two routes, bypass/resume, save/restore and stock waveform return pass");
}
static void test_shared_context(void){
    char state[65536],view[2048];
    set("ch0:midi_fx1:performance_reset","1");
    set("ch0:midi_fx1:transpose","0");set("ch0:midi_fx1:follower_scale","Major");
    set("ch0:midi_fx1:follower_explicit_root","C");
    set("ch0:midi_fx1:role","Conductor");set("ch1:midi_fx1:role","Conductor");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("cmd","play");render(16);set("cmd","rec 0");render(800);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));fprintf(stderr,"shared record view: %s\n",view);
    set("ch0:midi_fx1:parallel_scale","Natural Minor");set("ch0:midi_fx1:parallel_mode","Down");render(16);
    set("ch0:midi_fx1:parallel_mode","Up");render(16);set("cmd","stop");render(4);
    api->get_param(instance,"state",state,sizeof(state));
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));fprintf(stderr,"shared capture view: %s\n",view);
    assert(strstr(state,"sc 0 0 "));
    /* Explicit cross-boundary gesture, plus a second conductor's key. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 1 0 0\ncl 0 0 16 0 \ncl 1 0 16 0 \nsc 0 0 350 1 1 2 0 0\nsc 0 0 40 1 0 2 0 0\nsc 1 0 0 0 1 2 2774 0\n");
    set("cmd","play");render(2);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));
    fprintf(stderr,"shared initial: %s\n",view);assert(strstr(view,"dp1|Dm|")&&strstr(view,"T2 REC")&&strstr(view,"T1 REC"));
    render(80);api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));
    fprintf(stderr,"shared release: %s\n",view);assert(strstr(view,"dp1|D|")&&strstr(view,"Major"));
    set("cmd","stop");render(4);api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));
    assert(!strstr(view," REC"));
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("ch0:midi_fx1:chord_mode","Off");set("ch0:midi_fx1:arp_playback","Together");
    set("ch0:midi_fx1:key_center_scale","Use Parallel Scale");set("ch0:midi_fx1:parallel_scale","Major");
    set("padmap","0,62,64,67,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60");
    set("cmd","play");render(16);set("cmd","rec 0");render(800);
    set("ch0:midi_fx1:motion_operation_1","Recordable Key Center");
    set("ch0:midi_fx1:motion_hold_1","On");
    uint8_t down[]={0x90,68,100},up[]={0x80,68,0};
    api->on_midi(instance,down,3,0);set("cmd","non 0 62 100");render(16);
    set("ch0:midi_fx1:motion_hold_1","Off");
    api->on_midi(instance,up,3,0);set("cmd","nof 0 62");render(16);set("cmd","stop");render(8);
    api->get_param(instance,"state",state,sizeof(state));assert(strstr(state,"sc 0 0 "));
    rendered_mask=0;sent_on=sent_off=0;set("cmd","play");render(1500);set("cmd","stop");render(16);
    fprintf(stderr,"key landing replay: mask=%u ons=%d offs=%d\n",rendered_mask,sent_on,sent_off);
    assert(rendered_mask==(1u<<2)&&sent_on>=2&&sent_on==sent_off);
    puts("shared context: real recording bridge, independent conductor aggregation, loop carry, release, repeated key landing and stop pass");
}
static void test_key_operation_ownership(void){
    char state[65536],view[2048];
    set("cmd","stop");render(4);
    set("ch0:midi_fx1:performance_reset","1");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("cmd","usnap 500;play");render(16);set("cmd","rec 0");render(800);
    set("ch0:midi_fx1:key_center","On");
    uint8_t down[]={0x90,68,100},up[]={0x80,68,0};
    api->on_midi(instance,down,3,0);set("cmd","non 0 62 100");render(16);
    api->on_midi(instance,up,3,0);set("cmd","nof 0 62");render(16);
    set("cmd","stop");render(4);
    api->get_param(instance,"state",state,sizeof(state));assert(!strstr(state,"sc 0 0 "));
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));assert(strstr(view,"dp1|D|")&&strstr(view,"LIVE"));
    set("cmd","uswap 500 501");render(4);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));assert(strstr(view,"dp1|D|")&&strstr(view,"LIVE"));
    /* A captured no-note modulation must reach the native sequence exactly
       once, repeat across loops, and restart from its stored origin. */
    set("ch0:midi_fx1:performance_reset","1");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("ch0:midi_fx1:motion_operation_1","Relative Key Center");
    set("cmd","play");render(16);set("cmd","rec 0");render(800);
    set("ch0:midi_fx1:motion_hold_1","On");render(4);
    set("ch0:midi_fx1:motion_hold_1","Off");render(4);
    api->get_param(instance,"state",state,sizeof(state));assert(strstr(state,"sc 0 0 "));
    set("cmd","stop");render(4);
    /* A known one-bar timeline checks the recording wire format and loop
       reconstruction independently of when the host polls the live event. */
    snprintf(state,sizeof(state),"movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \nsc 0 0 0 0 1 13 2741 %d\n",(2741<<13)|(1<<26));
    set("state",state);set("cmd","play");render(4);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));assert(strstr(view,"dp1|C#|")&&strstr(view,"REC"));
    render(700);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));assert(strstr(view,"dp1|D|"));
    set("cmd","stop");render(4);set("cmd","play");render(4);
    api->get_param(instance,"ch0:midi_fx1:shared_context_snapshot",view,sizeof(view));assert(strstr(view,"dp1|C#|"));
    set("cmd","stop");render(4);
    puts("key operations: live Record/Undo isolation, no-note capture, recursive loops and restart pass");
}
static void test_capture(void){
    for(int batched=0;batched<2;batched++)for(int running=0;running<2;running++)for(int arp=0;arp<2;arp++){
        set("state","movy1\nbpm 12000\nlink 0\n");
        set("ch0:midi_fx1:chord_mode","Scale Root");
        set("ch0:midi_fx1:chord_form","Triad");
        set("ch0:midi_fx1:arp_playback",arp?"Repeat Arp":"Together");
        set("ch0:midi_fx1:master_transpose","D");
        render(64);
        if(running){set("cmd","play");render(32);}
        sent_on=sent_off=rejected=0;rendered_mask=0;
        uint8_t down[]={0x90,68,100},up[]={0x80,68,0};
        static unsigned long long surface_serial=0;
        char event[128];
        if(batched){
            snprintf(event,sizeof(event),"%llu,0,144,11,60,100,0,-1,0",++surface_serial);
            set("surface_events",event);set("surface_events",event); /* timeout retry */
        }else {api->on_midi(instance,down,3,0);set("cmd","non 0 60 100");}
        render(128);
        if(batched){
            snprintf(event,sizeof(event),"%llu,0,128,11,60,0,0,-1,0",++surface_serial);
            set("surface_events",event);set("surface_events",event);
        }else {api->on_midi(instance,up,3,0);set("cmd","nof 0 60");}
        render(128);
        int played=sent_on;unsigned played_mask=rendered_mask;
        fprintf(stderr,"capture input running=%d arp=%d on=%d off=%d mask=%u\n",running,arp,played,sent_off,played_mask);
        assert(played>0&&sent_off==played);
        set("cmd","cap 0;capdone");
        char state[32768];api->get_param(instance,"state",state,sizeof(state));
        char *clip=strstr(state,"cl 0 0 ");assert(clip);
        char *end=strchr(clip,'\n');assert(end);*end=0;
        int steps,start,consumed=0,count=0;
        assert(sscanf(clip,"cl 0 0 %d %d %n",&steps,&start,&consumed)==2);
        char *voice=clip+consumed;
        while(*voice){
            int tick,gate,pitch,velocity,step,rendered=0;
            assert(sscanf(voice,"%d:%d:%d:%d:%d:%d",&tick,&gate,&pitch,&velocity,&step,&rendered)==5);
            assert(rendered==0&&pitch==60);count++;
            voice=strchr(voice,';');if(!voice)break;voice++;
        }
        assert(count==1);
        set("cmd","stop");render(64);
        /* Capture retains the input, so a changed form regenerates on replay. */
        set("ch0:midi_fx1:chord_form","Ninth");
        set("ch0:midi_fx1:arp_playback","Together");render(16);
        sent_on=sent_off=rejected=0;rendered_mask=0;
        set("cmd","play");render(344);set("cmd","stop");render(64);
        assert(sent_on==5&&sent_off==5&&rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)|(1u<<1)|(1u<<4))&&rejected==0);
        printf("capture running=%d arp=%d: one input regenerates five ninth voices with paired releases\n",running,arp);
    }
}
/* Independent C oracle at the actual plugin ABI output, outside Movy's checker. */
static void test_diagnostic_tone(void){
    set("cmd","stop");render(16);
    set("cmd","acapture");
    const uint64_t total=44100u*30u,step=((uint64_t)220<<32)/44100u;
    uint64_t checked=0;
    int16_t output[256];
    for(uint64_t block=0;block*128<total;block++){
        memset(output,0,sizeof(output));api->render_block(instance,output,128);
        beat+=256.0/44100.0;
        for(int frame=0;frame<128;frame++){
            uint64_t absolute=block*128+(uint64_t)frame;
            if(absolute<441||absolute>=total-441)continue;
            uint32_t phase=(uint32_t)(absolute*step);
            int position=(int)(phase>>16);
            int value=(position<32768?position-16384:49151-position)/4;
            assert(output[2*frame]==value/2);
            assert(output[2*frame+1]==-value/4);checked+=2;
        }
    }
    char status[4096];api->get_param(instance,"status",status,sizeof(status));
    char *probe=strstr(status," tonecheck=");assert(probe);
    unsigned state=0,max_error=1;
    unsigned long long internal_checked=0,bad=1,frames=0;
    assert(sscanf(probe," tonecheck=%u,%llu,%llu,%u,%llu",&state,&internal_checked,&bad,&max_error,&frames)==5);
    assert(state==2&&bad==0&&max_error==0&&internal_checked==checked&&frames==total);
    set("cmd","aprof_off");
    printf("tone integration: %llu stereo samples match the independent ABI-output oracle\n",(unsigned long long)checked);
}


static void test_source_weaving(void){
    char parameter[128];
    set("cmd","stop");render(16);
    set("ch0:midi_fx1:performance_reset","1");
    set("ch0:midi_fx1:master_transpose","C");
    for(int track=0;track<16;track++){
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:role",track);set(parameter,"Off");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:render_channel",track);set(parameter,"Off");
        snprintf(parameter,sizeof(parameter),"ch%d:mix",track);set(parameter,"1,0,1,0,0");
    }
    set("ch3:midi_fx1:role","Follower");set("ch3:midi_fx1:render_channel","4");
    set("ch3:midi_fx1:content_map","Free");set("ch3:midi_fx1:travel_map","None");
    set("ch3:midi_fx1:chord_mode","Off");set("ch3:midi_fx1:arp_playback","Together");
    set("ch3:midi_fx1:follower_root_policy","Explicit");set("ch3:midi_fx1:follower_explicit_root","C");
    set("ch3:mix","1,0,0,0,0");
    set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\ncl 1 0 16 0 0:48:60:100:0;0:48:64:80:0;192:48:67:90:8\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\ncl 3 0 16 0 0:24:30:100:0\nsr 3 1 1 0 2 0 0\n");
    render(16);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");long energy=render(240);set("cmd","stop");render(32);
    fprintf(stderr,"source melody: pcm=%ld on=%d off=%d mask=%u\n",energy,sent_on,sent_off,rendered_mask);
    assert(energy>0&&sent_on==3&&sent_off==3&&rendered_mask==((1u<<0)|(1u<<4)|(1u<<7)));
    /* Fit compresses a two-bar pitch loop into the actor's one-bar window.
       Timeline remains independent; both use the same attacks and releases. */
    for(int alignment=1;alignment<=2;alignment++){
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\ncl 1 0 32 0 0:48:60:100:0;192:48:62:100:8;384:48:64:100:16;576:48:67:100:24\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\ncl 3 0 16 0 \n");
        snprintf(parameter,sizeof(parameter),"source 3 1 1 0 2 0 %d",alignment);set("cmd",parameter);
        render(16);sent_on=sent_off=0;rendered_mask=0;
        set("cmd","play");energy=render(240);set("cmd","stop");render(32);
        assert(energy>0&&sent_on==2&&sent_off==2);
        assert(rendered_mask==(alignment==2?((1u<<0)|(1u<<2)):(1u<<0)));
    }
    puts("source fit: proportional pitch window and unchanged Timeline audio with paired releases pass");
    /* Expression can fit independently while pitch stays Sequential. */
    for(int fitted=0;fitted<=1;fitted++){
        set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 32 0 0:48:90:40:0;192:48:90:80:8\ncl 1 0 16 0 0:48:60:100:0;192:48:64:100:8\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\ncl 3 0 16 0 \n");
        snprintf(parameter,sizeof(parameter),"source 3 1 1 0 2 0 0 0 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 %d",fitted);set("cmd",parameter);
        render(16);sent_on=sent_off=0;rendered_mask=0;source_velocity_count=0;capture_source_velocity=1;
        set("cmd","play");energy=render(240);set("cmd","stop");render(32);capture_source_velocity=0;
        assert(energy>0&&sent_on==2&&sent_off==2&&rendered_mask==((1u<<0)|(1u<<4)));
        assert(source_velocity_count==2&&source_velocities[0]==40&&source_velocities[1]==(fitted?80:40));
    }
    puts("source expression fit: independent velocity selection and paired releases through production HB pass");
    /* Independent raw expression donor through the actual MIDI/HB/audio chain. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 16 0 0:48:90:42:0\ncl 1 0 16 0 0:48:60:100:0;0:48:64:80:0;192:48:67:90:8\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\ncl 3 0 16 0 0:24:30:100:0\nsr 3 1 1 0 2 0 0 0 0\n");
    render(16);sent_on=sent_off=0;rendered_mask=0;source_velocity_check=42;
    set("cmd","play");energy=render(240);set("cmd","stop");render(32);
    source_velocity_check=0;
    assert(energy>0&&sent_on==3&&sent_off==3&&rendered_mask==((1u<<0)|(1u<<4)|(1u<<7)));
    /* Section Shape reaches actual HB MIDI, and Space releases through its
       normal gate owner while a downbeat is protected from omission. */
    for(int strength=-100;strength<=100;strength+=100){
        set("state","movy1\nbpm 12000\nlink 0\ntk 3 0 0\ncl 3 0 16 0 0:48:60:80:0\nsg 0\n");
        char shape_command[128];
        snprintf(shape_command,sizeof(shape_command),"songsection 0 energy %d;songsection 0 space 100",strength);
        set("cmd",shape_command);render(16);
        sent_on=sent_off=0;source_velocity_check=80*(200+strength)/200;
        set("cmd","play");energy=render(30);source_velocity_check=0;
        assert(energy>0&&sent_on==1&&sent_off==1);
        set("cmd","stop");render(32);assert(sent_on==1&&sent_off==1);
    }
    puts("Section Shape: real HB output velocity 40/80/120, protected downbeat and shortened paired gate pass");
    /* Parameter target matching reaches the production chain before note-on. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 16 0 \ncl 2 0 16 0 0:48:36:100:0\ncl 3 0 16 0 0:48:60:100:0\nsr 3 1 -1 -1 2 0 0 -1 -1 0 0\n");
    render(16);
    set("ch0:knob_6_set","synth:cutoff");set("ch3:knob_2_set","synth:cutoff");
    char parameter_view[8192];
    api->get_param(instance,"ch3:chain_params",parameter_view,sizeof(parameter_view));
    set("cmd","alabel 0 5 synth:cutoff;abase 0 5 33;aset 0 5 0 91;alabel 3 1 synth:cutoff;abase 3 1 19;aset 3 1 0 44");render(16);
    sent_on=sent_off=0;set("cmd","play");energy=render(16);
    api->get_param(instance,"ch3:synth:cutoff",parameter_view,sizeof(parameter_view));
    fprintf(stderr,"instrument borrowed cutoff=%s\n",parameter_view);assert(atoi(parameter_view)==91);
    api->get_param(instance,"ch3:synth:attack_cutoff",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==91);
    set("cmd","mute 0 1");render(16);
    api->get_param(instance,"ch3:synth:cutoff",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==44);
    set("cmd","stop");render(32);
    api->get_param(instance,"ch3:synth:cutoff",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==19);
    assert(energy>0&&sent_on==1&&sent_off==1);
    /* Independent HB rendering lane reaches the real HB note renderer. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\ncl 1 0 16 0 \ncl 2 0 16 0 0:48:36:100:0\ncl 3 0 16 0 0:48:60:100:0\nsr 3 1 -1 -1 2 0 0 -1 -1 -1 -1 1 0\n");
    render(16);
    set("ch1:knob_7_set","midi_fx1:render_velocity_percent");set("ch3:knob_3_set","midi_fx1:render_velocity_percent");
    api->get_param(instance,"ch3:chain_params",parameter_view,sizeof(parameter_view));
    set("cmd","alabel 1 6 midi_fx1:render_velocity_percent;abase 1 6 32;aset 1 6 0 127;alabel 3 2 midi_fx1:render_velocity_percent;abase 3 2 127;aset 3 2 0 0");render(16);
    sent_on=sent_off=0;source_velocity_check=127;
    set("cmd","play");energy=render(16);source_velocity_check=0;
    api->get_param(instance,"ch3:midi_fx1:render_velocity_percent",parameter_view,sizeof(parameter_view));
    fprintf(stderr,"HB borrowed render velocity=%s\n",parameter_view);assert(atoi(parameter_view)==400);
    set("cmd","mute 1 1");render(16);
    api->get_param(instance,"ch3:midi_fx1:render_velocity_percent",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==0);
    set("cmd","stop");render(32);
    api->get_param(instance,"ch3:midi_fx1:render_velocity_percent",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==400);
    assert(energy>0&&sent_on==1&&sent_off==1);
    set("ch3:midi_fx1:render_velocity_percent","100");
    /* Raw recorded operations use HB's ordinary onset and release owner. */
    char operation_state[4096];
    int used=snprintf(operation_state,sizeof(operation_state),"movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 16 0 0:48:90:20:0\ncl 2 0 16 0 0:48:36:100:0;96:48:36:100:4\ncl 3 0 16 0 0:48:60:100:0\nsr 3 1 -1 -1 2 0 0 -1 -1 -1 -1 -1 -1 0 0\nra 0 0 0 0");
    for(int lane=0;lane<52;lane++){
        unsigned long long word=lane==51?0:(1ULL<<63);
        if(lane==0)word|=(16ULL<<32)|2000; /* Recorded Transpose +2 semitones. */
        used+=snprintf(operation_state+used,sizeof(operation_state)-(size_t)used,",%llu",word);
    }
    snprintf(operation_state+used,sizeof(operation_state)-(size_t)used,"\n");
    set("state",operation_state);render(16);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");energy=render(16);
    fprintf(stderr,"borrowed note operations: mask=%u\n",rendered_mask);assert(sent_on==1&&rendered_mask==(1u<<2));
    set("cmd","mute 0 1");energy+=render(240);set("cmd","stop");render(32);
    assert(energy>0&&sent_on==2&&sent_off==2&&rendered_mask==((1u<<2)|1));
    /* Borrow raw Grid holds through the same HB sequence/live hold owners. */
    set("ch3:midi_fx1:motion_operation_1","Transpose");set("ch3:midi_fx1:motion_control_1","2");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 16 0 \ncl 2 0 16 0 0:48:36:100:0;96:48:36:100:4\ncl 3 0 16 0 0:48:60:100:0\ngg 0 0 0 192 0\nsr 3 1 -1 -1 2 0 0 -1 -1 -1 -1 -1 -1 -1 -1 0 0\n");
    render(16);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");energy=render(16);
    assert(sent_on==1&&rendered_mask==(1u<<2));
    set("ch3:midi_fx1:motion_hold_1","On");
    set("cmd","mute 0 1");render(16);
    api->get_param(instance,"ch3:midi_fx1:motion_sequence_mask",parameter_view,sizeof(parameter_view));assert(atoi(parameter_view)==0);
    api->get_param(instance,"ch3:midi_fx1:motion_hold_1",parameter_view,sizeof(parameter_view));assert(!strcmp(parameter_view,"On"));
    set("ch3:midi_fx1:motion_hold_1","Off");energy+=render(224);set("cmd","stop");render(32);
    assert(energy>0&&sent_on==2&&sent_off==2&&rendered_mask==((1u<<2)|1));
    set("ch3:midi_fx1:motion_operation_1","Off");
    /* Raw recorded Repeat intervals borrow timing without copying notes or
       introducing another gate owner. Eight attacks, eight paired releases. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 3 0 0\ncl 0 0 16 0 \ncl 3 0 16 0 0:2:60:100:0\noi 0 0 0 48 0 0 0 12 1 6\nsr 3 1 -1 -1 -1 -1 0 -1 -1 -1 -1 -1 -1 -1 -1 -1 -1 0 0\n");
    render(16);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");energy=render(120);set("cmd","stop");render(32);
    fprintf(stderr,"source gestures: pcm=%ld on=%d off=%d mask=%u\n",energy,sent_on,sent_off,rendered_mask);
    assert(energy>0&&sent_on==8&&sent_off==8&&rendered_mask==1);
    /* Existing conductor-chord generation consumes the woven trigger directly.
       Root Only and Triad exercise bass and comp without another harmony state. */
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:chord_mode","Off");
    set("ch3:midi_fx1:chord_mode","Conductor Chord");
    set("ch3:midi_fx1:chord_inversion","Root");
    for(int comp=0;comp<2;comp++){
        set("ch3:midi_fx1:chord_form",comp?"Triad":"Root Only");
        set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 2 0 0\ntk 3 0 0\ncl 0 0 16 0 0:384:60:100:0;0:384:64:100:0;0:384:67:100:0\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\ncl 3 0 16 0 0:24:60:100:0\nsr 3 1 -1 -1 2 0 0\n");
        render(16);sent_on=sent_off=0;rendered_mask=0;
        set("cmd","play");energy=render(240);set("cmd","stop");render(32);
        fprintf(stderr,"source %s: pcm=%ld on=%d off=%d mask=%u\n",comp?"comp":"bass",energy,sent_on,sent_off,rendered_mask);
        assert(energy>0&&sent_on==(comp?6:2)&&sent_off==sent_on);
        assert(rendered_mask==(comp?((1u<<0)|(1u<<4)|(1u<<7)):(1u<<0)));
    }
    /* Woven conductors must not teach the destination's nominal loop as a
       proven cycle. Exercise actual metadata -> HB fallback and paired audio. */
    set("ch3:midi_fx1:role","Off");set("ch3:midi_fx1:render_channel","Off");
    set("ch0:midi_fx1:render_channel","4");set("ch0:midi_fx1:content_map","Free");
    set("ch0:midi_fx1:travel_map","None");set("ch0:mix","1,0,0,0,0");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 1 0 0\ntk 2 0 0\ncl 0 0 16 0 \ncl 1 0 24 0 0:24:60:100:0;96:24:64:100:4\ncl 2 0 16 0 0:24:36:100:0;96:24:36:100:4\nsr 0 1 1 0 2 0 0\n");
    render(16);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");energy=render(240);
    api->get_param(instance,"ch0:midi_fx1:next_model",parameter_view,sizeof(parameter_view));
    assert(!strcmp(parameter_view,"Non-repeating"));
    set("cmd","stop");render(32);
    assert(energy>0&&sent_on==2&&sent_off==2);
    /* Donor loss stays conservatively ineligible; disabling routing restores
       the existing own-clip learner without altering the source clip. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 0:192:60:100:0;192:192:65:100:8\nsr 0 1 1 0 -1 -1 0\n");
    set("cmd","play");render(80);api->get_param(instance,"ch0:midi_fx1:next_model",parameter_view,sizeof(parameter_view));
    assert(!strcmp(parameter_view,"Non-repeating"));
    set("cmd","source 0 0 1 0 -1 -1 0");render(80);
    api->get_param(instance,"ch0:midi_fx1:next_model",parameter_view,sizeof(parameter_view));
    assert(strcmp(parameter_view,"Non-repeating"));
    assert(!strcmp(parameter_view,"Learning")||!strcmp(parameter_view,"Locked"));
    set("cmd","source 0 1 1 0 -1 -1 0");render(16);
    api->get_param(instance,"ch0:midi_fx1:next_model",parameter_view,sizeof(parameter_view));
    assert(!strcmp(parameter_view,"Non-repeating"));
    set("cmd","stop");render(32);
    puts("source weaving: actual Movy/chain/HB melody, conductor root and comp with paired releases pass");
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
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:receive_channel",track);set(parameter,"Off");
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
        /* A short release followed by a new strike must remain two edges,
           including both arriving before the next audio callback. */
        uint8_t press[]={0x90,68,100},release[]={0x80,68,0};
        sent_on=sent_off=0;api->on_midi(instance,press,3,0);render(4);
        int voices=sent_on;assert(voices>0);
        for(int gap_blocks=0;gap_blocks<5;gap_blocks++)for(int repeat=0;repeat<20;repeat++){
            edge_count=0;capture_edges=1;
            api->on_midi(instance,release,3,0);
            render(gap_blocks);
            api->on_midi(instance,press,3,0);render(4);
            capture_edges=0;
            assert(edge_count==2*voices);
            for(int event=0;event<edge_count;event++)assert(edges[event]==(event>=voices));
        }
        api->on_midi(instance,release,3,0);render(4);
        printf("short release/repress: mode=%d track=%d, 100 ordered strike pairs at 0..4 block gaps\n",mode,track);
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
        assert(sscanf(voice,"%d:%d:%d:%d:%d:%d",&tick,&gate,&pitch,&velocity,&step,&rendered)==5);
        assert(rendered==0);pitches|=1u<<(pitch%12);count++;
        voice=strchr(voice,';');if(!voice)break;voice++;
    }
    assert(count==1&&pitches==(1u<<0));
    // A changed chord form regenerates the single saved input on replay.
    set("ch0:midi_fx1:chord_form","Ninth");
    set("ch0:midi_fx1:master_transpose","F");render(32);
    sent_on=sent_off=rejected=0;rendered_mask=0;
    set("cmd","play");long replay=render(345);set("cmd","stop");render(32);
    printf("replay local_pcm=%ld routed_on=%d routed_off=%d rejected=%d\n",replay,sent_on,sent_off,rejected);
    assert(replay>0&&sent_on==5&&sent_off==5&&rejected==0);
    assert(rendered_mask==((1u<<5)|(1u<<9)|(1u<<0)|(1u<<4)|(1u<<7)));
    // Master transpose applies once to the regenerated ninth.
    set("ch0:midi_fx1:master_transpose","D");render(16);rendered_mask=0;
    set("cmd","play");render(345);set("cmd","stop");render(32);
    assert(rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)|(1u<<1)|(1u<<4)));
    /* Previously recorded output remains literal, even with Ninth selected. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 0:24:60:100:0:1;0:24:64:100:0:1;0:24:67:100:0:1\n");
    sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");render(345);set("cmd","stop");render(32);
    assert(sent_on==3&&sent_off==3&&rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)));
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
    /* Real HB configuration reaches the sequencer without any UI page open. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 4 0 0:3:60:100:0:1;24:3:64:100:1:1;48:3:67:100:2:1;72:3:72:100:3:1\n");
    set("ch0:midi_fx1:motion_operation","Clip Repeat");set("ch0:midi_fx1:motion_grid","1/64");
    set("ch0:midi_fx1:motion_cycle","1/4");set("ch0:midi_fx1:motion_every","2");set("ch0:midi_fx1:motion_from","2");
    set("ch0:midi_fx1:motion_enabled","On");render(16);sent_on=sent_off=0;
    set("cmd","play");render(344);set("cmd","stop");render(32);
    printf("automatic clip: routed_on=%d routed_off=%d\n",sent_on,sent_off);
    assert(sent_on==20&&sent_off==20);
    /* Disabling Auto is copied at the next block, without a metadata poll loop. */
    set("ch0:midi_fx1:motion_enabled","Off");render(16);sent_on=sent_off=0;
    set("cmd","play");render(344);set("cmd","stop");render(32);
    assert(sent_on==8&&sent_off==8);
    /* Record from stopped must reach the same host injection callback as Play.
       Until native Start arrives, count-in is armed but not advancing. */
    set("cmd","link 1;minject 1;rec 0");render(64);
    char status[4096];api->get_param(instance,"status",status,sizeof(status));
    assert(strstr(status,"play=0 ")&&strstr(status,"cin=1 "));
    assert(move_play_presses==1&&move_play_releases==1);
    uint8_t native_start=0xfa;api->on_midi(instance,&native_start,1,0);render(1);
    api->get_param(instance,"status",status,sizeof(status));
    assert(strstr(status,"play=1 ")&&strstr(status,"cin=1 "));
    printf("record start: one native Play press/release, count-in waits for native Start\n");
    set("cmd","stop");render(64);
    /* Pause during live gestures, before the physical release reaches HB. */
    for(int kind=0;kind<4;kind++){
        set("state","movy1\nbpm 12000\nlink 0\n");
        set("ch0:mix","1,0,0,0,0");
        set("ch0:midi_fx1:render_channel","4");
        set("ch0:midi_fx1:chord_mode",kind?"Scale Root":"Off");
        set("ch0:midi_fx1:arp_playback",kind==2?"Repeat Arp":kind==3?"Strum":"Together");
        set("ch0:midi_fx1:arp_phase","Free");
        set("ch0:midi_fx1:strum_spread","400");
        set("cmd","play");render(16);
        sent_on=sent_off=0;
        api->on_midi(instance,down,3,0);
        assert(render(16)>0&&sent_on>0);
        set("cmd","stop");render(64);
        assert(render(64)==0&&sent_off>=sent_on);
        api->on_midi(instance,up,3,0);render(16);
        assert(render(16)==0);
        printf("pause kind=%d: local audio silent, routed voices released before physical pad release\n",kind);
    }
    set("cmd","aprof_on");
    test_capture();
    test_shared_context();
    test_key_operation_ownership();
    api->get_param(instance,"status",status,sizeof(status));
    char *profile=strstr(status," aprof=1,");assert(profile);
    assert(strstr(status," rprof=1,"));
    printf("audio callback profile (desktop fixture, microseconds): %s\n",profile);
    set("cmd","aprof_off");
    api->get_param(instance,"status",status,sizeof(status));assert(strstr(status," aprof=0,")&&strstr(status," rprof=0,"));
    test_source_weaving();
    test_diagnostic_tone();
    test_field_lfos();
    api->destroy_instance(instance);return 0;
}
