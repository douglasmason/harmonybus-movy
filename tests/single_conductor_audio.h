/* The shared source uses ordinary HB interpretation and existing derived gates. */
static void test_single_conductor_output(void){
    set("cmd","stop");render(32);set("chtracks","1");set("chord_route","off");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 0:200:60:100:0\n");
    for(int track=0;track<16;track++){
        char key[80];snprintf(key,sizeof(key),"ch%d:midi_fx1:render_channel",track);set(key,"Off");
        if(track%4==0){snprintf(key,sizeof(key),"ch%d:midi_fx1:role",track);set(key,track==0?"Conductor":"Off");}
    }
    set("ch0:midi_fx1:chord_mode","Off");
    set("ch5:midi_fx1:role","Follower");set("ch5:midi_fx1:render_channel","2");
    set("ch5:midi_fx1:chord_mode","Off");set("ch5:midi_fx1:arp_playback","Together");
    set("ch5:midi_fx1:travel_map","None");set("ch5:midi_fx1:content_map","Free");set("ch5:midi_fx1:retrigger_held","Off");
    set("joint_links","0,0,0,0,0,0,0;4,1,0,-1,0,0,0;8,0,0,0,0,0,0;12,0,0,0,0,0,0");
    render(32);sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
    set("cmd","play");render(32);
    assert(sent_on==1&&routed_channel_on[1]==1&&sent_off==0);
    set("joint_links","0,0,0,0,0,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");render(16);
    assert(sent_off==1);set("cmd","stop");render(32);assert(sent_off==1);
    puts("Single conductor: track 1 clip drives bank-2 bass on channel 2; route changes release the original derived owner exactly once");
}
