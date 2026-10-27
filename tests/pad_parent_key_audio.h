/* Physical pad input through Movy, Schwung, HB and the sounding PCM probe.
 * Input coordinates remain in C; HB alone resolves the destination key. */
static void parent_pad_map(int offset){
    static const int major[]={0,2,4,5,7,9,11};
    char mapping[256];int used=snprintf(mapping,sizeof(mapping),"3");
    for(int pad=0;pad<32;pad++){
        int degree=pad%8-offset,octave=degree/7,index=degree%7;
        if(index<0){index+=7;octave--;}
        int pitch=60+12*(pad/8+octave)+major[index];
        used+=snprintf(mapping+used,sizeof(mapping)-used,",%d",pitch);
    }
    set("padmap",mapping);render(4);
}
static void parent_pad_strike(int column,int expected_pc){
    uint8_t down[]={0x90,(uint8_t)(68+column),100},up[]={0x80,(uint8_t)(68+column),0};
    sent_on=sent_off=0;rendered_mask=0;
    api->on_midi(instance,down,3,0);assert(render(8)>0);
    if(sent_on!=1||rendered_mask!=(1u<<expected_pc))fprintf(stderr,"parent pad column=%d expected=%d mask=%x ons=%d\n",column,expected_pc,rendered_mask,sent_on);
    assert(sent_on==1&&rendered_mask==(1u<<expected_pc));
    api->on_midi(instance,up,3,0);render(8);
    assert(sent_off==1&&render(8)==0);
}
static void test_pad_parent_key(void){
    static const char *roots[]={"C","C#","D","Eb","E","F","F#","G","Ab","A","Bb","B"};
    set("ch3:mix","1,0,0,0,0");
    set("ch3:midi_fx1:follower_root_policy","Explicit");set("ch3:midi_fx1:follower_explicit_root","C");
    set("ch3:midi_fx1:follower_scale","Major");set("ch3:midi_fx1:travel_map","None");
    set("ch3:midi_fx1:content_map","Free");set("ch3:midi_fx1:follower_key_travel","Relative");
    set("ch3:midi_fx1:chord_mode","Off");set("ch3:midi_fx1:arp_playback","Together");
    set("ch3:midi_fx1:retrigger_held","Off");
    for(int root=0;root<12;root++){
        set("ch0:midi_fx1:key_center_tonic",roots[root]);set("ch0:midi_fx1:key_center_explicit_scale","Major");
        set("ch0:midi_fx1:key_center_apply","Apply");render(8);
        char view[8192],footer[32];
        assert(api->get_param(instance,"ch3:midi_fx1:pad_view",view,sizeof(view))>0);
        snprintf(footer,sizeof(footer),"|footer1,%d,1,",root);
        assert(strstr(view,footer)&&strstr(view,"|input1,0,1,1,"));
        for(int offset=-7;offset<=7;offset++){
            parent_pad_map(offset);
            parent_pad_strike((offset+14)%7,root);
            parent_pad_strike((offset+16)%7,(root+4)%12);
        }
    }
    /* Explicit parent keys already include the master transpose context. */
    for(int transpose=-2;transpose<=2;transpose+=2){
        char value[8];snprintf(value,sizeof(value),"%d",transpose);set("ch0:midi_fx1:transpose",value);
        set("ch0:midi_fx1:key_center_tonic","D");set("ch0:midi_fx1:key_center_apply","Apply");
        parent_pad_map(3);parent_pad_strike(3,2);parent_pad_strike(5,6);
    }
    set("ch0:midi_fx1:transpose","0");set("ch0:midi_fx1:key_center_apply","Apply");
    set("ch0:midi_fx1:parallel_scale","Natural Minor");set("ch0:midi_fx1:parallel_mode","Down");
    parent_pad_strike(3,2);parent_pad_strike(5,5);
    set("ch0:midi_fx1:parallel_mode","Up");parent_pad_strike(5,6);
    /* A position edit does not restart or retune a held onset. */
    uint8_t down[]={0x90,71,100},up[]={0x80,71,0};
    sent_on=sent_off=0;rendered_mask=0;
    api->on_midi(instance,down,3,0);render(8);
    assert(sent_on==1&&rendered_mask==(1u<<2));
    parent_pad_map(4);assert(sent_on==1&&sent_off==0);
    api->on_midi(instance,up,3,0);render(8);assert(sent_off==1&&render(8)==0);
    parent_pad_strike(4,2);
    /* Record source degrees, then replay with a different physical position. */
    set("state","movy1\nbpm 12000\nlink 0\ntk 3 0 0\ncl 3 0 16 0 \n");
    set("ch0:midi_fx1:key_center_tonic","D");set("ch0:midi_fx1:key_center_apply","Apply");
    parent_pad_map(3);set("cmd","play");render(16);set("cmd","rec 3");render(800);
    uint8_t third_down[]={0x90,73,100},third_up[]={0x80,73,0};
    api->on_midi(instance,third_down,3,0);set("cmd","non 3 64 100");render(32);
    api->on_midi(instance,third_up,3,0);set("cmd","nof 3 64");render(32);set("cmd","stop");render(8);
    char recorded[65536];assert(api->get_param(instance,"state",recorded,sizeof(recorded))>0);
    assert(strstr(recorded,"fi 3 0 0 0 1 0")); /* C-major source coordinates. */
    parent_pad_map(-3);sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");render(1500);set("cmd","stop");render(16);
    assert(sent_on>=2&&sent_on==sent_off&&rendered_mask==(1u<<6));
    set("ch0:midi_fx1:key_center_tonic","E");set("ch0:midi_fx1:key_center_apply","Apply");
    sent_on=sent_off=0;rendered_mask=0;
    set("cmd","play");render(1500);set("cmd","stop");render(16);
    assert(sent_on>=2&&sent_on==sent_off&&rendered_mask==(1u<<8));
    /* Once Chord Play supplies harmony, the same parent mapping applies once. */
    for(int track=0;track<3;track++){
        char key[64];snprintf(key,sizeof(key),"ch%d:midi_fx1:render_channel",track);set(key,"Off");
        snprintf(key,sizeof(key),"ch%d:mix",track);set(key,"1,0,1,0,0");
    }
    set("chord_route","3,2,1");set("chord_select","0,0,1,0,1,0,1,12");render(16);
    parent_pad_map(3);parent_pad_strike(3,4);parent_pad_strike(5,8);
    set("chord_select","off");set("chord_route","off");
    puts("pad parent key: all 12 roots and 15 positions, single transposition, Parallel, sustained release and recorded-degree replay pass");
}
