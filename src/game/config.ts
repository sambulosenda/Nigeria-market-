/**
 * Every threshold, price and multiplier in the game lives in this file.
 *
 * Source of truth: "Market Street: game design (version 2)".
 * If you change a number here, change it in the design doc too.
 * Values marked PROTOTYPE are not in the doc; they are choices made for the
 * grey-box and are listed in the README under "Where the build goes past the doc".
 */

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

export type StallId = 'food' | 'dye' | 'tailor';

export type SupplyId =
  | 'flour'
  | 'beans'
  | 'pepper'
  | 'plainCloth'
  | 'indigo'
  | 'thread'
  | 'beef'
  | 'rice';

export type GoodId =
  | 'puffPuff'
  | 'akara'
  | 'suya'
  | 'jollof'
  | 'indigoCloth'
  | 'adireOniko'
  | 'adireEleko'
  | 'gele'
  | 'buba'
  | 'iro'
  | 'iroBubaSet'
  | 'agbada';

export type ItemId = SupplyId | GoodId;

export type RegularId =
  | 'iyaKemi'
  | 'sade'
  | 'tunde'
  | 'ngozi'
  | 'babaDele'
  | 'alhajiSani'
  | 'folake'
  | 'chidi';

export interface SupplyDef {
  name: string;
  /** Coins per unit. */
  cost: number;
  /** Units in one delivery batch. */
  units: number;
  /** A new batch arrives this often. */
  everyMs: number;
  level: number;
}

export const SUPPLIES: Record<SupplyId, SupplyDef> = {
  flour: { name: 'Flour', cost: 3, units: 10, everyMs: 5 * MINUTE, level: 1 },
  beans: { name: 'Beans', cost: 4, units: 8, everyMs: 10 * MINUTE, level: 2 },
  pepper: { name: 'Pepper', cost: 3, units: 6, everyMs: 20 * MINUTE, level: 2 },
  plainCloth: { name: 'Plain cloth', cost: 10, units: 6, everyMs: 30 * MINUTE, level: 3 },
  indigo: { name: 'Indigo', cost: 6, units: 8, everyMs: 30 * MINUTE, level: 3 },
  thread: { name: 'Thread', cost: 4, units: 10, everyMs: 20 * MINUTE, level: 4 },
  beef: { name: 'Beef', cost: 12, units: 4, everyMs: 30 * MINUTE, level: 5 },
  rice: { name: 'Rice', cost: 6, units: 6, everyMs: 1 * HOUR, level: 8 },
};

export const SUPPLY_IDS = Object.keys(SUPPLIES) as SupplyId[];

export interface GoodDef {
  name: string;
  stall: StallId;
  inputs: Partial<Record<ItemId, number>>;
  craftMs: number;
  /** List price in coins. XP per sale equals this. */
  price: number;
  level: number;
  /**
   * Default for the "apprentices may sell" switch. Off for goods that feed
   * another craft and for the iro and buba set.
   */
  apprenticeDefault: boolean;
}

export const GOODS: Record<GoodId, GoodDef> = {
  puffPuff: { name: 'Puff-puff', stall: 'food', inputs: { flour: 2 }, craftMs: 1 * MINUTE, price: 10, level: 1, apprenticeDefault: true },
  akara: { name: 'Akara', stall: 'food', inputs: { beans: 2, pepper: 1 }, craftMs: 3 * MINUTE, price: 23, level: 2, apprenticeDefault: true },
  suya: { name: 'Suya', stall: 'food', inputs: { beef: 1, pepper: 1 }, craftMs: 8 * MINUTE, price: 42, level: 5, apprenticeDefault: true },
  jollof: { name: 'Jollof rice', stall: 'food', inputs: { rice: 2, pepper: 2 }, craftMs: 25 * MINUTE, price: 85, level: 8, apprenticeDefault: true },
  indigoCloth: { name: 'Indigo cloth', stall: 'dye', inputs: { plainCloth: 1, indigo: 1 }, craftMs: 2 * MINUTE, price: 24, level: 3, apprenticeDefault: false },
  adireOniko: { name: 'Adire oniko', stall: 'dye', inputs: { plainCloth: 1, indigo: 1, thread: 1 }, craftMs: 10 * MINUTE, price: 50, level: 6, apprenticeDefault: false },
  adireEleko: { name: 'Adire eleko', stall: 'dye', inputs: { plainCloth: 1, indigo: 2 }, craftMs: 30 * MINUTE, price: 95, level: 9, apprenticeDefault: false },
  gele: { name: 'Gele', stall: 'tailor', inputs: { indigoCloth: 1, thread: 1 }, craftMs: 5 * MINUTE, price: 48, level: 4, apprenticeDefault: true },
  buba: { name: 'Buba', stall: 'tailor', inputs: { indigoCloth: 1, thread: 2 }, craftMs: 15 * MINUTE, price: 80, level: 6, apprenticeDefault: false },
  iro: { name: 'Iro', stall: 'tailor', inputs: { adireOniko: 1, thread: 1 }, craftMs: 20 * MINUTE, price: 115, level: 7, apprenticeDefault: false },
  iroBubaSet: { name: 'Iro and buba set', stall: 'tailor', inputs: { iro: 1, buba: 1 }, craftMs: 10 * MINUTE, price: 230, level: 7, apprenticeDefault: false },
  agbada: { name: 'Agbada', stall: 'tailor', inputs: { adireEleko: 2, thread: 3 }, craftMs: 2 * HOUR, price: 420, level: 10, apprenticeDefault: true },
};

export const GOOD_IDS = Object.keys(GOODS) as GoodId[];

export function itemName(id: ItemId): string {
  return id in SUPPLIES ? SUPPLIES[id as SupplyId].name : GOODS[id as GoodId].name;
}

export const STALLS: Record<StallId, { name: string; level: number; price: number }> = {
  food: { name: 'Food stall', level: 1, price: 0 },
  dye: { name: 'Dye pit', level: 3, price: 50 },
  tailor: { name: 'Tailor', level: 4, price: 150 },
};

export const STALL_IDS: StallId[] = ['food', 'dye', 'tailor'];

/** The tailor opens with this stock, so the first gele does not wait on a cloth delivery. */
export const TAILOR_OPENING_STOCK: Partial<Record<ItemId, number>> = { indigoCloth: 3 };

// --- Levels -----------------------------------------------------------------

export const MAX_LEVEL = 10;

/** Running XP total needed to be at each level. Index is the level. */
export const LEVEL_XP_TOTAL = [0, 0, 40, 160, 400, 900, 3300, 6500, 10500, 19500, 24500];

/** Shown on the level-up card. */
export const LEVEL_OPENS: Record<number, string> = {
  1: 'Food stall, with puff-puff',
  2: 'Akara, and the orders board',
  3: 'Dye pit, with indigo cloth',
  4: 'Tailor, with the gele',
  5: 'Suya, and the first apprentice',
  6: 'Adire oniko and the buba',
  7: 'Iro, and the iro and buba set',
  8: 'Jollof rice, and the first wedding order',
  9: 'Adire eleko, and a second apprentice',
  10: 'Agbada, and a glimpse of the street\'s second row',
};

// --- Selling channels ---------------------------------------------------------

export type Channel = 'walkup' | 'regular' | 'order' | 'wedding' | 'apprentice';

export const CHANNELS: Record<Channel, { name: string; coinMult: number; xpMult: number }> = {
  walkup: { name: 'Walk-up', coinMult: 1.0, xpMult: 1 },
  regular: { name: 'Regular', coinMult: 1.2, xpMult: 1 },
  order: { name: 'Orders board', coinMult: 0.9, xpMult: 3 },
  wedding: { name: 'Wedding', coinMult: 1.5, xpMult: 3 },
  apprentice: { name: 'Apprentice', coinMult: 0.8, xpMult: 0 },
};

export const CUSTOMER_SPOTS = 4;
export const MAX_REGULARS_WAITING = 2;
/** "A new one arrives within a minute." */
export const WALKUP_ARRIVAL_MIN_MS = 5 * SECOND; // PROTOTYPE lower bound
export const WALKUP_ARRIVAL_MAX_MS = 60 * SECOND;
export const REGULAR_RETURN_MS = 4 * HOUR;
export const REGULAR_STORY_BEATS = 6;

export const ORDERS_UNLOCK_LEVEL = 2;
export const ORDER_SLOTS = 3;
export const ORDER_REFILL_MS = 10 * MINUTE;
export const ORDER_MIN_UNITS = 2;
export const ORDER_MAX_UNITS = 4;
/** Orders only ask for goods unlocked at least this many levels ago. */
export const ORDER_TRAIL_LEVELS = 1;

// --- Queues, deliveries, apprentices ------------------------------------------

export const QUEUE_BASE_SLOTS = 3;
export const QUEUE_MAX_SLOTS = 6;
/** Price and level for a stall's 4th, 5th and 6th queue slot. */
export const QUEUE_SLOT_PRICES: Record<number, { level: number; price: number }> = {
  4: { level: 3, price: 150 },
  5: { level: 6, price: 400 },
  6: { level: 8, price: 1000 },
};

export const DELIVERY_BATCH_CAP = 2;
export const DELIVERY_BATCH_CAP_WITH_CART = 3;
export const CART = { level: 6, price: 400 };

export const APPRENTICES: { level: number; price: number }[] = [
  { level: 5, price: 200 },
  { level: 9, price: 1500 },
];
export const APPRENTICE_SALE_EVERY_MS = 5 * MINUTE;
export const APPRENTICE_SHIFT_MS = 8 * HOUR;

// --- Start --------------------------------------------------------------------

export const START_COINS = 20;
export const START_STOCK: Partial<Record<ItemId, number>> = { flour: 10 };

// --- Regulars -------------------------------------------------------------------

export interface RegularDef {
  name: string;
  who: string;
  /** Favourites, in the order they come to want them. */
  buys: GoodId[];
  /** Units per visit. PROTOTYPE: the doc only says Alhaji Sani buys "in bulk". */
  qty: number;
  /** True when the favourites are wanted one after the other ("gele, then a set"). */
  inOrder?: boolean;
  level: number;
  payoff: string;
}

export const REGULARS: Record<RegularId, RegularDef> = {
  iyaKemi: { name: 'Iya Kemi', who: 'Retired trader from the stall next door', buys: ['puffPuff'], qty: 1, level: 1, payoff: 'Your guide; introduces each new stall' },
  sade: { name: 'Sade', who: 'Schoolgirl paying with small change', buys: ['puffPuff'], qty: 1, level: 2, payoff: 'Reveals who ran your stall before you' },
  tunde: { name: 'Tunde', who: 'Danfo bus driver with all the street\'s news', buys: ['akara', 'suya'], qty: 1, level: 2, payoff: 'Brings his fellow drivers as customers' },
  ngozi: { name: 'Ngozi', who: 'Student saving for her graduation', buys: ['gele', 'iroBubaSet'], qty: 1, inOrder: true, level: 4, payoff: 'Returns on graduation day wearing your set' },
  babaDele: { name: 'Baba Dele', who: 'Master tailor close to retiring', buys: ['indigoCloth'], qty: 1, level: 4, payoff: 'Hands down his agbada pattern at level 10' },
  alhajiSani: { name: 'Alhaji Sani', who: 'Cloth merchant from the north', buys: ['adireOniko', 'adireEleko'], qty: 2, level: 6, payoff: 'Cheaper plain cloth once he trusts you' },
  folake: { name: 'Folake', who: 'Bride-to-be', buys: ['iroBubaSet'], qty: 1, level: 7, payoff: 'Her wedding is the first occasion' },
  chidi: { name: 'Chidi', who: 'Food writer chasing the best jollof', buys: ['jollof', 'suya'], qty: 1, level: 8, payoff: 'His review brings more walk-up customers' },
};

export const REGULAR_IDS = Object.keys(REGULARS) as RegularId[];

// --- The wedding ----------------------------------------------------------------

export const WEDDING = {
  level: 8,
  needs: { iroBubaSet: 4, jollof: 10, suya: 10 } as Partial<Record<GoodId, number>>,
  windowMs: 48 * HOUR,
};

// --- Prototype-only choices -------------------------------------------------------

/** PROTOTYPE: if the player has nothing to sell, craft or collect and cannot pay for flour, Iya Kemi covers one batch. */
export const RESCUE_SUPPLY: SupplyId = 'flour';
/** Away for at least this long shows the "while you were away" card. */
export const AWAY_SUMMARY_MIN_MS = 2 * MINUTE;
/** PROTOTYPE: coming back after this long counts as a new session in the stats. */
export const SESSION_GAP_MS = 5 * MINUTE;
