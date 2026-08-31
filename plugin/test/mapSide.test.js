import { describe, it, expect } from 'vitest';
import { readMapSide, formatMapSideBadge } from '../src/features/mapSide.js';

describe('readMapSide', () => {
  it('identifies Blue Side by team 1 or 100', () => {
    expect(readMapSide({ myTeam: [{ team: 1 }] })).toEqual({
      side: 'BLUE',
      label: 'Blue Side',
      color: 'blue',
    });
    expect(readMapSide({ myTeam: [{ team: 100 }] })).toEqual({
      side: 'BLUE',
      label: 'Blue Side',
      color: 'blue',
    });
    expect(readMapSide({ myTeam: [{ team: 0 }, { team: 1 }] })).toEqual({
      side: 'BLUE',
      label: 'Blue Side',
      color: 'blue',
    });
  });

  it('identifies Red Side by team 2 or 200', () => {
    expect(readMapSide({ myTeam: [{ team: 2 }] })).toEqual({
      side: 'RED',
      label: 'Red Side',
      color: 'red',
    });
    expect(readMapSide({ myTeam: [{ team: 200 }] })).toEqual({
      side: 'RED',
      label: 'Red Side',
      color: 'red',
    });
    expect(readMapSide({ myTeam: [{ team: 0 }, { team: 200 }] })).toEqual({
      side: 'RED',
      label: 'Red Side',
      color: 'red',
    });
  });

  it('falls back to cellId 0..4 for Blue Side', () => {
    for (let cellId = 0; cellId < 5; cellId += 1) {
      expect(readMapSide({ myTeam: [{ cellId }] })).toEqual({
        side: 'BLUE',
        label: 'Blue Side',
        color: 'blue',
      });
    }
  });

  it('falls back to cellId 5..9 for Red Side', () => {
    for (let cellId = 5; cellId < 10; cellId += 1) {
      expect(readMapSide({ myTeam: [{ cellId }] })).toEqual({
        side: 'RED',
        label: 'Red Side',
        color: 'red',
      });
    }
  });

  it('returns empty result for non-standard cellIds and teams', () => {
    expect(readMapSide({ myTeam: [{ cellId: 10 }] })).toEqual({
      side: '',
      label: '',
      color: '',
    });
    expect(readMapSide({ myTeam: [{ cellId: -1 }] })).toEqual({
      side: '',
      label: '',
      color: '',
    });
    expect(readMapSide({ myTeam: [{ team: 3 }] })).toEqual({
      side: '',
      label: '',
      color: '',
    });
    expect(readMapSide({ myTeam: [{ cellId: 'invalid' }] })).toEqual({
      side: '',
      label: '',
      color: '',
    });
  });

  it('handles missing or empty session objects', () => {
    expect(readMapSide(null)).toEqual({ side: '', label: '', color: '' });
    expect(readMapSide(undefined)).toEqual({ side: '', label: '', color: '' });
    expect(readMapSide({})).toEqual({ side: '', label: '', color: '' });
    expect(readMapSide({ myTeam: [] })).toEqual({ side: '', label: '', color: '' });
    expect(readMapSide({ myTeam: null })).toEqual({ side: '', label: '', color: '' });
  });
});

describe('formatMapSideBadge', () => {
  it('formats blue and red badges', () => {
    expect(formatMapSideBadge({ side: 'BLUE', label: 'Blue Side', color: 'blue' })).toBe(
      '<span class="drake-map-side is-blue">Blue Side</span>',
    );
    expect(formatMapSideBadge({ side: 'RED', label: 'Red Side', color: 'red' })).toBe(
      '<span class="drake-map-side is-red">Red Side</span>',
    );
  });

  it('returns empty string for missing or incomplete side info', () => {
    expect(formatMapSideBadge(null)).toBe('');
    expect(formatMapSideBadge(undefined)).toBe('');
    expect(formatMapSideBadge({ side: '', label: '', color: '' })).toBe('');
    expect(formatMapSideBadge({ side: 'BLUE' })).toBe('');
  });
});
