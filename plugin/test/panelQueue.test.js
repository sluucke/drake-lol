import { describe, it, expect } from 'vitest';
import { renderQueue } from '../src/ui/panel.js';

describe('renderQueue', () => {
  it('renders in-client team reveal toggle row', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: { queue_team_reveal_in_client: true },
      disabled: false,
    });

    expect(html).toContain('data-setting="queue_team_reveal_in_client"');
    expect(html).toContain('Reveal my team in-client');
    expect(html).toContain('Ctrl+Shift+D');
    expect(html).toContain('data-checked="true"');
  });

  it('disables toggle row when tray is down', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: { queue_team_reveal_in_client: false },
      disabled: true,
    });

    expect(html).toContain('data-setting="queue_team_reveal_in_client" disabled');
    expect(html).toContain('data-checked="false"');
  });
});
