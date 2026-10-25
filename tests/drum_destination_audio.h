/* Real sequencer -> real Movy DSP -> host MIDI, with occupied HB chains. */
static void test_drum_destination(void){
    set("cmd","stop");render(32);set("chtracks","1");
    set("jointlinks","off");
    for(int track=4;track<=12;track+=4){
        char state[256],command[80],key[80];
        snprintf(key,sizeof(key),"ch%d:midi_fx1:role",track);set(key,"Conductor");
        snprintf(key,sizeof(key),"ch%d:midi_fx1:render_channel",track);set(key,"4");
        snprintf(state,sizeof(state),"movy1\nbpm 12000\nlink 0\ntk %d 0 0\ncl %d 0 16 0 0:900:38:101:0\ncp %d 0 1 1 12 0\ndrumout %d 1\n",track,track,track,track);
        set("state",state);render(8);
        sent_on=sent_off=rejected=0;drum_output_check=1;
        set("cmd","play");render(16);assert(sent_on==1&&sent_off==0);
        /* Removing the synth does not change the destination of its pending release. */
        snprintf(key,sizeof(key),"ch%d:synth:module",track);set(key,"none");
        snprintf(command,sizeof(command),"drumout %d 0",track);set("cmd",command);render(8);
        assert(sent_on==1&&sent_off==1&&rejected==0);
        set("cmd","stop");render(8);assert(sent_off==1);
        drum_output_check=0;
        snprintf(key,sizeof(key),"ch%d:synth:module",track);set(key,"probe");render(8);
        /* Loading another Set flushes the old onset-owned route first. */
        set("state",state);render(8);sent_on=sent_off=0;drum_output_check=1;
        set("cmd","play");render(16);assert(sent_on==1);
        set("state","movy1\nbpm 12000\nlink 0\n");render(8);
        assert(sent_off==1);drum_output_check=0;
    }
    puts("Drum destinations: tracks 5/9/13, channel 1, exact pitch/velocity, exclusive chain bypass, route change, module change and Set-load releases pass");
}
