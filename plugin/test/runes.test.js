import { describe, it, expect, vi } from 'vitest';
import {
  formatRunePagePayload,
  applyRunePage,
  RUNES_PAGES_ROUTE,
  perkIconUrl,
  perkName,
  perkStyleIconUrl,
  perkStyleName,
} from '../src/features/runes.js';

describe('perk and style metadata', () => {
  it('resolves style names and icons correctly', () => {
    expect(perkStyleName(8000)).toBe('Precision');
    expect(perkStyleName(8100)).toBe('Domination');
    expect(perkStyleName(8200)).toBe('Sorcery');
    expect(perkStyleName(8300)).toBe('Inspiration');
    expect(perkStyleName(8400)).toBe('Resolve');
    expect(perkStyleName(9999)).toBe('Tree 9999');

    expect(perkStyleIconUrl(8000)).toContain('7201_Precision.png');
    expect(perkStyleIconUrl(8100)).toContain('7200_Domination.png');
  });

  it('resolves perk names and icon URLs correctly', () => {
    expect(perkName(8010)).toBe('Conqueror');
    expect(perkName(8112)).toBe('Electrocute');
    expect(perkName(8140)).toBe('Grisly Mementos');
    expect(perkName(5005)).toBe('Attack Speed');
    expect(perkName(99999)).toBe('Rune 99999');

    expect(perkIconUrl(8010)).toContain('Conqueror.png');
    expect(perkIconUrl(8112)).toContain('Electrocute.png');
    expect(perkIconUrl(8140)).toContain('GrislyMementos.png');
    expect(perkIconUrl(5008)).toContain('StatModsAdaptiveForceIcon.png');
    expect(perkIconUrl(99999)).toContain('99999.png');
  });
});

describe('formatRunePagePayload', () => {
  it('formats payload with full valid inputs', () => {
    const perks = [8010, 9111, 9104, 8014, 8139, 8135, 5005, 5008, 5003];
    const payload = formatRunePagePayload('Conqueror', 8000, 8100, perks);

    expect(payload).toEqual({
      name: 'Conqueror',
      primaryStyleId: 8000,
      subStyleId: 8100,
      selectedPerkIds: perks,
      current: true,
      isActive: true,
    });
  });

  it('converts string values to numbers for styles and perks', () => {
    const payload = formatRunePagePayload('Test Page', '8000', '8100', ['8010', '9111']);

    expect(payload).toEqual({
      name: 'Test Page',
      primaryStyleId: 8000,
      subStyleId: 8100,
      selectedPerkIds: [8010, 9111],
      current: true,
      isActive: true,
    });
  });

  it('uses fallbacks when parameters are missing or invalid', () => {
    const payload = formatRunePagePayload();

    expect(payload).toEqual({
      name: 'Drake',
      primaryStyleId: 0,
      subStyleId: 0,
      selectedPerkIds: [],
      current: true,
      isActive: true,
    });
  });

  it('handles null and invalid perk lists safely', () => {
    const payload = formatRunePagePayload('', null, undefined, null);

    expect(payload).toEqual({
      name: 'Drake',
      primaryStyleId: 0,
      subStyleId: 0,
      selectedPerkIds: [],
      current: true,
      isActive: true,
    });
  });
});

describe('applyRunePage', () => {
  const samplePageData = {
    name: 'Ahri Mid',
    primaryStyleId: 8100,
    subStyleId: 8300,
    selectedPerkIds: [8112, 8143, 8138, 8105, 8304, 8345, 5008, 5008, 5002],
  };

  it('returns failure if lcu client is missing', async () => {
    const res = await applyRunePage(null, samplePageData);
    expect(res.success).toBe(false);
    expect(res.error).toBe('LCU client is required');
  });

  it('updates an existing deletable rune page', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 1, name: 'Preset Page', isDeletable: false, isEditable: false },
        { id: 42, name: 'My Custom Page', isDeletable: true, isEditable: true },
      ]),
      put: vi.fn().mockResolvedValue({ id: 42 }),
      post: vi.fn(),
      delete: vi.fn(),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(lcu.get).toHaveBeenCalledWith(RUNES_PAGES_ROUTE);
    expect(lcu.put).toHaveBeenCalledWith(
      `${RUNES_PAGES_ROUTE}/42`,
      expect.objectContaining({
        name: 'Ahri Mid',
        primaryStyleId: 8100,
        subStyleId: 8300,
        selectedPerkIds: samplePageData.selectedPerkIds,
        current: true,
        isActive: true,
      })
    );
    expect(lcu.post).not.toHaveBeenCalled();
    expect(res).toEqual({ success: true, pageId: 42 });
  });

  it('creates a new rune page if no editable page exists', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 1, name: 'The Precision', isDeletable: false, isEditable: false },
      ]),
      put: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 101 }),
      delete: vi.fn(),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(lcu.get).toHaveBeenCalledWith(RUNES_PAGES_ROUTE);
    expect(lcu.put).not.toHaveBeenCalled();
    expect(lcu.post).toHaveBeenCalledWith(
      RUNES_PAGES_ROUTE,
      expect.objectContaining({ name: 'Ahri Mid' })
    );
    expect(res).toEqual({ success: true, pageId: 101 });
  });

  it('creates a new rune page if pages list cannot be retrieved', async () => {
    const lcu = {
      get: vi.fn().mockRejectedValue(new Error('LCU disconnected')),
      put: vi.fn(),
      post: vi.fn().mockResolvedValue({ id: 202 }),
      delete: vi.fn(),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(lcu.post).toHaveBeenCalledWith(
      RUNES_PAGES_ROUTE,
      expect.objectContaining({ name: 'Ahri Mid' })
    );
    expect(res).toEqual({ success: true, pageId: 202 });
  });

  it('deletes and recreates page if update fails with error', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 50, name: 'Old Page', isDeletable: true },
      ]),
      put: vi.fn().mockRejectedValue(new Error('Update failed')),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      post: vi.fn().mockResolvedValue({ id: 51 }),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(lcu.put).toHaveBeenCalledWith(`${RUNES_PAGES_ROUTE}/50`, expect.any(Object));
    expect(lcu.delete).toHaveBeenCalledWith(`${RUNES_PAGES_ROUTE}/50`);
    expect(lcu.post).toHaveBeenCalledWith(RUNES_PAGES_ROUTE, expect.any(Object));
    expect(res).toEqual({ success: true, pageId: 51 });
  });

  it('deletes and recreates page if update returns ok: false', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([
        { id: 50, name: 'Old Page', isEditable: true },
      ]),
      put: vi.fn().mockResolvedValue({ ok: false, status: 500 }),
      delete: vi.fn().mockResolvedValue({ ok: true }),
      post: vi.fn().mockResolvedValue({ id: 52 }),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(lcu.delete).toHaveBeenCalledWith(`${RUNES_PAGES_ROUTE}/50`);
    expect(lcu.post).toHaveBeenCalledWith(RUNES_PAGES_ROUTE, expect.any(Object));
    expect(res).toEqual({ success: true, pageId: 52 });
  });

  it('handles response objects with json() method', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: 303 }),
      }),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(res).toEqual({ success: true, pageId: 303 });
  });

  it('returns failure when post creation fails with status code', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockResolvedValue({ ok: false, status: 400 }),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(res.success).toBe(false);
    expect(res.error).toContain('400');
  });

  it('returns failure when post creation throws an exception', async () => {
    const lcu = {
      get: vi.fn().mockResolvedValue([]),
      post: vi.fn().mockRejectedValue(new Error('Network error')),
    };

    const res = await applyRunePage(lcu, samplePageData);

    expect(res.success).toBe(false);
    expect(res.error).toBe('Network error');
  });
});
