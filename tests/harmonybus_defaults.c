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
        assert(instances[track]->player.config.phase == 1);
        assert(instances[track]->retrigger_held == 1);
        assert(instances[track]->render_channel == expected_channel);
        assert(instances[track]->source_channel == (track >= 12 ? quartet_position : 0));
        assert(g_bus.boundary_buffer_ms == -3);
        assert(instances[track]->quant_timing == 0);
        assert(instances[track]->content_map == (expected_role == 1 ? 1 : 0));
        assert(g_bus.anticipation == 0);
        assert(g_bus.analysis_release_ms == 60);
        char serialized_state[512];
        assert(api->get_param(instances[track], "state", serialized_state,
                              sizeof(serialized_state)) > 0);
        /* Loading a legacy seed adds the explicit global humanize defaults.
           All existing musical settings still round-trip byte for byte. */
        char expected_state[512],round_trip[512],amount[16];
        snprintf(expected_state,sizeof(expected_state),"%s;hu1,0,0,0",arguments[preset]);
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
