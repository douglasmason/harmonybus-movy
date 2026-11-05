#ifdef HB_TEST_QUEUE_HANDOFF
#include "queue_handoff_audio.h"
#endif
/* Real HB -> chain -> Movy copy, persistence, Undo and abstract playback. */
static void test_queue_copy(void){
#ifdef HB_TEST_QUEUE_HANDOFF
    test_queue_handoff();
#endif
    set("cmd","stop");set("chord_select","off");render(8);
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 3 0 0\ncl 0 0 64 0 \ncl 3 0 64 0 0:1000:66:90:0\n");render(8);
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","3");
    set("cmd","tdrum 0 0");
    set("ch0:midi_fx1:chord_form","Triad");set("ch0:midi_fx1:chord_voicing","Close");
    set("ch0:midi_fx1:arp_playback","Together");set("ch0:midi_fx1:chord_queue_depth","Touch Phrase");
    set("ch0:midi_fx1:chord_queue_end","Loop");set("ch0:midi_fx1:chord_timing","1/4");
    set("ch0:midi_fx1:anticipation","On Grid");
    set("chord_queue","begin,0");set("chord_queue","0,0,1,2,1,0,1,12,0,0,5");
    set("chord_queue","0,7,1,2,1,0,1,12,0,0,3");set("chord_queue","commit");
    set("cmd","play");render(20);
    char info[256],token[17],command[128],before[2048],after[2048];
    assert(api->get_param(instance,"chord_copy_info_0",info,sizeof(info))>0);
    unsigned count=0,ticks=0,empty=0;
    assert(sscanf(info,"qc1|%16[^|]|%u|%u|%u",token,&count,&ticks,&empty)==4);
    assert(count==2&&ticks==192&&empty==254);
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",before,sizeof(before));
    int attacks=sent_on,releases=sent_off;
    snprintf(command,sizeof(command),"usnap 987;qcopy 0 1 %s;ucommit 987",token);set("cmd",command);
    api->get_param(instance,"chord_copy_result",info,sizeof(info));
    if(strcmp(info,"Copied - queue still live"))fprintf(stderr,"Copy reply: %s; command: %s\n",info,command);
    assert(!strcmp(info,"Copied - queue still live"));
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",after,sizeof(after));
    assert(!strcmp(before,after)&&sent_on==attacks&&sent_off==releases);
    static char saved[262144],unchanged[262144];
    api->get_param(instance,"state",saved,sizeof(saved));
    assert(strstr(saved,"\ncl 0 1 8 0 ")&&strstr(saved,"\nra 0 1 "));
    assert(strstr(saved,"\ncl 3 0 64 0 0:1000:66:90:0\n"));
    snprintf(command,sizeof(command),"qcopy 0 1 %s",token);set("cmd",command);
    api->get_param(instance,"chord_copy_result",info,sizeof(info));assert(strstr(info,"occupied"));
    api->get_param(instance,"state",unchanged,sizeof(unchanged));assert(!strcmp(saved,unchanged));
    set("cmd","qcopy 0 2 0");api->get_param(instance,"chord_copy_result",info,sizeof(info));assert(strstr(info,"changed"));
    api->get_param(instance,"state",unchanged,sizeof(unchanged));assert(!strcmp(saved,unchanged));
    set("cmd","uswap 987 988");api->get_param(instance,"state",unchanged,sizeof(unchanged));assert(!strstr(unchanged,"\ncl 0 1 "));
    set("cmd","uswap 988 989");api->get_param(instance,"state",unchanged,sizeof(unchanged));assert(!strcmp(saved,unchanged));
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",after,sizeof(after));assert(!strcmp(before,after));
    /* Clear the live override explicitly, reload, then launch the saved clip. */
    set("cmd","stop");set("chord_select","off");render(8);set("state",saved);render(8);
    /* Isolate conductor output for range measurement. Prior chain suites can
       leave the melody follower rendering accompaniment on the same channel. */
    set("cmd","mute 3 1;clipsel 0 1");sent_on=sent_off=0;capture_register=1;register_low=128;register_high=-1;
    set("cmd","play");render(8);
    if(register_low!=72||register_high!=79)fprintf(stderr,"Copied first range %d..%d; saved: %s\n",register_low,register_high,saved);
    assert(register_low==72&&register_high==79);
    register_low=128;register_high=-1;render(200);assert(register_low==55&&register_high==62);
    set("cmd","stop");render(8);capture_register=0;assert(sent_on==sent_off);
    puts("Queue Copy: native descriptors, atomic rejection, retained queue, Undo/redo, save/reload and original chord ranges pass");
}
