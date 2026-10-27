/* Production Movy -> chain -> HB -> synth preview and recording boundaries. */
static void test_chord_discovery(void){
    set("cmd","stop");render(8);set("chord_select","off");set("chord_route","off");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 64 0 \n");render(8);
    set("ch0:mix","1,0,0,0,0");set("ch0:midi_fx1:role","Conductor");
    set("ch0:midi_fx1:render_channel","3");set("ch0:midi_fx1:chord_form","Triad");
    set("ch0:midi_fx1:arp_playback","Together");set("ch0:midi_fx1:chord_register","0");
    set("ch0:midi_fx1:chord_voicing","Close");set("ch0:midi_fx1:chord_inversion","Root");
    set("ch0:midi_fx1:chord_queue_depth","Touch Phrase");render(8);
    set("cmd","jrec 1 1");render(800);
    set("chord_queue","0,7,1,0,1,0,1,12");render(8);
    char queue_before[512],queue_after[512],probe[512];
    static char state_before[262144],state_after[262144];
    api->get_param(instance,"state",state_before,sizeof(state_before));
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",queue_before,sizeof(queue_before));
    sent_on=sent_off=0;
    for(int variant=0;variant<7;variant++){
        char request[128];snprintf(request,sizeof(request),"0,%d;0,0,2,3,0,1,12,3,4,0",variant);
        set("ch0:midi_fx1:hb_chord_discovery_probe",request);
        api->get_param(instance,"ch0:midi_fx1:hb_chord_discovery_probe",probe,sizeof(probe));
        assert(!strncmp(probe,"cd1|",4));
        set("ch0:midi_fx1:hb_chord_discovery_audition","on");
        assert(render(8)>0&&sent_on>0);
        set("ch0:midi_fx1:hb_chord_discovery_audition","off");render(8);
        assert(render(8)==0&&sent_on==sent_off);
    }
    api->get_param(instance,"state",state_after,sizeof(state_after));
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",queue_after,sizeof(queue_after));
    assert(!strcmp(state_before,state_after)&&!strstr(state_after,"\nra 0 "));
    assert(!strcmp(queue_before,queue_after));
    set("cmd","stop");render(8);
    puts("Chord discovery: seven real PCM previews, balanced routed notes, unchanged armed recording and pending queue pass");
}
