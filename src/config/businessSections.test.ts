import { describe, it, expect } from 'vitest';
import { resolveSection } from './businessSections';

describe('resolveSection', () => {
  it('defaults to overview when the section param is missing or invalid', () => {
    expect(resolveSection(undefined, undefined)).toEqual({ section: 'overview', subTab: null });
    expect(resolveSection('not-a-real-section', 'x')).toEqual({ section: 'overview', subTab: null });
  });

  it('falls back to the default subtab when the subtab param is missing or invalid', () => {
    expect(resolveSection('finance', undefined)).toEqual({ section: 'finance', subTab: 'capital' });
    expect(resolveSection('finance', 'not-a-real-subtab')).toEqual({ section: 'finance', subTab: 'capital' });
  });

  it('passes through a valid section+subtab pair unchanged', () => {
    expect(resolveSection('inventory', 'bom')).toEqual({ section: 'inventory', subTab: 'bom' });
    expect(resolveSection('hr', 'payroll')).toEqual({ section: 'hr', subTab: 'payroll' });
  });

  it('overview never carries a subtab even if one is passed', () => {
    expect(resolveSection('overview', 'capital')).toEqual({ section: 'overview', subTab: null });
  });
});
