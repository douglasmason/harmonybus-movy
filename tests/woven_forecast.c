/* Reuse HB's real predictor harness, not a second forecast implementation. */
#define main hb_existing_loop_learning_main
#include "loop_learning_test.c"
#undef main
int main(void) {
    reset_fixture();
    memset(g_timelines,0,sizeof(g_timelines));
    memset(g_timeline_owners,0,sizeof(g_timeline_owners));
    memset(g_clip_cache,0,sizeof(g_clip_cache));
    g_clip_cache_key_valid=0;
    for(int index=1;index<4;index++)g_pool[index].role=1;
    g_pool[0].movy_track=0;
    char status[64];API.get_param(&g_pool[0],"next_model",status,sizeof(status));
    API.set_param(&g_pool[0],"hb_movy_clip","0,384,0,100,1,1,96,0,0");
    hb_movy_refresh();hb_timeline_observe(&g_pool[0],chord(0));
    API.set_param(&g_pool[0],"hb_movy_clip","192,384,0,100,1,1,96,0,0");
    hb_movy_refresh();hb_timeline_observe(&g_pool[0],chord(5));
    API.set_param(&g_pool[0],"hb_movy_clip","384,384,0,100,1,1,96,0,0");
    hb_movy_refresh();hb_timeline_observe(&g_pool[0],chord(0));hb_timeline_finalize();
    assert(g_bus.next_model_locked&&g_bus.next_model_count==2);
    int saved_owner=g_timeline_owners[0].entry;assert(saved_owner>0);
    API.set_param(&g_pool[0],"hb_movy_clip","385,384,0,100,2,1,96,0,0");
    hb_movy_refresh();
    assert(g_movy_blocked==3&&!g_bus.next_model_locked);
    assert(g_timeline_owners[0].entry==0);
    assert(g_timelines[saved_owner-1].ready);
    assert(hb_next_model_event_for_phase(0,1)<0);
    API.get_param(&g_pool[0],"next_model",status,sizeof(status));
    assert(!strcmp(status,"Non-repeating"));
    API.set_param(&g_pool[0],"hb_movy_clip","386,384,0,100,1,1,96,0,0");
    hb_movy_refresh();
    assert(!g_movy_blocked&&g_bus.next_model_locked);
    assert(g_timeline_owners[0].entry==saved_owner);
    /* A woven follower must not suspend a separate conductor's predictions. */
    API.set_param(&g_pool[1],"hb_movy_clip","386,576,0,200,2,1,96,1,0");
    hb_movy_refresh();assert(!g_movy_blocked&&g_bus.next_model_locked);
    puts("woven forecasts: learned owner suspended, own cache restored, follower isolated");
    return 0;
}
