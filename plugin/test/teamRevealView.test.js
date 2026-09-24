import { describe, it, expect, vi } from 'vitest';
import { makeTeamRevealDom, withChampionNames } from '../src/ui/teamRevealDom.js';

const NAMES = { 103: 'Ahri', 157: 'Yasuo' };

function setup(extra = {}) {
  const views = [];
  const overlayRoot = { appendChild: vi.fn(), querySelector: vi.fn(() => null), ownerDocument: null };
  const ctl = makeTeamRevealDom({
    doc: { querySelectorAll: () => [] },
    subscribe: vi.fn(() => () => {}),
    overlayRoot,
    lcu: {},
    loadSnapshot: vi.fn(async () => [
      {
        cellId: 1,
        riotId: 'Me#TAG',
        isLocalPlayer: true,
        wins: 3,
        losses: 1,
        winRate: 75,
        pickedChampionId: 103,
        seasonMostPlayedChampionId: 157,
        recentGames: [{ championId: 157, win: true, kills: 1, deaths: 2, assists: 3 }],
        historyGames: [{ any: 1 }],
      },
    ]),
    getChampName: (id) => NAMES[id] || '',
    muteTeammatesImpl: vi.fn(async () => ({ success: true })),
    publishView: (view) => views.push(view),
    ...extra,
  });
  return { ctl, views, overlayRoot, last: () => views[views.length - 1] };
}

const SESSION = { myTeam: [{ cellId: 1, team: 1, championId: 103 }] };

describe('withChampionNames', () => {
  it('adds champion names and drops raw history', () => {
    const row = withChampionNames(
      { pickedChampionId: 103, seasonMostPlayedChampionId: 157, recentGames: [{ championId: 103 }], historyGames: [1] },
      (id) => NAMES[id],
    );
    expect(row.pickedChampionName).toBe('Ahri');
    expect(row.seasonMostPlayedChampionName).toBe('Yasuo');
    expect(row.recentGames[0].championName).toBe('Ahri');
    expect(row.historyGames).toBeUndefined();
  });
});

describe('teamRevealDom view mode', () => {
  it('publishes the loading and ready status without building DOM', async () => {
    const { ctl, views, overlayRoot, last } = setup();
    ctl.setEnabled(true);
    await ctl.handleSession(SESSION);
    const phases = views.map((v) => v.statusPhase);
    expect(phases).toContain('loading');
    expect(last().statusPhase).toBe('ready');
    expect(last().open).toBe(false);
    expect(last().enabled).toBe(true);
    expect(views[views.length - 1].statusSeq).toBeGreaterThan(views[0].statusSeq);
    expect(overlayRoot.appendChild).not.toHaveBeenCalled();
  });

  it('opens with enriched rows and the map side', async () => {
    const { ctl, last } = setup();
    ctl.setEnabled(true);
    await ctl.handleSession(SESSION);
    ctl.openCards();
    const view = last();
    expect(view.open).toBe(true);
    expect(view.activeTab).toBe('scouting');
    expect(view.rows[0].riotId).toBe('Me#TAG');
    expect(view.rows[0].pickedChampionName).toBe('Ahri');
    expect(view.rows[0].recentGames[0].championName).toBe('Yasuo');
    expect(view.rows[0].historyGames).toBeUndefined();
    expect(view.side).toEqual({ side: 'BLUE', color: 'blue' });
  });

  it('hides the side when the setting is off', async () => {
    const { ctl, last } = setup({ getShowMapSide: () => false });
    ctl.setEnabled(true);
    await ctl.handleSession(SESSION);
    ctl.openCards();
    expect(last().side).toBeNull();
  });

  it('switches tabs and closes', async () => {
    const { ctl, last } = setup();
    ctl.setEnabled(true);
    await ctl.handleSession(SESSION);
    ctl.openCards();
    ctl.setActiveTab('build');
    expect(last().activeTab).toBe('build');
    ctl.closeCards();
    expect(last().open).toBe(false);
    expect(last().activeTab).toBe('build');
  });

  it('mutes teammates through the public api', async () => {
    const { ctl, last } = setup();
    ctl.setEnabled(true);
    await ctl.handleSession(SESSION);
    ctl.openCards();
    await ctl.muteAll();
    expect(last().muteStatus).toBe('muted');
  });
});
