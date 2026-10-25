static void queue_status(int count,const char *current,const char *next){
    char text[256],expected[128];
    assert(api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",text,sizeof(text))>0);
    snprintf(expected,sizeof(expected),"cq1|%d|",count);assert(!strncmp(text,expected,strlen(expected)));
    char actual_current[64],actual_next[64];
    assert(sscanf(text,"cq1|%*d|%*f|%63[^|]|%63[^|]",actual_current,actual_next)==2);
    assert(!strncmp(actual_current,current,strlen(current))&&!strncmp(actual_next,next,strlen(next)));
    /* Native spelling may include a form suffix; the timeline's root is exact. */
    char context[2048];api->get_param(instance,"ch0:midi_fx1:harmony_source_snapshot",context,sizeof(context));
    int root=!strcmp(current,"C")?0:!strcmp(current,"G")?7:!strcmp(current,"F")?5:2;
    snprintf(expected,sizeof(expected),"\"root\":%d",root);assert(strstr(context,expected));
}
static void test_chord_queue(void){
    set("cmd","stop");render(8);set("chord_select","off");set("chord_route","off");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 64 0 \n");render(4);
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","3");
    set("ch0:midi_fx1:master_transpose","C");set("ch0:midi_fx1:follower_explicit_root","C");set("ch0:midi_fx1:follower_scale","Major");
    set("ch0:midi_fx1:chord_form","Triad");set("ch0:midi_fx1:arp_playback","Together");
    set("ch0:midi_fx1:chord_queue_depth","1");set("ch0:midi_fx1:chord_timing","1/4");set("ch0:midi_fx1:anticipation","On Grid");render(8);
    sent_on=sent_off=0;
    set("chord_queue","0,0,1,0,1,0,1,12");render(8);queue_status(0,"C","--");
    set("chord_queue","0,7,1,0,1,0,1,12");set("chord_queue","0,5,1,0,1,0,1,12");render(8);queue_status(2,"C","G");
    set("cmd","play");render(40);queue_status(2,"C","G");
    render(160);queue_status(1,"G","F");render(175);queue_status(0,"F","--");
    unsigned before=sent_on;render(800);queue_status(0,"F","--");assert((unsigned)sent_on==before);
    set("chord_queue","0,2,1,0,1,0,1,12");render(200);queue_status(0,"D","--");
    set("cmd","stop");render(16);
    if(sent_on!=sent_off)fprintf(stderr,"queue MIDI on=%d off=%d\n",sent_on,sent_off);
    assert(sent_on>0&&sent_on==sent_off);
    char status[256];api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",status,sizeof(status));assert(!strcmp(status,"--"));
    /* Queueing does not write ahead into the clip: Record captures activations. */
    set("ch0:midi_fx1:render_channel","Off");set("cmd","jrec 1 1");render(800);
    set("chord_queue","0,0,1,0,1,0,1,12");
    static char saved[262144],before_enqueue[262144];api->get_param(instance,"state",before_enqueue,sizeof(before_enqueue));
    set("chord_queue","0,7,1,0,1,0,1,12");api->get_param(instance,"state",saved,sizeof(saved));
    assert(!strcmp(before_enqueue,saved));
    render(440);set("cmd","stop");render(16);api->get_param(instance,"state",saved,sizeof(saved));
    const char *first=strstr(saved,"\nra 0 ");assert(first&&strstr(first+1,"\nra 0 "));
    /* Record may already belong to another track before Chord Play opens. */
    const char *modes[]={"chord_select","chord_queue"};
    for(int mode=0;mode<2;mode++){
        set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ntk 3 0 0\ncl 0 0 64 0 0:1000:60:90:0\ncl 0 1 64 0 0:1000:65:80:0\ncl 3 0 64 0 0:1000:66:90:0\n");
        set("cmd","play");render(16);set("cmd","rec 3;clipsel 0 1");
        set("ch0:midi_fx1:chord_queue_depth","1");set(modes[mode],"0,0,1,0,1,0,1,12");render(440);set("cmd","stop");render(8);
        api->get_param(instance,"state",saved,sizeof(saved));
        assert(strstr(saved,"\nra 0 0 ")&&!strstr(saved,"\nra 0 1 "));
        assert(strstr(saved,"\ncl 0 1 64 0 0:1000:65:80:0\n"));
        assert(strstr(saved,"\ncl 3 0 64 0 0:1000:66:90:0\n"));
        assert(!strstr(saved,"0:1000:60:90:0"));
    }
    /* A buffered loop uses the same host note and recording path. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 64 0 \n");render(8);
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","3");
    set("ch0:midi_fx1:chord_queue_depth","2");set("ch0:midi_fx1:chord_queue_end","Loop");
    set("ch0:midi_fx1:chord_timing","1/4");set("ch0:midi_fx1:anticipation","On Grid");
    set("cmd","jrec 1 1");render(8);sent_on=sent_off=0;
    set("chord_queue","0,0,1,0,1,0,1,12");render(500);assert(!sent_on);
    api->get_param(instance,"state",saved,sizeof(saved));assert(!strstr(saved,"\nra 0 "));
    set("chord_queue","0,7,1,0,1,0,1,12");render(700);assert(sent_on>0);
    api->get_param(instance,"ch0:midi_fx1:hb_chord_queue_status",status,sizeof(status));assert(strstr(status,"|0|2|1"));
    before=sent_on;render(700);assert((unsigned)sent_on>before);
    set("cmd","stop");render(16);assert(sent_on==sent_off);
    api->get_param(instance,"state",saved,sizeof(saved));assert(strstr(saved,"\nra 0 "));
    puts("Queued Chord Play: stopped preload survives start, scheduled MIDI, empty hold, refill, balanced releases and activation recording pass");
}
