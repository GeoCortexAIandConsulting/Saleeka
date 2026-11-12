import type { SlotState } from '@/components/LookBoard';
import { slotsFor, type Gender, type Product, type Slot } from '@/lib/types';

/**
 * The Studio's rules for which pieces a look needs, mirroring the server (services/game.ts):
 * an outfit may bring its own bottom (and, for women, its dupatta). Women's looks: outfit, bottom,
 * shoes, and a dupatta when the challenge asks; bag and jewellery optional. Men's: outfit, bottom
 * and shoes; waistcoat and an accessory optional.
 */

export const SLOT_NAME: Record<Slot, string> = {
  main: 'Outfit',
  bottom: 'Bottom',
  dupatta: 'Dupatta / scarf',
  footwear: 'Shoes',
  bag: 'Bag',
  jewelry: 'Jewellery',
  waistcoat: 'Waistcoat',
  accessory: 'Accessory',
};

export function slotStates(main: Product | undefined, c: { gender?: Gender; wantsDupatta: boolean } | null): Partial<Record<Slot, SlotState>> {
  const bottom: SlotState = main?.includesBottom ? 'included' : 'required';
  if (c?.gender === 'male') return { main: 'required', bottom, waistcoat: 'optional', footwear: 'required', accessory: 'optional' };
  return {
    main: 'required',
    bottom,
    dupatta: main?.includesDupatta ? 'included' : c?.wantsDupatta ? 'required' : 'optional',
    footwear: 'required',
    bag: 'optional',
    jewelry: 'optional',
  };
}

/** The slots of a challenge's look, in the order they are chosen. */
export const slotsOf = (c: { gender?: Gender } | null) => slotsFor(c?.gender);
