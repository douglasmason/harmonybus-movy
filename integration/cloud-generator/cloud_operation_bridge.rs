/// Bridge musical contact edges, never gestures: HB owns arm/hold/latch state.
/// Small ABI buffers avoid the general allocating parameter reader per block.
impl ChainSlots {
    pub fn cloud_operation_inputs(&mut self, inputs:[u8;16])->[seq_core::cloud::Operation;16] {
        let mut operations=[seq_core::cloud::Operation::default();16];
        for (track,input) in inputs.into_iter().enumerate() {
            let bit=1u16<<track;
            if input==0&&self.cloud_input_tracks&bit==0 {continue;}
            let was_down=self.cloud_input_down&bit!=0;
            self.cloud_input_tracks&=!bit;self.cloud_input_down&=!bit;
            let Some(instance)=self.slots[track].as_mut() else {continue;};
            if input&8!=0||input&1==0 {instance.set_param("midi_fx1:motion_cloud_input","Cancel");}
            if input&1==0 {continue;}
            self.cloud_input_tracks|=bit;
            let mut bypass=[0u8;4];
            if instance.hb_get_small(c"midi_fx1:bypassed",&mut bypass)>0&&bypass[0]==b'1' {
                instance.set_param("midi_fx1:motion_cloud_input","Cancel");continue;
            }
            if input&2!=0 {instance.set_param("midi_fx1:motion_cloud_input","Down");}
            // Up completes a short stroke even when Down and Up arrived together.
            if input&4==0&&(was_down||input&2!=0) {instance.set_param("midi_fx1:motion_cloud_input","Up");}
            if input&4!=0 {self.cloud_input_down|=bit;}
            let mut reply=[0u8;64];
            let count=instance.hb_get_small(c"midi_fx1:motion_cloud_transform",&mut reply);
            if count>0&&(count as usize)<reply.len() {
                operations[track]=std::str::from_utf8(&reply[..count as usize]).ok().and_then(seq_core::cloud::Operation::parse).unwrap_or_default();
            }else if count<=0 {
                // Preserve Hold on a host that predates the additive position reply.
                let count=instance.hb_get_small(c"midi_fx1:motion_cloud_hold",&mut reply);
                operations[track].hold=count>0&&(count as usize)<reply.len()&&std::str::from_utf8(&reply[..count as usize]).ok().and_then(|value|value.parse::<u16>().ok()).is_some_and(|mask|mask!=0);
            }
            if operations[track].hold||operations[track].shift!=[0;2]||input&2!=0 {self.idle.wake(track);}
        }
        operations
    }
}
