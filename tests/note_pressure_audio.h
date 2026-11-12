/* Exercise the same command path used by Launchpad X and Remote UI, plus
   native Move pad pressure, through production Movy/chain/HB. */
static void test_note_pressure_output(void){
    set("cmd","stop");render(32);set("chtracks","1");
    set("state","movy1\nbpm 12000\nlink 0\ntk 0 0 0\ncl 0 0 16 0 \n");
    set("ch0:midi_fx1:performance_reset","1");
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:chord_mode","Off");
    set("ch0:midi_fx1:arp_playback","Together");set("ch0:midi_fx1:master_transpose","C");
    set("ch0:midi_fx1:render_channel","2");set("ch0:midi_fx1:motion_bypass","Off");
    for(int lane=1;lane<=16;lane++){
        char parameter[80];snprintf(parameter,sizeof(parameter),"ch0:midi_fx1:motion_operation_%d",lane);set(parameter,"Off");
    }
    set("ch0:midi_fx1:motion_operation_1","Transpose");set("ch0:midi_fx1:motion_control_1","12");
    set("ch0:midi_fx1:motion_lane","1");set("ch0:midi_fx1:motion_enabled","Off");
    set("ch0:midi_fx1:motion_field_target","0");set("ch0:midi_fx1:motion_offset","0");
    set("ch0:midi_fx1:motion_hold_1","On");
    set("ch12:midi_fx1:role","Receiver");set("ch12:midi_fx1:receive_channel","2");
    set("ch0:mix","1,0,0,0,0");set("ch12:mix","1,0,0,0,0");render(16);
    set("cmd","non 0 60 100");render(16);
    fprintf(stderr,"pressure fixture held72: local=%.0f receiver=%.0f; operation=%.0f\n",field_get("ch0:synth:held_72"),field_get("ch12:synth:held_72"),field_get("ch0:midi_fx1:motion_control_1"));
    assert(field_get("ch0:synth:held_72")==1&&field_get("ch12:synth:held_72")==1);
    set("cmd","npr 0 60 39");render(16);
    assert(field_get("ch0:synth:pressure_72")==39&&field_get("ch12:synth:pressure_72")==39);
    set("cmd","npr 0 60 0");render(16);
    assert(field_get("ch0:synth:pressure_72")==0&&field_get("ch12:synth:held_72")==1);
    set("cmd","nof 0 60");render(16);
    assert(field_get("ch0:synth:held_72")==0&&field_get("ch12:synth:held_72")==0);
    set("padmap","0,60,64,67,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60");
    uint8_t down[]={0x90,68,100},pressure[]={0xa0,68,61},up[]={0x80,68,0};
    api->on_midi(instance,down,3,0);render(16);
    api->on_midi(instance,pressure,3,0);render(16);
    assert(field_get("ch0:synth:pressure_72")==61&&field_get("ch12:synth:pressure_72")==61);
    api->on_midi(instance,up,3,0);render(16);
    assert(field_get("ch0:synth:held_72")==0&&field_get("ch12:synth:held_72")==0);
    puts("note pressure: Move and Launchpad/Remote commands reach mapped local and receiver synth voices without releasing gates");
}
