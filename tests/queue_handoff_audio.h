/* Compare the actual attack schedule against an uninterrupted native queue. */
static void test_queue_handoff_tempo(int tempo){
    int attacks[4][1000],releases[4][1000];unsigned masks[4][1000];
    char info[256],token[17],command[128],status[8192],queue[2048];
    for(int transfer=0;transfer<4;transfer++){
        set("cmd","stop");set("chord_select","off");render(8);
        set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 3 0 0\ncl 0 0 64 0 \ncl 3 0 64 0 0:1000:66:90:0\n");render(8);
        snprintf(command,sizeof(command),"bpm %d;tdrum 0 0;mute 3 1",tempo);set("cmd",command);
        set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","3");
        set("ch0:midi_fx1:chord_form","Triad");set("ch0:midi_fx1:chord_voicing","Close");
        set("ch0:midi_fx1:arp_playback","Together");set("ch0:midi_fx1:chord_queue_depth","Touch Phrase");
        set("ch0:midi_fx1:chord_queue_end","Loop");set("ch0:midi_fx1:chord_timing","1/4");
        set("ch0:midi_fx1:anticipation","On Grid");
        set("chord_queue","begin,0");set("chord_queue","0,0,1,2,1,0,1,12,0,0,5");
        set("chord_queue","0,7,1,2,1,0,1,12,0,0,3");set("chord_queue","commit");
        set("cmd","play");
        for(int block=0;block<1000;block++){
            if(transfer&&block==20){
                api->get_param(instance,"chord_copy_info_0",info,sizeof(info));
                assert(sscanf(info,"qc1|%16[^|]|",token)==1);
                snprintf(command,sizeof(command),"usnap 991;qhandoff 0 1 %s;%sucommit 991",token,transfer==3?"clipdelat 0 1;":"");set("cmd",command);
                api->get_param(instance,"chord_copy_result",info,sizeof(info));
                if(transfer==3)assert(strstr(info,"cancelled"));
                else assert(strstr(info,"handoff at cycle"));
            }
            if(transfer==2&&block==30)set("cmd","uswap 991 992");
            if(block==24)set("cmd","watch 3 0;non 3 66 90;nof 3 66");
            int before=sent_on,off_before=sent_off;rendered_mask=0;render(1);
            attacks[transfer][block]=sent_on-before;releases[transfer][block]=sent_off-off_before;masks[transfer][block]=rendered_mask;
        }
        api->get_param(instance,"status",status,sizeof(status));assert(strstr(status,"play=1"));assert(strstr(status,"trk=3"));
        if(transfer==1){
            api->get_param(instance,"chord_copy_result",info,sizeof(info));
            if(!strstr(info,"Handoff complete"))fprintf(stderr,"handoff final: %s; %s\n",info,status);
            assert(strstr(info,"Handoff complete"));
            assert(strstr(status,"sess=03.1.-.1"));
            api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",queue,sizeof(queue));assert(!strcmp(queue,"--"));
        }
        if(transfer>=2){
            api->get_param(instance,"chord_copy_result",info,sizeof(info));assert(strstr(info,"cancelled"));
            api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",queue,sizeof(queue));assert(strcmp(queue,"--"));
            assert(strstr(status,"sess=01."));
        }
        set("cmd","stop");render(8);
        if(transfer==1){
            set("cmd","uswap 991 992");api->get_param(instance,"status",status,sizeof(status));
            assert(strstr(status,"sess=01."));
        }
    }
    for(int transfer=1;transfer<4;transfer++)for(int block=0;block<1000;block++){
        if(attacks[0][block]!=attacks[transfer][block]||masks[0][block]!=masks[transfer][block])
            fprintf(stderr,"handoff block %d: baseline %d/%u transferred %d/%u\n",block,attacks[0][block],masks[0][block],attacks[transfer][block],masks[transfer][block]);
        assert(attacks[0][block]==attacks[transfer][block]&&masks[0][block]==masks[transfer][block]);
        assert(releases[0][block]==releases[transfer][block]);
    }
    puts("Queue handoff: production attacks/pitches match the uninterrupted queue block-for-block; transport, saved clip, Undo before/after transfer and continued playback pass");
}

static void test_queue_handoff(void){test_queue_handoff_tempo(12000);test_queue_handoff_tempo(24000);}
