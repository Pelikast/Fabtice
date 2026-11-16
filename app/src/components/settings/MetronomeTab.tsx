// « Métronome »: volume, count-in before the loop, strong and weak beats per signature, progressive
// acceleration of the loop. They are kept with the open piece (the volume and the count-in carry over to the
// next one), so the whole tab is « Pour ce morceau ». The panel next to the transport shows the same settings.

import { MetronomeSettingsBody } from '../MetronomePanel';
import { Section } from './parts';

export function MetronomeTab() {
  return (
    <Section scope="piece">
      <div className="reglages-metronome">
        <MetronomeSettingsBody />
      </div>
    </Section>
  );
}
