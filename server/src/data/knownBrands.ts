import type { Gender } from './questions.js';

/**
 * Pakistani fashion brands shoppers can name as preferences in the quiz. Names only: no logos,
 * products or partnership implied. A brand starts affecting recommendations once its catalog is
 * added to the registry under the same id (with the brand's written permission).
 */
export interface KnownBrand {
  id: string;
  name: string;
  genders: Gender[];
}

export const KNOWN_BRANDS: KnownBrand[] = [
  // Women's list (order as shown to women)
  { id: 'khaadi', name: 'Khaadi', genders: ['female', 'male'] },
  { id: 'sapphire', name: 'Sapphire', genders: ['female', 'male'] },
  { id: 'maria-b', name: 'Maria B', genders: ['female'] },
  { id: 'gul-ahmed', name: 'Gul Ahmed', genders: ['female', 'male'] },
  { id: 'alkaram-studio', name: 'Alkaram Studio', genders: ['female'] },
  { id: 'sana-safinaz', name: 'Sana Safinaz', genders: ['female'] },
  { id: 'outfitters', name: 'Outfitters', genders: ['female', 'male'] },
  { id: 'ethnic', name: 'Ethnic (by Outfitters)', genders: ['female'] },
  { id: 'limelight', name: 'Limelight', genders: ['female', 'male'] },
  { id: 'beechtree', name: 'Beechtree', genders: ['female'] },
  { id: 'junaid-jamshed', name: 'J. (Junaid Jamshed)', genders: ['female', 'male'] },
  { id: 'nishat-linen', name: 'Nishat Linen', genders: ['female', 'male'] },
  { id: 'asim-jofa', name: 'Asim Jofa', genders: ['female'] },
  { id: 'bareeze', name: 'Bareeze', genders: ['female'] },
  { id: 'generation', name: 'Generation', genders: ['female'] },
  { id: 'zeen', name: 'Zeen', genders: ['female'] },
  { id: 'stylo', name: 'Stylo', genders: ['female'] },
  { id: 'almas', name: 'Almas', genders: ['female', 'male'] },
  // Men only
  { id: 'bonanza-satrangi', name: 'Bonanza Satrangi', genders: ['male'] },
  { id: 'breakout', name: 'Breakout', genders: ['female', 'male'] },
  { id: 'cambridge', name: 'Cambridge', genders: ['male'] },
  { id: 'diners', name: 'Diners', genders: ['male'] },
  { id: 'edenrobe', name: 'Edenrobe', genders: ['male'] },
  { id: 'charcoal', name: 'Charcoal', genders: ['male'] },
  { id: 'deepak-perwani', name: 'Deepak Perwani', genders: ['male'] },
  { id: 'amir-adnan', name: 'Amir Adnan', genders: ['male'] },
];

/** Men see their list in this order (the brands shared with women included). */
export const MEN_ORDER = [
  'junaid-jamshed', 'bonanza-satrangi', 'outfitters', 'breakout', 'cambridge', 'diners', 'gul-ahmed',
  'nishat-linen', 'sapphire', 'edenrobe', 'charcoal', 'almas', 'khaadi', 'limelight', 'deepak-perwani', 'amir-adnan',
];
