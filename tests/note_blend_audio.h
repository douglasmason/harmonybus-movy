/* Real production input adapters, HB/chain, local synth and Render To receiver. */
static void assert_note_blend(int pitch,int bend){
    for(int track=0;track<=12;track+=12){
        char key[80];snprintf(key,sizeof(key),"ch%d:synth:held_%d",track,pitch);
        assert(field_get(key)==1);snprintf(key,sizeof(key),"ch%d:synth:bend",track);
        int actual=field_get(key);assert(abs(actual-bend)<=1);
    }
}
static void test_note_blend_output(void){
    test_note_pressure_output(); /* Fresh setup, +12 operation and Receiver 2. */
    set("ch0:midi_fx1:note_blend","Bend 12");render(16);
    for(int source=1;source<=2;source++){
        char batch[256];int address=128*source+11;
        snprintf(batch,sizeof(batch),"5,0,144,%d,60,100,0,-1,0;6,0,144,%d,72,100,0,-1,0",address,address+1);
        set("surface_events",batch);render(160);assert_note_blend(72,12288);
        assert(field_get("ch0:synth:held_84")==0&&field_get("ch12:synth:held_84")==0);
        snprintf(batch,sizeof(batch),"7,0,160,%d,60,25,0,-1,0;8,0,160,%d,72,75,0,-1,0",address,address+1);
        set("surface_events",batch);render(160);assert_note_blend(72,14336);
        set("ch0:midi_fx1:note_blend","Off");render(16);assert_note_blend(72,8192);
        assert(field_get("ch0:synth:held_84")==1&&field_get("ch12:synth:held_84")==1);
        set("ch0:midi_fx1:note_blend","Bend 12");render(16);
        snprintf(batch,sizeof(batch),"9,0,128,%d,60,0,0,-1,0;10,0,128,%d,72,0,0,-1,0",address,address+1);
        set("surface_events",batch);render(16);
        assert(field_get("ch0:synth:held_72")==0&&field_get("ch12:synth:held_72")==0);
        assert(field_get("ch0:synth:bend")==8192&&field_get("ch12:synth:bend")==8192);
    }
    set("padmap","0,60,72,67,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60,60");
    uint8_t first[]={0x90,68,100},second[]={0x90,69,100},first_up[]={0x80,68,0},second_up[]={0x80,69,0};
    api->on_midi(instance,first,3,0);api->on_midi(instance,second,3,0);render(160);assert_note_blend(72,12288);
    set("padpressure","68,25;69,75");render(160);assert_note_blend(72,14336);
    api->on_midi(instance,first_up,3,0);api->on_midi(instance,second_up,3,0);render(16);
    assert(field_get("ch0:synth:bend")==8192&&field_get("ch12:synth:bend")==8192);
    set("ch0:midi_fx1:note_blend","Steps");
    api->on_midi(instance,first,3,0);api->on_midi(instance,second,3,0);render(160);assert_note_blend(78,8192);
    api->on_midi(instance,first_up,3,0);api->on_midi(instance,second_up,3,0);render(16);
    assert(field_get("ch0:synth:held_78")==0&&field_get("ch12:synth:held_78")==0);
    puts("note blend: Move pressure bridge and Launchpad/Remote surface contacts blend local and receiver voices, restore polyphony and center bend");
}
