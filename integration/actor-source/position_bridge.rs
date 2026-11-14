/// Observe existing owners before advancing any track. Fixed buffers and no
/// oscillator evaluation keep observation independent of reader count/order.
impl ChainSlots {
    pub fn sequence_position_inputs(&mut self, drivers: [[u8; 4]; 16]) -> seq_core::position_inputs::Inputs {
        let mut result = seq_core::position_inputs::Inputs::default();
        let field_needed = drivers.iter().flatten().any(|driver| (3..=18).contains(driver));
        let mut field_read = false;
        for (actor, requested) in drivers.iter().enumerate() {
            let local_needed = requested.iter().any(|driver| matches!(driver, 1 | 2));
            if !local_needed && (!field_needed || field_read) { continue; }
            let Some(instance) = self.slots[actor].as_mut() else { continue; };
            let mut bypass = [0u8; 4];
            if instance.hb_get_small(c"midi_fx1:bypassed", &mut bypass) > 0 && bypass[0] == b'1' { continue; }
            if local_needed {
                let mut buffer = [0u8; 96];
                let count = instance.hb_get_small(c"midi_fx1:sequence_inputs", &mut buffer);
                if count > 0 && (count as usize) < buffer.len() {
                    if let Ok(text) = std::str::from_utf8(&buffer[..count as usize]) {
                        if let Some(values) = seq_core::position_inputs::parse_local(text) {
                            result.local[actor] = values.map(Some);
                            self.idle.wake(actor);
                        }
                    }
                }
            }
            if field_needed && !field_read {
                let mut buffer = [0u8; 1024];
                let count = instance.hb_get_small(c"midi_fx1:field_outputs_view2", &mut buffer);
                if count > 0 && (count as usize) < buffer.len() {
                    if let Ok(text) = std::str::from_utf8(&buffer[..count as usize]) {
                        if let Some(values) = seq_core::position_inputs::parse_field(text) {
                            result.field = values.map(Some);
                            field_read = true;
                            self.idle.wake(actor);
                        }
                    }
                }
            }
        }
        result
    }
}
