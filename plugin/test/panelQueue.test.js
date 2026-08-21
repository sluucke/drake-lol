import { describe, it, expect } from 'vitest';
import { renderQueue } from '../src/ui/panel.js';

describe('renderQueue', () => {
  it('renders in-client team reveal options', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: {
        queue_team_reveal_in_client: true,
        queue_team_reveal_sample_size: 50,
        queue_team_reveal_recent_pool: 'ranked_both',
        queue_team_reveal_last5_pool: 'current_queue',
        queue_team_reveal_fetch_concurrency: 1,
      },
      disabled: false,
      revealTiming: { lastMs: 12000, recommended: 2, estimateMs: 6000 },
    });

    expect(html).toContain('data-setting="queue_team_reveal_in_client"');
    expect(html).toContain('Reveal my team in-client');
    expect(html).toContain('Ctrl+Shift+D');
    expect(html).toContain('data-checked="true"');
    expect(html).toContain('id="team-reveal-sample-size"');
    expect(html).toContain('id="team-reveal-recent-pool"');
    expect(html).toContain('id="team-reveal-last5-pool"');
    expect(html).toContain('id="team-reveal-fetch-concurrency"');
    expect(html).toContain('Based on your last reveal, we suggest resolving 2 players at a time.');
  });

  it('renders dodge in-client toggle checked by default', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: {},
      disabled: false,
    });

    expect(html).toContain('data-setting="queue_dodge_in_client"');
    expect(html).toContain('Show dodge button in champ select');
    expect(html).toContain('data-setting="queue_dodge_in_client"');
    expect(html).toMatch(/data-setting="queue_dodge_in_client"[^>]*>[\s\S]*data-checked="true"/);
  });

  it('renders overload warn in red class when concurrency is high', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: {
        queue_team_reveal_in_client: true,
        queue_team_reveal_fetch_concurrency: 3,
      },
      disabled: false,
    });

    expect(html).toContain('class="reveal-warn"');
    expect(html).toContain('loads the client harder');
  });

  it('disables toggle row when tray is down', () => {
    const html = renderQueue({
      provider: 'porofessor',
      settings: { queue_team_reveal_in_client: false, queue_dodge_in_client: true },
      disabled: true,
    });

    expect(html).toContain('data-setting="queue_team_reveal_in_client" disabled');
    expect(html).toContain('data-setting="queue_dodge_in_client" disabled');
    expect(html).toContain('data-checked="false"');
  });
});
