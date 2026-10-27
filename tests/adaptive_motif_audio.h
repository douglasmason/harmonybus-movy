/* Stored selector -> sequencer -> chain -> native resolver -> sounding PCM. */
static void test_adaptive_motif(void){
    set("state","movy1\nbpm 12000\nlink 0\ntk 3 0 0\ncl 3 0 16 0 \n");
    set("ch3:mix","1,0,0,0,0");set("ch3:midi_fx1:role","Conductor");
    set("ch3:midi_fx1:follower_root_policy","Explicit");set("ch3:midi_fx1:follower_explicit_root","A");
    set("ch3:midi_fx1:follower_scale","Harmonic Minor");set("ch3:midi_fx1:chord_mode","Off");
    set("ch3:midi_fx1:arp_playback","Together");set("ch3:midi_fx1:travel_map","None");
    render(8);
    char info[256],signature[64],command[4096],result[128],saved[65536];unsigned slot;
    assert(api->get_param(instance,"motif_clip_info_3",info,sizeof(info))>0);
    assert(sscanf(info,"%u,%63[^,]",&slot,signature)==2);
    int used=snprintf(command,sizeof(command),"mload 3 %u %s 0 384 9 8 0,384,65.100:80100003000003e8",slot,signature);
    for(int word=1;word<52;word++)used+=snprintf(command+used,sizeof(command)-used,",0");
    set("cmd",command);render(4);
    assert(api->get_param(instance,"motif_load_result",result,sizeof(result))>0);assert(!strncmp(result,"Written",7));
    assert(api->get_param(instance,"state",saved,sizeof(saved))>0);
    /* Restore the actual serialized clip, then vary harmony without rewriting it. */
    set("state",saved);render(8);
    for(int pass=0;pass<2;pass++){
        set("ch3:midi_fx1:follower_scale",pass?"Major":"Harmonic Minor");render(8);
        sent_on=sent_off=0;rendered_mask=0;
        set("cmd","play");long energy=render(64);set("cmd","stop");render(16);
        unsigned expected=1u<<(pass?4:6);
        if(!energy||rendered_mask!=expected)fprintf(stderr,"adaptive clip pass%d mask%x expected%x on%d off%d\n",pass,rendered_mask,expected,sent_on,sent_off);
        assert(energy>0&&rendered_mask==expected&&sent_on==1&&sent_off==1);assert(render(8)==0);
    }
    puts("adaptive motif clip: import, Set restore, changed harmony, exact PCM pitches and balanced releases pass");
}
