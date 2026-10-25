// The HB timeline chooses when; the ordinary input path owns MIDI and recording.
impl Instance {
    fn activate_chord_selection(&mut self, track: usize, pitch: u8) {
        self.release_chord_selection();
        self.engine.record_chord_activation(track, &mut self.out);
        self.drain_out();
        self.input_event(surface_route::Event{track,pitch,status:0x90,value:100,approach:None,full_velocity:false},false);
        self.chord_note=Some((track,pitch));
    }
    fn clear_chord_queue(&mut self) {
        if let Some(track)=self.chord_queue.take(){self.chains.set_param(track,"midi_fx1:hb_chord_queue","off");}
    }
    fn tick_chord_queue(&mut self) {
        let Some(track)=self.chord_queue else {return;};
        let Some(event)=self.chains.get_param(track,"midi_fx1:hb_chord_queue_take") else {return;};
        if event=="off" {self.chord_queue=None;self.release_chord_selection();return;}
        let Some(pitch)=event.parse::<u8>().ok().filter(|pitch|*pitch<128) else {return;};
        self.activate_chord_selection(track,pitch);
    }
}
