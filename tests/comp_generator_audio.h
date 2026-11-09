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
    assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
    set("cmd","gexplore 2 0 0 64 23;play");render(100);
    set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;rendered_mask=0;render(800);set("cmd","gexplore off;stop");render(16);
    fprintf(stderr,"generator exploration on=%d off=%d mask=%x\n",sent_on,sent_off,rendered_mask);
    assert(sent_on>=6&&sent_on==sent_off&&rendered_mask==((1u<<2)|(1u<<6)|(1u<<9)));
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0);
    assert(!strcmp(before,after));
    set("cmd","gexplore 2 0 0 32 23;rec 2");render(1700); /* count-in and a first bar */
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0);
    if(strncmp(info,"Recording",9))fprintf(stderr,"generator recording: %s\n",info);
    assert(!strncmp(info,"Recording",9));
    set("cmd","gexplore 2 0 127 127 23");render(800);set("cmd","rec 2;stop");render(16);
    assert(api->get_param(instance,"persistent_state",saved,sizeof(saved))>0);
    assert(strstr(saved,"cg1 2 0 ")&&strstr(saved,"generator:complexity")&&strstr(saved,"generator:intensity"));
    assert(strstr(saved,":127"));set("state",saved);render(8);
    set("cmd","play");render(100);set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;rendered_mask=0;render(1000);set("cmd","stop");render(16);
    assert(sent_on>6&&sent_on==sent_off);
    /* Existing recipe audition is ephemeral, and physical Record's ordinary
       rec command overdubs it without creating another take or changing seed. */
    assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
    set("cmd","gpreview 2 0 1 12;play");render(800);set("cmd","gexplore off;stop");render(8);
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    set("cmd","usnap 930;rec 2");render(1700);
    set("cmd","gpreview 2 0 1 111");render(800);
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0&&!strncmp(info,"Overdub",7));
    set("cmd","rec 2;stop;ucommit 930");render(8);
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&strcmp(before,after));
    set("cmd","uswap 930 931");render(4);
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    set("cmd","uswap 931 932");render(4);
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&strcmp(before,after));
    set("cmd","usnap 920;gbake 2 0;ucommit 920");render(2);
    assert(api->get_param(instance,"generator_info_2",info,sizeof(info))>0&&strstr(info,"Baked"));
    set("cmd","play");render(100);set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;render(1000);set("cmd","stop");render(16);assert(sent_on>6&&sent_on==sent_off);
    set("cmd","uswap 920 921");render(2);assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&strstr(after,"cg1 2 0 "));
    set("chord_select","off");render(16);
    puts("Comp generator: temporary mapped audio, exclusive route, recording controls, Set recall, Bake and paired releases pass");
    /* Every Bass source shares the production mapper and outgoing MIDI route.
       Start from chord/arp settings that the temporary source must restore. */
    for(int mapping=0;mapping<2;mapping++)for(int style=4;style<8;style++){
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\n");
        set("ch1:mix","1,0,0,0,0");set("ch1:midi_fx1:role","Follower");
        set("ch1:midi_fx1:travel_map",mapping?"Closest Split":"Relative");
        set("ch1:midi_fx1:chord_mode","Conductor Chord");set("ch1:midi_fx1:arp_playback","Repeat Arp");set("ch1:midi_fx1:arp_hold","Latch - Single");
        set("ch1:midi_fx1:render_channel","2");set("ch1:midi_fx1:render_velocity_percent","100");set("ch1:midi_fx1:play_bypass","Off");
        set("joint_links","0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");
        set("chord_route","3,2,0,1");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        char initial_mode[64],initial_hold[64],restored[64];
        assert(api->get_param(instance,"ch1:midi_fx1:chord_mode",initial_mode,sizeof(initial_mode))>0);
        assert(api->get_param(instance,"ch1:midi_fx1:arp_hold",initial_hold,sizeof(initial_hold))>0);
        char command[128];snprintf(command,sizeof(command),"gexplore 1 %d 127 64 23;play",style);
        sent_on=sent_off=0;rendered_mask=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
        set("cmd",command);render(800);set("chord_select","0,2,1,0,1,0,1,12");render(1000);
        set("cmd","gexplore off;stop");render(16);
        fprintf(stderr,"bass generator style=%d map=%d on=%d off=%d mask=%x\n",style,mapping,sent_on,sent_off,rendered_mask);
        assert(sent_on>=4&&sent_on==sent_off&&routed_channel_on[1]==(unsigned)sent_on);
        assert((rendered_mask&((1u<<2)|(1u<<9)))!=0);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
        assert(api->get_param(instance,"ch1:midi_fx1:chord_mode",restored,sizeof(restored))>0&&!strcmp(restored,initial_mode));
        assert(api->get_param(instance,"ch1:midi_fx1:arp_hold",restored,sizeof(restored))>0&&!strcmp(restored,initial_hold));
    }
    set("chord_select","off");render(8);
    set("cmd","gexplore 1 4 64 64 31;rec 1");render(1800);
    assert(api->get_param(instance,"generator_info_1",info,sizeof(info))>0&&!strncmp(info,"Recording",9));
    set("cmd","gexplore 1 7 127 100 31");render(850);set("cmd","rec 1;stop");render(8);
    assert(api->get_param(instance,"persistent_state",saved,sizeof(saved))>0&&strstr(saved,"cg1 1 0 ")&&strstr(saved,"Bass-Generator"));
    set("state",saved);render(8);set("cmd","usnap 940;gpreview 1 0 1 110;rec 1");render(1800);set("cmd","rec 1;stop;ucommit 940");render(8);
    assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&strcmp(after,saved));
    set("cmd","uswap 940 941");render(8);assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(after,saved));
    set("cmd","gbake 1 0");render(8);assert(api->get_param(instance,"generator_info_1",info,sizeof(info))>0&&strstr(info,"Baked"));
    sent_on=sent_off=0;set("cmd","play");render(1000);set("cmd","stop");render(16);assert(sent_on>4&&sent_on==sent_off);
    puts("Bass generator: four styles, both harmonic maps, exclusive MIDI channel, temporary setting restore, recording, overdub Undo, reload and Bake pass");

    /* Both sources share the production clock, retaining independent MIDI,
       captured settings, recording destinations and transient controls. */
    for(int record_track=1;record_track<=2;record_track++){
        const int other_track=3-record_track;
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\n");
        set("ch1:midi_fx1:chord_mode","Conductor Chord");set("ch1:midi_fx1:arp_playback","Together");set("ch1:midi_fx1:arp_hold","Momentary");
        set("ch1:midi_fx1:travel_map","Relative");set("ch1:midi_fx1:render_channel","2");
        set("ch2:midi_fx1:chord_mode","Conductor Chord");set("ch2:midi_fx1:arp_playback","Together");set("ch2:midi_fx1:arp_hold","Momentary");
        set("ch2:midi_fx1:travel_map","Relative");set("ch2:midi_fx1:render_channel","3");
        set("chord_route","3,2,0,1");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
        duet_capture=1;memset(duet_balance,0,sizeof(duet_balance));
        set("cmd","gexplore 2 0 64 64 13;gexplore 1 4 64 64 17;play");render(1300);
        assert(routed_channel_on[1]>3&&routed_channel_on[2]>3);
        set("cmd","gexplore 1 off");render(16);
        unsigned bass_attacks=routed_channel_on[1],comp_attacks=routed_channel_on[2];render(800);
        assert(routed_channel_on[1]==bass_attacks&&routed_channel_on[2]>comp_attacks);
        set("cmd","gexplore 1 4 64 64 17;gexplore 2 off");render(16);
        bass_attacks=routed_channel_on[1];comp_attacks=routed_channel_on[2];render(800);
        assert(routed_channel_on[1]>bass_attacks&&routed_channel_on[2]==comp_attacks);
        set("cmd","gexplore off;stop");render(16);duet_capture=0;
        fprintf(stderr,"actor duet record_track=%d on=%d off=%d\n",record_track,sent_on,sent_off);
        for(int channel=0;channel<16;channel++)for(int pitch=0;pitch<128;pitch++)assert(duet_balance[channel][pitch]==0);
        assert(sent_on==sent_off);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
        duet_capture=1;memset(duet_balance,0,sizeof(duet_balance));
        set("cmd","gexplore 2 0 64 64 13;gexplore 1 4 64 64 17;usnap 950");
        char command[128],owner_suffix[32],recipe[32],other_recipe[32],info_key[48];
        snprintf(command,sizeof(command),"rec %d",record_track);set("cmd",command);render(1800);
        snprintf(info_key,sizeof(info_key),"generator_info_%d",other_track);snprintf(owner_suffix,sizeof(owner_suffix),"|%d|0",record_track);
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&!strncmp(info,"Exploring",9));
        assert(!strcmp(info+strlen(info)-strlen(owner_suffix),owner_suffix));
        set("cmd","gexplore 2 0 100 100 13;gexplore 1 4 110 110 17");render(800);
        snprintf(command,sizeof(command),"rec %d;ucommit 950",other_track);set("cmd",command);render(16);
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&!strncmp(info,"Exploring",9));
        snprintf(recipe,sizeof(recipe),"cg1 %d 0 ",record_track);snprintf(other_recipe,sizeof(other_recipe),"cg1 %d 0 ",other_track);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&strstr(after,recipe)&&!strstr(after,other_recipe));
        set("cmd","uswap 950 951");render(16);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&!strncmp(info,"Exploring",9));
        set("cmd","stop");render(16);duet_capture=0;
        for(int channel=0;channel<16;channel++)for(int pitch=0;pitch<128;pitch++)assert(duet_balance[channel][pitch]==0);
    }
    puts("Actor duet: simultaneous production MIDI, independent stops, both Record destinations, transient companion automation and Undo retaining audition pass");

    /* Each paired phrase runs through HB mapping and the production gate owner,
       including the answer bars and the four-bar wrap, without persisting it. */
    for(int phrase=0;phrase<4;phrase++){
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\n");
        set("ch1:midi_fx1:travel_map","Relative");set("ch1:midi_fx1:render_channel","2");
        set("ch2:midi_fx1:travel_map","Relative");set("ch2:midi_fx1:render_channel","3");
        set("chord_route","3,2,0,1");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
        duet_capture=1;memset(duet_balance,0,sizeof(duet_balance));
        char command[128];snprintf(command,sizeof(command),"gexplore 2 %d 127 96 37;gexplore 1 %d 127 96 37;play",8+phrase,12+phrase);
        set("cmd",command);render(3400);
        assert(routed_channel_on[1]>8&&routed_channel_on[2]>8);
        set("cmd","stop");render(16);duet_capture=0;
        for(int channel=0;channel<16;channel++)for(int pitch=0;pitch<128;pitch++)assert(duet_balance[channel][pitch]==0);
        assert(sent_on==sent_off);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    }
    puts("Actor phrases: four paired styles, full phrase wraps, mapped production MIDI and balanced releases without persistent changes pass");

    /* Save/reuse the actual abstract recipe through production HB for each actor. */
    for(int actor_track=1;actor_track<=2;actor_track++){
        const int style=actor_track==1?12:8;const char *kind=actor_track==1?"bass":"comp";
        char command[40200],parameter[64],recipe_marker[48],info_key[48];static char entry[40000];
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\n");
        set("ch1:midi_fx1:travel_map","Relative");set("ch1:midi_fx1:render_channel","2");
        set("ch2:midi_fx1:travel_map","Relative");set("ch2:midi_fx1:render_channel","3");
        set("chord_route","3,2,0,1");render(8);
        snprintf(command,sizeof(command),"gexplore %d %d 0 32 47;rec %d",actor_track,style,actor_track);set("cmd",command);render(1800);
        snprintf(command,sizeof(command),"gexplore %d %d 110 100 47",actor_track,style+1);set("cmd",command);render(850);
        snprintf(command,sizeof(command),"rec %d;stop",actor_track);set("cmd",command);render(16);
        snprintf(parameter,sizeof(parameter),"part_export_%d",actor_track);
        assert(api->get_param(instance,parameter,entry,sizeof(entry))>0&&!strncmp(entry,"70617274320a",12));
        char summary[256],style_list[64],summary_name[48],expected_styles[32];int summary_steps=0,summary_automation=0;
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        snprintf(parameter,sizeof(parameter),"part_summary_%d",actor_track);
        assert(api->get_param(instance,parameter,summary,sizeof(summary))>0);
        assert(sscanf(summary,"ps1|%d|%63[^|]|%d|%47s",&summary_steps,style_list,&summary_automation,summary_name)==4);
        snprintf(expected_styles,sizeof(expected_styles),"%d,%d",style,style+1);
        assert(summary_steps>0&&summary_steps%16==0&&summary_automation==7&&!strcmp(style_list,expected_styles));
        assert(!strcmp(summary_name,actor_track==1?"Bass-Generator":"Comp-Generator"));
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\n");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        snprintf(command,sizeof(command),"guser %d %s %s;play",actor_track,kind,entry);
        sent_on=sent_off=0;memset(routed_channel_on,0,sizeof(routed_channel_on));duet_capture=1;memset(duet_balance,0,sizeof(duet_balance));
        set("cmd",command);render(800);
        snprintf(command,sizeof(command),"guser %d edit 0 12;guser %d edit 1 127;guser %d edit 2 %d",actor_track,actor_track,actor_track,style+2);set("cmd",command);render(800);
        snprintf(command,sizeof(command),"grestore %d 0",actor_track);set("cmd",command);render(8);
        snprintf(info_key,sizeof(info_key),"generator_info_%d",actor_track);
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&strstr(info,"Restore saved controls"));
        assert(!strncmp(info,"Exploring",9));
        render(1800);set("cmd","stop");render(16);duet_capture=0;
        assert(routed_channel_on[actor_track]>6&&sent_on==sent_off);
        for(int channel=0;channel<16;channel++)for(int pitch=0;pitch<128;pitch++)assert(duet_balance[channel][pitch]==0);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
        snprintf(command,sizeof(command),"guser %d %s %s;usnap 970;rec %d",actor_track,kind,entry,actor_track);set("cmd",command);render(1800);
        snprintf(command,sizeof(command),"gpreview %d 0 2 %d",actor_track,style+3);set("cmd",command);render(800);
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&!strncmp(info,"Overdub",7));
        const char *style_info=strchr(info,'|');assert(style_info);style_info=strchr(style_info+1,'|');assert(style_info&&atoi(style_info+1)==style+3);
        snprintf(command,sizeof(command),"rec %d;ucommit 970;stop",actor_track);set("cmd",command);render(16);
        snprintf(recipe_marker,sizeof(recipe_marker),"cg1 %d 0 ",actor_track);
        assert(api->get_param(instance,"persistent_state",saved,sizeof(saved))>0&&strstr(saved,recipe_marker)&&strstr(saved,"generator:intensity"));
        set("state",saved);render(8);sent_on=sent_off=0;
        snprintf(command,sizeof(command),"gpreview %d 0 1 12;play",actor_track);set("cmd",command);render(800);
        snprintf(command,sizeof(command),"grestore %d 0",actor_track);set("cmd",command);render(8);
        assert(api->get_param(instance,info_key,info,sizeof(info))>0&&!strncmp(info,"Preview",7)&&strstr(info,"Restore saved controls"));
        render(1000);set("cmd","stop");render(16);assert(sent_on>4&&sent_on==sent_off);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(saved,after));
        set("cmd","uswap 970 971");render(8);assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    }
    puts("Generator user recipes: both actors export abstract curves, audition without writes, Record/overdub/reload and Undo through production HB pass");

    /* The spatial source retains the same HB mapping and gate owner on every
       follower actor. Moving the conductor transposes the next cloud attack. */
    for(int actor=0;actor<3;actor++){
        const int track=actor==0?2:actor==1?1:3,style=16+actor;
        char parameter[64],command[192],view[32768];
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\ntk 3 0 0\n");
        set("ch0:midi_fx1:render_channel","Off");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:role",track);set(parameter,"Follower");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:travel_map",track);set(parameter,actor==2?"None":"Relative");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:chord_mode",track);set(parameter,"Conductor Chord");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:arp_hold",track);set(parameter,"Momentary");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:render_channel",track);set(parameter,"3");
        set("chord_route","3,2,2");set("chord_select","0,0,1,0,1,0,1,12");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        snprintf(command,sizeof(command),"gexplore %d %d 127 100 71 0 127 20 64 0 64 0;gcloud %d 0 127 64 127;play",track,style,track);
        set("cmd",command);sent_on=sent_off=0;rendered_mask=0;render(500);
        assert(sent_on>2&&rendered_mask==1u);
        set("chord_select","0,2,1,0,1,0,1,12");render(8);
        snprintf(command,sizeof(command),"gcloud %d 0 127 64 127",track);set("cmd",command);
        rendered_mask=0;render(500);assert(rendered_mask==(1u<<2));
        snprintf(parameter,sizeof(parameter),"cloud_view_%d",track);assert(api->get_param(instance,parameter,view,sizeof(view))>0&&strstr(view,"cf1|"));
        set("cmd","gexplore off;stop");render(16);assert(sent_on==sent_off);
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:travel_map",track);assert(api->get_param(instance,parameter,view,sizeof(view))>0&&!strcmp(view,actor==2?"None":"Relative"));
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    }
    puts("Follower cloud: Comp, Bass and Melody follow conductor changes through production HB, preserve temporary state and balance every release");

    /* Euclidean sources follow live conductor changes through the real HB
       renderer, with the same release owner and no persistent audition writes. */
    for(int actor=0;actor<2;actor++){
        const int track=actor?1:2,style=actor?20:19;
        char parameter[64],command[128];
        set("cmd","stop");set("chord_select","off");render(16);
        set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ntk 2 0 0\n");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:role",track);set(parameter,"Follower");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:travel_map",track);set(parameter,"Relative");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:chord_mode",track);set(parameter,"Conductor Chord");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:chord_form",track);set(parameter,"Triad");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:arp_playback",track);set(parameter,"Together");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:arp_hold",track);set(parameter,"Momentary");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:rhythm_gen_pattern",track);set(parameter,"Off");
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:render_channel",track);set(parameter,"3");
        set("chord_route","3,2,2");set("chord_select","0,0,1,0,1,0,1,12");render(8);
        assert(api->get_param(instance,"persistent_state",before,sizeof(before))>0);
        snprintf(command,sizeof(command),"gexplore %d %d 32 64 1 0 3 7 0 0;play",track,style);
        set("cmd",command);sent_on=sent_off=0;rendered_mask=0;render(500);
        assert(sent_on>2&&rendered_mask==(actor?1u:((1u<<0)|(1u<<4)|(1u<<7))));
        set("chord_select","0,2,1,0,1,0,1,12");render(8);rendered_mask=0;render(500);
        assert(rendered_mask==(actor?(1u<<2):((1u<<2)|(1u<<6)|(1u<<9))));
        set("cmd","gexplore off;stop");render(16);assert(sent_on==sent_off);
        assert(api->get_param(instance,"persistent_state",after,sizeof(after))>0&&!strcmp(before,after));
    }
    puts("Euclidean followers: real Comp/Bass harmony mapping, temporary persistence and paired releases pass");
    /* Strong and soft hits traverse the production renderer; both actors
       release all rendered notes when the exploration stops. */
    for(int actor=0;actor<2;actor++){
        const int track=actor?1:2,style=actor?20:19;
        char parameter[64],command[128];
        snprintf(parameter,sizeof(parameter),"ch%d:midi_fx1:render_velocity_percent",track);set(parameter,"100");
        snprintf(command,sizeof(command),"gexplore %d %d 32 64 1 0 3 7 0 0 1 60 25;play",track,style);
        source_velocity_count=0;capture_source_velocity=1;sent_on=sent_off=0;
        set("cmd",command);render(200);set("cmd","gexplore off;stop");render(16);capture_source_velocity=0;
        int strong=0,soft=0;for(int index=0;index<source_velocity_count;index++){assert(source_velocities[index]==90||source_velocities[index]==36);strong+=source_velocities[index]==90;soft+=source_velocities[index]==36;}
        assert(strong>0&&soft>0&&sent_on==sent_off);
    }
    puts("Euclidean expression: accented/soft velocities survive production Comp/Bass rendering with paired releases");
}
