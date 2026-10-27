/* Actual Movy -> Schwung chain -> HarmonyBus, including temporary audition. */
static void test_comp_generator(void){
    set("cmd","stop");set("chord_select","off");render(16);
    set("state","movy1\nbpm 12000\nlink 0\ntk 2 0 0\n");
    set("chtracks","1");set("ch2:mix","1,0,0,0,0");
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","Off");
    set("ch0:midi_fx1:master_transpose","C");set("ch0:midi_fx1:follower_explicit_root","C");set("ch0:midi_fx1:follower_scale","Major");
    set("ch2:midi_fx1:role","Follower");set("ch2:midi_fx1:travel_map","Relative");set("ch2:midi_fx1:chord_mode","Conductor Chord");
    set("ch2:midi_fx1:chord_form","Triad");set("ch2:midi_fx1:arp_playback","Together");set("ch2:midi_fx1:arp_hold","Momentary");
    set("ch2:midi_fx1:render_channel","3");set("ch2:midi_fx1:render_velocity_percent","100");set("ch2:midi_fx1:play_bypass","Off");
    set("chord_route","3,2,2"); /* Generator temporarily owns comp even in direct-chord mode. */
    render(8);
    static char before[262144],after[262144],saved[262144];char info[256];
    assert(api->get_param(instance,"state",before,sizeof(before))>0);
    set("cmd","gexplore 2 0 0 64 23;play");render(100);
    set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;rendered_mask=0;render(800);set("cmd","gexplore off;stop");render(16);
    fprintf(stderr,"generator exploration on=%d off=%d mask=%x\n",sent_on,sent_off,rendered_mask);
    assert(sent_on>=6&&sent_on==sent_off&&rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)));
    assert(api->get_param(instance,"state",after,sizeof(after))>0);
    assert(!strcmp(before,after));
    set("cmd","gexplore 2 0 0 32 23;rec 2");render(1700); /* count-in and a first bar */
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0);
    if(strncmp(info,"Recording",9))fprintf(stderr,"generator recording: %s\n",info);
    assert(!strncmp(info,"Recording",9));
    set("cmd","gexplore 2 0 127 127 23");render(800);set("cmd","rec 2;stop");render(16);
    assert(api->get_param(instance,"state",saved,sizeof(saved))>0);
    assert(strstr(saved,"cg1 2 0 ")&&strstr(saved,"generator:complexity")&&strstr(saved,"generator:intensity"));
    assert(strstr(saved,":127"));set("state",saved);render(8);
    set("cmd","play");render(100);set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;rendered_mask=0;render(1000);set("cmd","stop");render(16);
    assert(sent_on>6&&sent_on==sent_off);
    /* Existing recipe audition is ephemeral, and physical Record's ordinary
       rec command overdubs it without creating another take or changing seed. */
    assert(api->get_param(instance,"state",before,sizeof(before))>0);
    set("cmd","gpreview 2 0 1 12;play");render(800);set("cmd","gexplore off;stop");render(8);
    assert(api->get_param(instance,"state",after,sizeof(after))>0&&!strcmp(before,after));
    set("cmd","usnap 930;rec 2");render(1700);
    set("cmd","gpreview 2 0 1 111");render(800);
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0&&!strncmp(info,"Overdub",7));
    set("cmd","rec 2;stop;ucommit 930");render(8);
    assert(api->get_param(instance,"state",after,sizeof(after))>0&&strcmp(before,after));
    set("cmd","uswap 930 931");render(4);
    assert(api->get_param(instance,"state",after,sizeof(after))>0&&!strcmp(before,after));
    set("cmd","uswap 931 932");render(4);
    assert(api->get_param(instance,"state",after,sizeof(after))>0&&strcmp(before,after));
    set("cmd","usnap 920;gbake 2 0;ucommit 920");render(2);
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0&&strstr(info,"Baked"));
    set("cmd","play");render(100);set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;render(1000);set("cmd","stop");render(16);assert(sent_on>6&&sent_on==sent_off);
    set("cmd","uswap 920 921");render(2);assert(api->get_param(instance,"state",after,sizeof(after))>0&&strstr(after,"cg1 2 0 "));
    set("chord_select","off");render(16);
    puts("Comp generator: temporary mapped audio, exclusive route, recording controls, Set recall, Bake and paired releases pass");
}
