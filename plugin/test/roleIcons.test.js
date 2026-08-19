import { describe, it, expect } from 'vitest';
import { roleIconUrl, roleLabel } from '../src/ui/roleIcons.js';

describe('roleIcons', () => {
  it('maps assigned positions to embedded svg data uris', () => {
    expect(roleIconUrl('TOP')).toMatch(/^data:image\/svg\+xml,/);
    expect(roleIconUrl('JUNGLE')).toMatch(/^data:image\/svg\+xml,/);
    expect(roleIconUrl('MIDDLE')).toMatch(/^data:image\/svg\+xml,/);
    expect(roleIconUrl('BOTTOM')).toMatch(/^data:image\/svg\+xml,/);
    expect(roleIconUrl('UTILITY')).toMatch(/^data:image\/svg\+xml,/);
    expect(roleIconUrl('FILL')).toMatch(/^data:image\/svg\+xml,/);
  });

  it('returns empty url for unknown positions', () => {
    expect(roleIconUrl('')).toBe('');
    expect(roleIconUrl('UNSELECTED')).toBe('');
  });

  it('formats role labels for tooltips', () => {
    expect(roleLabel('UTILITY')).toBe('Support');
    expect(roleLabel('MIDDLE')).toBe('Mid');
    expect(roleLabel('TOP')).toBe('Top');
    expect(roleLabel('FILL')).toBe('Fill');
  });
});
