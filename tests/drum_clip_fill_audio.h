/* Native Fill command -> stored clip -> production scheduler/DSP -> channel 1. */
static void test_drum_clip_fill(void){
#ifdef HB_TEST_CLIP_FILL
    set("cmd","stop");render(16);set("chtracks","1");set("jointlinks","off");
    set("state","movy1\nbpm 12000\nlink 0\ntk 4 0 1\ntk 8 0 0\ncl 4 0 16 0 0:24:36:117:0;0:24:38:73:0;96:48:42:41:4\ndrumout 4 1\ndrumout 8 1\n");render(8);
    char preview[4096],target[80],result[256],command[256];
    assert(api->get_param(instance,"fill_preview_4_0_99_99_2_2",preview,sizeof(preview))>0);
    assert(strstr(preview,"|drums|36,38,42"));char *separator=strchr(preview,'|');assert(separator);*separator=0;
    assert(api->get_param(instance,"fill_target_8_0",target,sizeof(target))>0);
    snprintf(command,sizeof(command),"clipfill 8 0 %s 4_0_99_99_2_2 %s drums own",target,preview);
    set("cmd","usnap 310");set("cmd",command);render(2);set("cmd","ucommit 310");
    assert(api->get_param(instance,"part_result",result,sizeof(result))>0);assert(!strncmp(result,"Filled",6));
    static char saved[262144];assert(api->get_param(instance,"state",saved,sizeof(saved))>0);
    for(int pass=0;pass<2;pass++){
        if(pass){set("state",saved);render(8);}
        drum_clip_packet_count=sent_on=sent_off=rejected=0;drum_clip_capture=1;
        set("cmd","play");render(1100);set("cmd","stop");render(8);drum_clip_capture=0;
        /* 3.19 seconds: two complete groups in the two-bar phrase, before wrap. */
        assert(sent_on==6&&sent_off==6&&rejected==0);
        const int pitches[6]={36,38,42,36,38,42},velocities[6]={117,73,41,117,73,41};
        int onset=0;int balance[128]={0};
        for(int event=0;event<drum_clip_packet_count;event++){
            const int *packet=drum_clip_packets[event];
            if((packet[0]&0xf0)==0x90&&packet[2]){
                assert(onset<6&&packet[1]==pitches[onset]&&packet[2]==velocities[onset]);onset++;balance[packet[1]]++;
            }else{balance[packet[1]]--;assert(balance[packet[1]]>=0);}
        }
        assert(onset==6);for(int pitch=0;pitch<128;pitch++)assert(balance[pitch]==0);
    }
    set("state","movy1\nbpm 12000\nlink 0\n");render(8);
    puts("Drum Clip Fill: production preview/write, channel 1, simultaneous lanes, exact accents, repeated phrase, Set recall and paired releases pass");
#endif
}
