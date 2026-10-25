/* Production-chain regression: imported input follows changing harmony and
 * recalls settings/automation before playback, including after Set restore. */
static const char *part_baseline="1,1,0,0,2,16,8,0,0,0,0,0,0,0,2,1,2,0,0,100,0,0,0,0,0,0,1,0";
static void load_part_track(int track,const char *kind,const char *choice){
    render(2); /* Set-load/input-context reconciliation precedes UI preview. */
    char info[256],signature[64],result[256],parameter[64];unsigned slot;
    snprintf(parameter,sizeof(parameter),"motif_clip_info_%d",track);
    assert(api->get_param(instance,parameter,info,sizeof(info))>0);
    assert(sscanf(info,"%u,%63[^,]",&slot,signature)==2);
    static char command[40000];
    snprintf(command,sizeof(command),"pload %d %u %s %s %s %s",track,slot,signature,kind,choice,part_baseline);
    set("cmd",command);render(2);
    assert(api->get_param(instance,"part_result",result,sizeof(result))>0);
    if(strncmp(result,"Loaded",6))fprintf(stderr,"part import: %s\n",result);
    assert(!strncmp(result,"Loaded",6));
}
static void load_part(const char *kind,const char *choice){load_part_track(2,kind,choice);}
static void test_part_library(void){
    set("cmd","stop");render(8);set("chtracks","1");set("ch2:mix","1,0,0,0,0");set("ch0:mix","1,0,0,0,0");
    set("chord_select","off");set("chord_route","3,2,0");
    set("state","movy1\nbpm 12000\nlink 0\ntk 2 0 0\ncl 2 0 16 0 \n");
    set("ch0:midi_fx1:role","Conductor");set("ch0:midi_fx1:render_channel","Off");
    set("ch0:midi_fx1:master_transpose","C");set("ch0:midi_fx1:follower_explicit_root","C");set("ch0:midi_fx1:follower_scale","Major");
    set("ch2:midi_fx1:render_channel","3");set("ch2:midi_fx1:play_bypass","Off");
    set("cmd","usnap 200");load_part("stock","1");set("cmd","ucommit 200");
    set("ch2:midi_fx1:render_velocity_percent","50");
    assert(field_get("ch2:midi_fx1:render_velocity_percent")==50);
    /* Starting transport resets held inputs in the existing renderer. Select
       harmony after Play, as in performance, then retain it for the whole loop. */
    for(int pass=0;pass<2;pass++){
        set("cmd","play");render(100); /* Let any previous harmony finish its opening gate. */
        set("chord_select",pass?"0,2,1,0,1,0,1,12":"0,10,1,0,1,0,1,12");render(8);
        sent_on=sent_off=0;rendered_mask=0;source_velocity_count=0;capture_source_velocity=1;
        render(850);set("cmd","stop");render(16);capture_source_velocity=0;
        assert(source_velocity_count>0);for(int i=0;i<source_velocity_count;i++)assert(source_velocities[i]>0&&source_velocities[i]<=54);
        unsigned expected=pass?((1u<<2)|(1u<<6)|(1u<<9)):((1u<<10)|(1u<<2)|(1u<<5));
        if(sent_on<12||sent_on!=sent_off||rendered_mask!=expected)fprintf(stderr,"comp preset pass %d on=%d off=%d mask=%x expected=%x\n",pass,sent_on,sent_off,rendered_mask,expected);
        assert(sent_on>=12&&sent_on==sent_off&&rendered_mask==expected);
    }
    /* Saving the user entry carries named automation; loading maps its new
       lane immediately, before the UI next refreshes its registry. */
    set("cmd","alabel 2 5 synth:cutoff;abase 2 5 33;aset 2 5 0 91;pshape 2 0 gate 75");
    static char entry[40000],saved[262144];
    assert(api->get_param(instance,"part_export_2",entry,sizeof(entry))>0&&strncmp(entry,"error:",6));
    set("state","movy1\nbpm 12000\nlink 0\ntk 2 0 0\ncl 2 0 16 0 \n");
    load_part("user",entry);
    set("cmd","play");render(2);
    assert(field_get("ch2:synth:cutoff")==91);
    set("cmd","stop");render(4);
    assert(api->get_param(instance,"state",saved,sizeof(saved))>0);
    set("ch2:midi_fx1:render_velocity_percent","110");
    set("state",saved);render(4);
    assert(field_get("ch2:midi_fx1:render_velocity_percent")==50);
    char info[256];assert(api->get_param(instance,"part_info_2",info,sizeof(info))>0&&strstr(info,"|75|"));
    set("chord_select","off");render(16);
    puts("Comp library: production mapped playback, harmonic changes, user automation mapping and Set recall pass");
    set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ncl 1 0 16 0 \n");
    set("ch1:mix","1,0,0,0,0");set("ch1:midi_fx1:render_channel","2");set("ch1:midi_fx1:play_bypass","Off");
    set("joint_links","0,1,1,-2,-1,0;4,0,0,0,0,0;8,0,0,0,0,0;12,0,0,0,0,0");
    set("chord_route","3,2,0,1");load_part_track(1,"bass","0");
    set("ch1:midi_fx1:render_velocity_percent","50");
    for(int pass=0;pass<2;pass++){
        set("ch1:midi_fx1:travel_map",pass?"Closest Split":"Relative");
        /* The 84-tick opening bass gate ends before beat two at 96 ticks.
           Begin counting in that rest, so no pre-count note-off is included. */
        set("cmd","play");render(156);
        set("chord_select",pass?"0,2,1,0,1,0,1,12":"0,10,1,0,1,0,1,12");render(8);
        sent_on=sent_off=0;rendered_mask=0;source_velocity_count=0;capture_source_velocity=1;
        memset(routed_channel_on,0,sizeof(routed_channel_on));
        render(850);set("cmd","stop");render(16);capture_source_velocity=0;
        unsigned expected=pass?((1u<<2)|(1u<<9)):((1u<<10)|(1u<<5));
        fprintf(stderr,"bass preset mapping %d on=%d off=%d mask=%x expected=%x\n",pass,sent_on,sent_off,rendered_mask,expected);
        assert(sent_on>=4&&sent_on==sent_off&&rendered_mask==expected);
        assert(routed_channel_on[1]==(unsigned)sent_on);
        assert(source_velocity_count>0);for(int index=0;index<source_velocity_count;index++)assert(source_velocities[index]>0&&source_velocities[index]<=54);
    }
    set("cmd","alabel 1 5 synth:cutoff;abase 1 5 33;aset 1 5 0 91;pshape 1 0 gate 60;pshape 1 0 register -12");
    assert(api->get_param(instance,"part_export_1",entry,sizeof(entry))>0&&strncmp(entry,"error:",6));
    set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ncl 1 0 16 0 \n");
    load_part_track(1,"user",entry);set("cmd","play");render(2);
    assert(field_get("ch1:synth:cutoff")==91);set("cmd","stop");render(4);
    assert(api->get_param(instance,"state",saved,sizeof(saved))>0);
    set("ch1:midi_fx1:render_velocity_percent","110");set("state",saved);render(4);
    assert(field_get("ch1:midi_fx1:render_velocity_percent")==50);
    assert(api->get_param(instance,"part_info_1",info,sizeof(info))>0&&strstr(info,"|-12|60|"));
    set("chord_select","off");render(16);
    puts("Bass library: both mappings, changing harmony, exclusive clip routing, scaled velocity, paired releases and user recall pass");

#ifdef HB_TEST_CLIP_FILL
    set("state","movy1\nbpm 12000\nlink 0\ntk 1 0 0\ncl 1 0 16 0 \n");
    load_part_track(1,"bass","0");load_part_track(2,"stock","1");render(2);
    char fill_preview[8192],fill_target[128],fill_signature[64],fill_command[1024],fill_result[256];
    assert(api->get_param(instance,"fill_preview_1_0_2_0_1_0",fill_preview,sizeof(fill_preview))>0);
    assert(sscanf(fill_preview,"%63[^|]",fill_signature)==1);
    assert(api->get_param(instance,"fill_target_1_0",fill_target,sizeof(fill_target))>0);
    snprintf(fill_command,sizeof(fill_command),"clipfill 1 0 %s 1_0_2_0_1_0 %s %s own",fill_target,fill_signature,part_baseline);
    set("cmd",fill_command);render(2);
    assert(api->get_param(instance,"part_result",fill_result,sizeof(fill_result))>0);
    if(strncmp(fill_result,"Filled",6))fprintf(stderr,"clip fill: %s\n",fill_result);
    assert(!strncmp(fill_result,"Filled",6));
    set("cmd","mute 2 1;play");render(156);
    set("chord_select","0,2,1,0,1,0,1,12");render(8);
    sent_on=sent_off=0;rendered_mask=0;memset(routed_channel_on,0,sizeof(routed_channel_on));
    render(850);set("cmd","stop");render(16);
    assert(sent_on>=4&&sent_on==sent_off&&rendered_mask==((1u<<2)|(1u<<9)));
    assert(routed_channel_on[1]==(unsigned)sent_on);
    set("chord_select","off");render(16);
    puts("Clip Fill: composed bass pitches and comp rhythm render through production HarmonyBus with mapped harmony and paired releases");
#endif
}
