/* Exercise Movy's shipped preset strings through the real HarmonyBus API. */
#include <assert.h>
#include <stdio.h>
#include <sys/mman.h>
#include <unistd.h>
#include "harmonybus.c"

int main(int argument_count, char **arguments) {
    assert(argument_count == 9);
    /* Keep shared settings local to the test process. */
    hb_global_shared_t shared_settings = {0};
    g_global_shared = &shared_settings;
    midi_fx_api_v1_t *api = move_midi_fx_init(NULL);
    Inst *instances[16];
    for (int track = 0; track < 16; track++) {
        const int quartet_position = track % 4;
        const int expected_role = track >= 12 ? 3 : quartet_position == 0 ? 0 : 1;
        const int preset = track >= 12 ? 5 + quartet_position : quartet_position + 1;
        const int expected_channel = track >= 12 ? -1 : quartet_position == 0 ? 2 : quartet_position;
        instances[track] = api->create_instance("", NULL);
        assert(instances[track]);
        api->set_param(instances[track], "state", arguments[preset]);
        if (instances[track]->role != expected_role) {
            fprintf(stderr, "track %d: restored role %d, expected %d; preset was rejected\n",
                    track + 1, instances[track]->role, expected_role);
            return 1;
        }
        assert(instances[track]->player.config.mode == (expected_role == 0 ? 1 : 0));
        assert(instances[track]->player.config.phase == 2);
        assert(instances[track]->player.config.start == 5);
        assert(instances[track]->policy_overrides == 0);
        assert(instances[track]->player.config.chromatic_quality == 3);
        assert(instances[track]->retrigger_held == 1);
        assert(instances[track]->chromatic_map == 1);
        for (int lane = 0; lane < HB_MOTION_USER_LANES; lane++)
            assert(instances[track]->motion.lanes[lane].operation == HB_MO_OFF);
        assert(instances[track]->motion.lanes[16].operation == HB_MO_BELOW);
        assert(instances[track]->motion.lanes[17].operation == HB_MO_ABOVE);
        assert(instances[track]->motion.lanes[18].operation == HB_MO_CHROM_ABOVE);
        assert(instances[track]->motion.lanes[24].operation == HB_MO_TRITONE_II);
        assert(instances[track]->render_channel == expected_channel);
        assert(instances[track]->source_channel == (track >= 12 ? quartet_position : 0));
        assert(g_bus.boundary_buffer_ms == -3);
        assert(instances[track]->quant_timing == 0);
        assert(instances[track]->content_map == (expected_role == 1 ? 1 : 0));
        assert(g_bus.anticipation == 0);
        assert(g_bus.analysis_release_ms == 60);
        char serialized_state[8192];
        assert(api->get_param(instances[track], "state", serialized_state,
                              sizeof(serialized_state)) > 0);
        /* Loading a legacy seed adds the explicit global humanize defaults.
           All existing musical settings still round-trip byte for byte. */
        char expected_state[8192],round_trip[8192],amount[16];
        char seed[1024];snprintf(seed,sizeof(seed),"%s",arguments[preset]);
        char *pad_marker=strstr(seed,";pd1,");assert(pad_marker);*pad_marker=0;
        snprintf(expected_state,sizeof(expected_state),"%s;pd1,6,3,3,2,0;pb1,2;pc2,2;pp1,3;hu1,0,0,0;ss1,0,0;ct1,1;ft1,1,2,3,4,13,14,15,16;ft2,1,2,3,4,13,14,15,16,5;rp1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,3,0,2,0,0,0,0,0,0,0,0,0,0,3,0,2,0,0,0,0,0;named1",seed);
        /* New versioned fields have explicit neutral defaults; preserve the
           legacy prefix exactly, then verify the complete state round-trip. */
        strcat(expected_state,";mf1,0,2,0,2,0,0,0:00");
        for(int slot=0;slot<16;slot++)strcat(expected_state,"0000");
        strcat(expected_state,";mp1,0,0,1,0;mg1,0,0;rr1,0,0,0,0");
        strcat(expected_state,";ar1,13,14,15,16,17,18,19,20,36,37,38,39,40,41,42,43,9,10,11,12,13,14,15,16,1,1;ar2,0");
        assert(instances[track]->player.config.start==5);
        const hb_ar_state *approach=&instances[track]->approach_rows;
        assert(!approach->enabled&&!approach->down&&approach->count==1);
        assert(approach->order[0]==1&&approach->bank_armed==-1);
        for(int slot=0;slot<8;slot++)assert(approach->knobs[slot]==13+slot);
        for(int slot=0;slot<16;slot++)assert(approach->bank[slot]==(slot<8?36+slot:1+slot));
        assert(instances[track]->motif.editor.recording==-1);
        assert(instances[track]->motif.editor.armed==-1);
        assert(instances[track]->rhythm_mode==0&&g_motif_rhythm==0&&g_render_window==0);
        assert(g_pad_settings[0]==6&&g_pad_tonic_color==9&&g_pad_play_color==3);
        assert(strcmp(serialized_state, expected_state) == 0);
        const char *keys[]={"humanize_timing","humanize_velocity","humanize_gate"};
        for(int key=0;key<3;key++){
            api->get_param(instances[track],keys[key],amount,sizeof(amount));
            assert(!strcmp(amount,"0"));
        }
        api->set_param(instances[track],"state",serialized_state);
        api->get_param(instances[track],"state",round_trip,sizeof(round_trip));
        assert(!strcmp(serialized_state,round_trip));
    }
    for (int track = 0; track < 16; track++) api->destroy_instance(instances[track]);
    puts("HarmonyBus API restored and round-tripped all 16 prepared track states");
    return 0;
}
