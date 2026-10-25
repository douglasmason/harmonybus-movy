/* The real host path must preserve semantic chords and regenerate Joint bass. */
static void test_joint_chords(void){
    set("cmd","stop");set("chord_select","off");set("chord_route","off");set("chtracks","1");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","Off");
    set("ch0:midi_fx1:master_transpose","C");set("ch0:midi_fx1:follower_explicit_root","C");set("ch0:midi_fx1:follower_scale","Major");
    set("ch1:midi_fx1:role","Follower");set("ch1:midi_fx1:render_channel","2");set("ch1:midi_fx1:chord_mode","Off");
    set("ch1:midi_fx1:arp_playback","Together");set("ch1:midi_fx1:retrigger_held","Off");
    set("joint_links","0,1,0,-2,0,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");set("chord_joint","0");render(16);
    sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
    set("chord_select","0,0,1,0,1,0,1,12");render(16);
    assert(routed_channel_on[1]>0);char status[256];unsigned serial,track,pitch;
    api->get_param(instance,"chord_step_input",status,sizeof(status));assert(sscanf(status,"%u,%u,%u",&serial,&track,&pitch)==3);assert(track==0&&pitch==60);
    char command[128];snprintf(command,sizeof(command),"usnap 97;cadd 0 0 0 %u;slen 0 0 0 60 48;ucommit 97",serial);set("cmd",command);
    static char saved[262144];api->get_param(instance,"state",saved,sizeof(saved));
    assert(strstr(saved,"\nra 0 0 "));assert(!strstr(saved,"\nra 1 "));
    set("chord_select","off");render(16);assert(sent_on==sent_off);
    /* Playback uses the same descriptor and follow route; no bass notes are baked in. */
    sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));set("cmd","play");render(120);set("cmd","stop");render(16);
    assert(routed_channel_on[1]>0);assert(sent_on==sent_off);
    /* Queue activations use the same Joint follow owner and close it on exit. */
    set("ch0:midi_fx1:chord_timing","1/4");set("ch0:midi_fx1:anticipation","On Grid");
    sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
    set("chord_queue","0,0,1,0,1,0,1,12");set("chord_queue","0,7,1,0,1,0,1,12");set("cmd","play");render(220);
    set("chord_joint","off");render(16);set("cmd","stop");render(16);
    assert(routed_channel_on[1]>=2);assert(sent_on==sent_off);
    set("joint_links","0,0,0,0,0,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");
    puts("Joint conductor knobs: real bass follow, full chord step capture, descriptor playback, queued activation and balanced releases pass");
}
