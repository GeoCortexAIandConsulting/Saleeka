import { describe, expect, it } from 'vitest';
import { resolveBodyShape } from '../src/services/profile.js';
import { QUESTIONS } from '../src/data/questions.js';

describe('resolveBodyShape', () => {
  it('keeps a shape the shopper picked', () => {
    expect(resolveBodyShape({ bodyShape: 'pear', shapeShoulders: 'wider', shapeWaist: 'fuller' })).toBe('pear');
  });

  it('stores nothing when skipped or for the old "prefer not to say"', () => {
    expect(resolveBodyShape({})).toBeUndefined();
    expect(resolveBodyShape({ bodyShape: 'prefer-not' })).toBeUndefined();
    expect(resolveBodyShape({ bodyShape: 'made-up' })).toBeUndefined();
  });

  it('works the shape out for "not sure"', () => {
    const r = (shapeShoulders?: any, shapeWaist?: any) => resolveBodyShape({ bodyShape: 'not-sure', shapeShoulders, shapeWaist });
    expect(r('same', 'defined')).toBe('hourglass');
    expect(r('same', 'straight')).toBe('rectangle');
    expect(r('narrower', 'defined')).toBe('pear');
    expect(r('wider', 'straight')).toBe('inverted-triangle');
    expect(r('same', 'fuller')).toBe('apple');
    expect(r('wider', 'fuller')).toBe('apple');
  });

  it('stores nothing for "not sure" when the follow-ups were skipped', () => {
    expect(resolveBodyShape({ bodyShape: 'not-sure' })).toBeUndefined();
    expect(resolveBodyShape({ bodyShape: 'not-sure', shapeShoulders: 'same' })).toBeUndefined();
  });

  it('uses the male shape list for men', () => {
    const m = (shapeShoulders?: any, shapeWaist?: any) =>
      resolveBodyShape({ gender: 'male', bodyShape: 'not-sure', shapeShoulders, shapeWaist });
    expect(m('wider', 'straight')).toBe('trapezoid');
    expect(m('wider', 'defined')).toBe('inverted-triangle');
    expect(m('same', 'straight')).toBe('rectangle');
    expect(m('narrower', 'straight')).toBe('triangle');
    expect(m('same', 'fuller')).toBe('oval');
    expect(resolveBodyShape({ gender: 'male', bodyShape: 'trapezoid' })).toBe('trapezoid');
    // A shape from the other list is not stored
    expect(resolveBodyShape({ gender: 'male', bodyShape: 'hourglass' })).toBeUndefined();
    expect(resolveBodyShape({ gender: 'female', bodyShape: 'oval' })).toBeUndefined();
  });

  it('asks gender and height before body shape', () => {
    const ids = QUESTIONS.map((q) => q.id);
    expect(ids.indexOf('gender')).toBeLessThan(ids.indexOf('bodyShape'));
    expect(ids.indexOf('heightCm')).toBeLessThan(ids.indexOf('bodyShape'));
  });

  it('only asks the follow-ups after "not sure"', () => {
    const shape = QUESTIONS.find((q) => q.id === 'bodyShape')!;
    expect(shape.options!.some((o) => o.value === 'not-sure')).toBe(true);
    expect(shape.options!.some((o) => o.value === 'prefer-not')).toBe(false);
    for (const id of ['shapeShoulders', 'shapeWaist']) {
      expect(QUESTIONS.find((q) => q.id === id)!.showIf).toEqual({ id: 'bodyShape', value: 'not-sure' });
    }
  });
});
