/**
 * The whole economy, as pure functions over a plain JSON state.
 *
 * Timers are timestamps. Nothing here schedules anything: every function takes
 * `now` and works out what has happened since from stored start times, so the
 * game advances the same way whether the app was open or closed.
 *
 * Functions mutate the state they are given (the store wraps them in immer)
 * and push analytics events onto `ctx.events`.
 */
import {
  APPRENTICES,
  APPRENTICE_SALE_EVERY_MS,
  APPRENTICE_SHIFT_MS,
  CART,
  CHANNELS,
  CUSTOMER_SPOTS,
  Channel,
  DELIVERY_BATCH_CAP,
  DELIVERY_BATCH_CAP_WITH_CART,
  GOODS,
  GOOD_IDS,
  GoodId,
  ItemId,
  LEVEL_XP_TOTAL,
  MAX_LEVEL,
  MAX_REGULARS_WAITING,
  ORDERS_UNLOCK_LEVEL,
  ORDER_MAX_UNITS,
  ORDER_MIN_UNITS,
  ORDER_REFILL_MS,
  ORDER_SLOTS,
  ORDER_TRAIL_LEVELS,
  QUEUE_BASE_SLOTS,
  QUEUE_MAX_SLOTS,
  QUEUE_SLOT_PRICES,
  REGULARS,
  REGULAR_IDS,
  REGULAR_RETURN_MS,
  REGULAR_STORY_BEATS,
  RESCUE_SUPPLY,
  RegularId,
  SECOND,
  SESSION_GAP_MS,
  STALLS,
  STALL_IDS,
  START_COINS,
  START_STOCK,
  SUPPLIES,
  SUPPLY_IDS,
  StallId,
  SupplyId,
  TAILOR_OPENING_STOCK,
  WALKUP_ARRIVAL_MAX_MS,
  WALKUP_ARRIVAL_MIN_MS,
  WEDDING,
} from './config';

// --- State --------------------------------------------------------------------

export interface Job {
  good: GoodId;
  startAt: number;
  endAt: number;
}

export interface StallState {
  owned: boolean;
  slots: number;
  jobs: Job[];
}

export interface DeliveryState {
  /** Batches waiting = floor((now - cycleStart) / everyMs), capped. */
  cycleStart: number;
  /** The next batch collected costs nothing (first delivery of a new supply). */
  nextFree: boolean;
}

export type Customer =
  | { kind: 'walkup'; good: GoodId; qty: number }
  | { kind: 'regular'; regular: RegularId; good: GoodId; qty: number };

export interface Spot {
  customer: Customer | null;
  /** When an empty spot fills again. */
  refillAt: number;
}

export interface OrderLine {
  good: GoodId;
  qty: number;
}

export interface Order {
  id: number;
  lines: OrderLine[];
  pinned: boolean;
}

export interface OrderSlot {
  order: Order | null;
  refillAt: number;
}

export type WeddingStatus = 'locked' | 'offered' | 'accepted' | 'complete' | 'closed';

export interface WeddingState {
  status: WeddingStatus;
  acceptedAt: number | null;
  delivered: Partial<Record<GoodId, number>>;
}

export interface RegularState {
  /** Story beats told so far, 0 to 6. */
  beat: number;
  /** Null until the regular's level is reached. */
  nextVisitAt: number | null;
}

export interface Stats {
  activeMs: number;
  sessions: number;
  sessionsWithContested: number;
  currentSessionContested: boolean;
  /** Local calendar days the app was opened on, as YYYY-MM-DD. */
  daysOpened: string[];
  sales: Record<Channel, { count: number; coins: number }>;
  contestedSales: number;
  /** Contested sales where stock could not cover everyone who wanted the good. */
  contestedShortSales: number;
  levelUps: { level: number; activeSeconds: number; at: number }[];
}

export interface GameState {
  version: 1;
  createdAt: number;
  rngSeed: number;
  coins: number;
  xp: number;
  level: number;
  stock: Record<ItemId, number>;
  stalls: Record<StallId, StallState>;
  deliveries: Partial<Record<SupplyId, DeliveryState>>;
  hasCart: boolean;
  spots: Spot[];
  orders: OrderSlot[];
  nextOrderId: number;
  regulars: Record<RegularId, RegularState>;
  wedding: WeddingState;
  apprentices: {
    count: number;
    maySell: Record<GoodId, boolean>;
    /** The eight-hour shift restarts whenever the player is present. */
    shiftStart: number;
    nextTickAt: number;
  };
  lastSeenAt: number;
  stats: Stats;
}

export interface GameEvent {
  name: string;
  props: Record<string, string | number | boolean | null>;
}

export interface Ctx {
  now: number;
  events: GameEvent[];
}

export type Result = { ok: true } | { ok: false; reason: string };

const OK: Result = { ok: true };
const fail = (reason: string): Result => ({ ok: false, reason });

// --- Random numbers, kept in state so runs are repeatable ----------------------

function rand(s: GameState): number {
  // mulberry32
  s.rngSeed = (s.rngSeed + 0x6d2b79f5) | 0;
  let t = s.rngSeed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function randInt(s: GameState, min: number, max: number): number {
  return min + Math.floor(rand(s) * (max - min + 1));
}

function pick<T>(s: GameState, list: T[]): T {
  return list[Math.floor(rand(s) * list.length)];
}

// --- New game -------------------------------------------------------------------

export function newGame(now: number, seed = now): GameState {
  const stock = {} as Record<ItemId, number>;
  for (const id of SUPPLY_IDS) stock[id] = 0;
  for (const id of GOOD_IDS) stock[id] = 0;
  for (const [id, n] of Object.entries(START_STOCK)) stock[id as ItemId] = n ?? 0;

  const maySell = {} as Record<GoodId, boolean>;
  for (const id of GOOD_IDS) maySell[id] = GOODS[id].apprenticeDefault;

  const regulars = {} as Record<RegularId, RegularState>;
  for (const id of REGULAR_IDS) regulars[id] = { beat: 0, nextVisitAt: null };

  const sales = {} as Stats['sales'];
  for (const ch of Object.keys(CHANNELS) as Channel[]) sales[ch] = { count: 0, coins: 0 };

  // The first customers trickle in over the first half minute.
  const firstArrivals = [0, 4 * SECOND, 15 * SECOND, 30 * SECOND];

  const s: GameState = {
    version: 1,
    createdAt: now,
    rngSeed: seed | 0,
    coins: START_COINS,
    xp: 0,
    level: 0,
    stock,
    stalls: {
      food: { owned: true, slots: QUEUE_BASE_SLOTS, jobs: [] },
      dye: { owned: false, slots: QUEUE_BASE_SLOTS, jobs: [] },
      tailor: { owned: false, slots: QUEUE_BASE_SLOTS, jobs: [] },
    },
    deliveries: {},
    hasCart: false,
    spots: Array.from({ length: CUSTOMER_SPOTS }, (_, i) => ({
      customer: null,
      refillAt: now + (firstArrivals[i] ?? WALKUP_ARRIVAL_MAX_MS),
    })),
    orders: Array.from({ length: ORDER_SLOTS }, () => ({ order: null, refillAt: now })),
    nextOrderId: 1,
    regulars,
    wedding: { status: 'locked', acceptedAt: null, delivered: {} },
    apprentices: { count: 0, maySell, shiftStart: now, nextTickAt: now + APPRENTICE_SALE_EVERY_MS },
    lastSeenAt: now,
    stats: {
      activeMs: 0,
      sessions: 0,
      sessionsWithContested: 0,
      currentSessionContested: false,
      daysOpened: [],
      sales,
      contestedSales: 0,
      contestedShortSales: 0,
      levelUps: [],
    },
  };

  const ctx: Ctx = { now, events: [] };
  enterLevel(s, ctx, 1);
  // The player starts with flour in hand, so the first flour batch is not a gift.
  s.deliveries.flour = { cycleStart: now, nextFree: false };
  refreshCustomers(s, ctx);
  return s;
}

// --- Levels ---------------------------------------------------------------------

export function xpProgress(s: GameState): { into: number; needed: number } {
  if (s.level >= MAX_LEVEL) return { into: 0, needed: 0 };
  const base = LEVEL_XP_TOTAL[s.level];
  return { into: s.xp - base, needed: LEVEL_XP_TOTAL[s.level + 1] - base };
}

function enterLevel(s: GameState, ctx: Ctx, level: number) {
  s.level = level;
  for (const id of SUPPLY_IDS) {
    if (SUPPLIES[id].level === level) {
      // One batch is waiting straight away, and it is free.
      s.deliveries[id] = { cycleStart: ctx.now - SUPPLIES[id].everyMs, nextFree: true };
    }
  }
  for (const id of REGULAR_IDS) {
    if (REGULARS[id].level === level) s.regulars[id].nextVisitAt = ctx.now;
  }
  if (level === ORDERS_UNLOCK_LEVEL) {
    for (const slot of s.orders) slot.refillAt = ctx.now;
  }
  if (level === WEDDING.level && s.wedding.status === 'locked') s.wedding.status = 'offered';
}

function applyLevelUps(s: GameState, ctx: Ctx) {
  while (s.level < MAX_LEVEL && s.xp >= LEVEL_XP_TOTAL[s.level + 1]) {
    enterLevel(s, ctx, s.level + 1);
    const activeSeconds = Math.round(s.stats.activeMs / 1000);
    s.stats.levelUps.push({ level: s.level, activeSeconds, at: ctx.now });
    ctx.events.push({ name: 'level_up', props: { level: s.level, active_seconds: activeSeconds } });
  }
}

// --- Deliveries -------------------------------------------------------------------

export function batchCap(s: GameState): number {
  return s.hasCart ? DELIVERY_BATCH_CAP_WITH_CART : DELIVERY_BATCH_CAP;
}

export function deliveryStatus(s: GameState, id: SupplyId, now: number) {
  const d = s.deliveries[id];
  if (!d) return null;
  const def = SUPPLIES[id];
  const cap = batchCap(s);
  const elapsed = Math.max(0, now - d.cycleStart);
  const waiting = Math.min(cap, Math.floor(elapsed / def.everyMs));
  const free = waiting > 0 && (d.nextFree || (id === RESCUE_SUPPLY && isStuck(s, now)));
  return {
    waiting,
    cap,
    /** Null when the cart is full and the supplier has stopped. */
    nextArrivalAt: waiting < cap ? d.cycleStart + (waiting + 1) * def.everyMs : null,
    /** Start of the batch now on its way, for drawing progress. */
    currentStartAt: d.cycleStart + waiting * def.everyMs,
    cost: free ? 0 : def.cost * def.units,
    free,
  };
}

export function collectDelivery(s: GameState, ctx: Ctx, id: SupplyId): Result {
  const st = deliveryStatus(s, id, ctx.now);
  const d = s.deliveries[id];
  if (!st || !d) return fail('Not unlocked yet');
  if (st.waiting < 1) return fail('Nothing has arrived yet');
  if (s.coins < st.cost) return fail('Not enough coins');
  const def = SUPPLIES[id];
  s.coins -= st.cost;
  s.stock[id] += def.units;
  // Take one batch off the pile. If the pile was full the supplier had stopped,
  // so the clock for the next batch starts now.
  const left = st.waiting - 1;
  d.cycleStart = st.waiting >= st.cap ? ctx.now - left * def.everyMs : d.cycleStart + def.everyMs;
  if (d.nextFree) d.nextFree = false;
  ctx.events.push({
    name: 'delivery_collected',
    props: { supply: id, cost: st.cost, free: st.free, batches_waiting: st.waiting },
  });
  return OK;
}

/**
 * Prototype safety net, not in the design doc: with no goods, no jobs, nothing
 * craftable, no free batch and too few coins for flour, the player could never
 * earn again. In that case Iya Kemi covers one flour batch.
 */
export function isStuck(s: GameState, now: number): boolean {
  const flour = SUPPLIES[RESCUE_SUPPLY];
  if (s.coins >= flour.cost * flour.units) return false;
  if (GOOD_IDS.some((g) => s.stock[g] > 0)) return false;
  if (STALL_IDS.some((id) => s.stalls[id].jobs.length > 0)) return false;
  if (GOOD_IDS.some((g) => canCraft(s, g).ok)) return false;
  for (const id of SUPPLY_IDS) {
    const d = s.deliveries[id];
    if (d && d.nextFree && now - d.cycleStart >= SUPPLIES[id].everyMs) return false;
  }
  return true;
}

// --- Queues -----------------------------------------------------------------------

export function isUnlocked(s: GameState, good: GoodId): boolean {
  return s.level >= GOODS[good].level;
}

function isCraftable(s: GameState, good: GoodId): boolean {
  return isUnlocked(s, good) && s.stalls[GOODS[good].stall].owned;
}

export function canCraft(s: GameState, good: GoodId): Result {
  const def = GOODS[good];
  const stall = s.stalls[def.stall];
  if (!stall.owned) return fail(`${STALLS[def.stall].name} not bought yet`);
  if (!isUnlocked(s, good)) return fail(`Opens at level ${def.level}`);
  if (stall.jobs.length >= stall.slots) return fail('Queue is full');
  for (const [input, n] of Object.entries(def.inputs)) {
    if (s.stock[input as ItemId] < (n ?? 0)) return fail('Missing inputs');
  }
  return OK;
}

/** Inputs are taken when the job is queued. Each stall crafts one job at a time. */
export function queueJob(s: GameState, ctx: Ctx, good: GoodId): Result {
  const check = canCraft(s, good);
  if (!check.ok) return check;
  const def = GOODS[good];
  const stall = s.stalls[def.stall];
  for (const [input, n] of Object.entries(def.inputs)) s.stock[input as ItemId] -= n ?? 0;
  const last = stall.jobs[stall.jobs.length - 1];
  const startAt = last ? Math.max(ctx.now, last.endAt) : ctx.now;
  stall.jobs.push({ good, startAt, endAt: startAt + def.craftMs });
  ctx.events.push({
    name: 'job_queued',
    props: { good, stall: def.stall, queue_length: stall.jobs.length, slots: stall.slots },
  });
  return OK;
}

/** Moves every job finished by `upTo` into stock. */
function finishJobs(s: GameState, upTo: number, done: Partial<Record<GoodId, number>>) {
  for (const id of STALL_IDS) {
    const stall = s.stalls[id];
    while (stall.jobs.length > 0 && stall.jobs[0].endAt <= upTo) {
      const job = stall.jobs.shift()!;
      s.stock[job.good] += 1;
      done[job.good] = (done[job.good] ?? 0) + 1;
    }
  }
}

// --- Kept-back stock ----------------------------------------------------------------

export function weddingRemaining(s: GameState): Partial<Record<GoodId, number>> {
  const out: Partial<Record<GoodId, number>> = {};
  for (const [good, n] of Object.entries(WEDDING.needs)) {
    const left = (n ?? 0) - (s.wedding.delivered[good as GoodId] ?? 0);
    if (left > 0) out[good as GoodId] = left;
  }
  return out;
}

/** Stock held for pinned orders and the accepted wedding. Apprentices never sell it. */
export function keptBack(s: GameState): Partial<Record<GoodId, number>> {
  const out: Partial<Record<GoodId, number>> = {};
  const add = (good: GoodId, n: number) => (out[good] = (out[good] ?? 0) + n);
  if (s.wedding.status === 'accepted') {
    for (const [good, n] of Object.entries(weddingRemaining(s))) add(good as GoodId, n ?? 0);
  }
  for (const slot of s.orders) {
    if (slot.order?.pinned) for (const line of slot.order.lines) add(line.good, line.qty);
  }
  return out;
}

// --- Selling ------------------------------------------------------------------------

/** Which channels want this good right now. Two or more makes a sale contested. */
export function channelsWanting(s: GameState, good: GoodId): Channel[] {
  const set = new Set<Channel>();
  for (const spot of s.spots) {
    if (spot.customer?.good === good) set.add(spot.customer.kind);
  }
  for (const slot of s.orders) {
    if (slot.order?.lines.some((l) => l.good === good)) set.add('order');
  }
  if (s.wedding.status === 'accepted' && (weddingRemaining(s)[good] ?? 0) > 0) set.add('wedding');
  return [...set];
}

/** Units of this good wanted across every channel right now. */
export function unitsWanted(s: GameState, good: GoodId): number {
  let n = 0;
  for (const spot of s.spots) if (spot.customer?.good === good) n += spot.customer.qty;
  for (const slot of s.orders) for (const l of slot.order?.lines ?? []) if (l.good === good) n += l.qty;
  if (s.wedding.status === 'accepted') n += weddingRemaining(s)[good] ?? 0;
  return n;
}

export function salePrice(good: GoodId, qty: number, channel: Channel) {
  const list = GOODS[good].price * qty;
  return {
    coins: Math.round(list * CHANNELS[channel].coinMult),
    xp: list * CHANNELS[channel].xpMult,
  };
}

/** Records one sale. `wantedBy` must be read before the buyer is removed. */
function recordSale(
  s: GameState,
  ctx: Ctx,
  channel: Channel,
  good: GoodId,
  qty: number,
  wantedBy: Channel[],
  short: boolean,
) {
  const { coins, xp } = salePrice(good, qty, channel);
  s.stock[good] -= qty;
  s.coins += coins;
  s.xp += xp;
  s.stats.sales[channel].count += 1;
  s.stats.sales[channel].coins += coins;
  const contested = wantedBy.length >= 2;
  ctx.events.push({ name: 'sale', props: { channel, good, qty, coins, xp, contested, level: s.level } });
  if (contested) {
    s.stats.contestedSales += 1;
    if (short) s.stats.contestedShortSales += 1;
    if (!s.stats.currentSessionContested) {
      s.stats.currentSessionContested = true;
      s.stats.sessionsWithContested += 1;
    }
    ctx.events.push({
      name: 'contested_sale',
      props: { good, sold_to: channel, wanted_by: [...wantedBy].sort().join(','), stock_short: short, level: s.level },
    });
  }
  return { coins, xp };
}

export interface ServeOutcome {
  coins: number;
  xp: number;
  /** Set when a regular's story moved on. */
  story?: { regular: RegularId; beat: number };
}

function vacate(s: GameState, ctx: Ctx, spot: Spot) {
  spot.customer = null;
  spot.refillAt = ctx.now + randInt(s, WALKUP_ARRIVAL_MIN_MS, WALKUP_ARRIVAL_MAX_MS);
}

export function serveCustomer(
  s: GameState,
  ctx: Ctx,
  spotIndex: number,
): Result & { outcome?: ServeOutcome } {
  const spot = s.spots[spotIndex];
  const c = spot?.customer;
  if (!c) return fail('Nobody is waiting there');
  if (s.stock[c.good] < c.qty) return fail(`Not enough ${GOODS[c.good].name}`);
  const wantedBy = channelsWanting(s, c.good);
  const short = s.stock[c.good] < unitsWanted(s, c.good);
  const outcome: ServeOutcome = recordSale(s, ctx, c.kind, c.good, c.qty, wantedBy, short);
  if (c.kind === 'regular') {
    const r = s.regulars[c.regular];
    if (r.beat < REGULAR_STORY_BEATS) {
      r.beat += 1;
      outcome.story = { regular: c.regular, beat: r.beat };
      ctx.events.push({ name: 'regular_beat', props: { regular: c.regular, beat: r.beat } });
    }
    r.nextVisitAt = ctx.now + REGULAR_RETURN_MS;
  }
  vacate(s, ctx, spot);
  applyLevelUps(s, ctx);
  refresh(s, ctx);
  return { ok: true, outcome };
}

/** No penalty. A regular comes back in four hours with the same story beat. */
export function sendOnCustomer(s: GameState, ctx: Ctx, spotIndex: number): Result {
  const spot = s.spots[spotIndex];
  const c = spot?.customer;
  if (!c) return fail('Nobody is waiting there');
  if (c.kind === 'regular') s.regulars[c.regular].nextVisitAt = ctx.now + REGULAR_RETURN_MS;
  ctx.events.push({ name: 'customer_sent_on', props: { kind: c.kind, good: c.good, had_stock: s.stock[c.good] >= c.qty } });
  vacate(s, ctx, spot);
  return OK;
}

function regularWants(s: GameState, id: RegularId): GoodId {
  const def = REGULARS[id];
  const open = def.buys.filter((g) => isUnlocked(s, g));
  if (open.length === 0) return def.buys[0];
  if (def.inOrder) {
    // "Gele, then a set": move to the later favourite halfway through the story.
    const step = s.regulars[id].beat >= REGULAR_STORY_BEATS / 2 ? open.length - 1 : 0;
    return open[step];
  }
  return pick(s, open);
}

function refreshCustomers(s: GameState, ctx: Ctx) {
  for (const spot of s.spots) {
    if (spot.customer || spot.refillAt > ctx.now) continue;
    const waitingIds = new Set(
      s.spots.flatMap((sp) => (sp.customer?.kind === 'regular' ? [sp.customer.regular] : [])),
    );
    const due = REGULAR_IDS.filter((id) => {
      const at = s.regulars[id].nextVisitAt;
      return at !== null && at <= ctx.now && !waitingIds.has(id);
    }).sort((a, b) => s.regulars[a].nextVisitAt! - s.regulars[b].nextVisitAt!);
    if (due.length > 0 && waitingIds.size < MAX_REGULARS_WAITING) {
      const id = due[0];
      spot.customer = { kind: 'regular', regular: id, good: regularWants(s, id), qty: REGULARS[id].qty };
    } else {
      const pool = GOOD_IDS.filter((g) => isCraftable(s, g));
      spot.customer = { kind: 'walkup', good: pick(s, pool), qty: 1 };
    }
  }
}

// --- Orders board ---------------------------------------------------------------------

function makeOrder(s: GameState): Order | null {
  const pool = GOOD_IDS.filter(
    (g) => GOODS[g].level <= s.level - ORDER_TRAIL_LEVELS && s.stalls[GOODS[g].stall].owned,
  );
  if (pool.length === 0) return null;
  const total = randInt(s, ORDER_MIN_UNITS, ORDER_MAX_UNITS);
  const lines: OrderLine[] = [];
  if (pool.length >= 2 && rand(s) < 0.5) {
    const a = pick(s, pool);
    const b = pick(s, pool.filter((g) => g !== a));
    const qtyA = randInt(s, 1, total - 1);
    lines.push({ good: a, qty: qtyA }, { good: b, qty: total - qtyA });
  } else {
    lines.push({ good: pick(s, pool), qty: total });
  }
  return { id: s.nextOrderId++, lines, pinned: false };
}

function refreshOrders(s: GameState, ctx: Ctx) {
  if (s.level < ORDERS_UNLOCK_LEVEL) return;
  for (const slot of s.orders) {
    if (!slot.order && slot.refillAt <= ctx.now) slot.order = makeOrder(s);
  }
}

export function orderValue(order: Order) {
  let coins = 0;
  let xp = 0;
  for (const line of order.lines) {
    const p = salePrice(line.good, line.qty, 'order');
    coins += p.coins;
    xp += p.xp;
  }
  return { coins, xp };
}

export function canFillOrder(s: GameState, order: Order): boolean {
  return order.lines.every((l) => s.stock[l.good] >= l.qty);
}

/** Orders pay only when complete. */
export function fillOrder(s: GameState, ctx: Ctx, slotIndex: number): Result & { outcome?: ServeOutcome } {
  const slot = s.orders[slotIndex];
  const order = slot?.order;
  if (!order) return fail('No order there');
  if (!canFillOrder(s, order)) return fail('You do not have everything yet');
  const wanted = order.lines.map((l) => channelsWanting(s, l.good));
  const short = order.lines.map((l) => s.stock[l.good] < unitsWanted(s, l.good));
  const outcome: ServeOutcome = { coins: 0, xp: 0 };
  order.lines.forEach((line, i) => {
    const r = recordSale(s, ctx, 'order', line.good, line.qty, wanted[i], short[i]);
    outcome.coins += r.coins;
    outcome.xp += r.xp;
  });
  slot.order = null;
  slot.refillAt = ctx.now + ORDER_REFILL_MS;
  applyLevelUps(s, ctx);
  refresh(s, ctx);
  return { ok: true, outcome };
}

/** Skipping is free. */
export function skipOrder(s: GameState, ctx: Ctx, slotIndex: number): Result {
  const slot = s.orders[slotIndex];
  if (!slot?.order) return fail('No order there');
  ctx.events.push({ name: 'order_skipped', props: { units: slot.order.lines.reduce((n, l) => n + l.qty, 0), level: s.level } });
  slot.order = null;
  slot.refillAt = ctx.now + ORDER_REFILL_MS;
  return OK;
}

export function togglePinOrder(s: GameState, slotIndex: number): Result {
  const order = s.orders[slotIndex]?.order;
  if (!order) return fail('No order there');
  order.pinned = !order.pinned;
  return OK;
}

// --- The wedding ------------------------------------------------------------------------

export function weddingValue() {
  let coins = 0;
  let xp = 0;
  for (const [good, n] of Object.entries(WEDDING.needs)) {
    const p = salePrice(good as GoodId, n ?? 0, 'wedding');
    coins += p.coins;
    xp += p.xp;
  }
  return { coins, xp };
}

export function acceptWedding(s: GameState, ctx: Ctx): Result {
  if (s.wedding.status !== 'offered') return fail('The wedding is not on offer');
  s.wedding.status = 'accepted';
  s.wedding.acceptedAt = ctx.now;
  ctx.events.push({ name: 'wedding_accepted', props: { level: s.level } });
  return OK;
}

/** Hands over whatever is in stock. A part-filled order pays for what was delivered. */
export function deliverWedding(s: GameState, ctx: Ctx): Result & { outcome?: ServeOutcome } {
  if (s.wedding.status !== 'accepted') return fail('The wedding has not been accepted');
  const remaining = weddingRemaining(s);
  const outcome: ServeOutcome = { coins: 0, xp: 0 };
  let units = 0;
  for (const [g, left] of Object.entries(remaining)) {
    const good = g as GoodId;
    const give = Math.min(left ?? 0, s.stock[good]);
    if (give <= 0) continue;
    const wantedBy = channelsWanting(s, good);
    const short = s.stock[good] < unitsWanted(s, good);
    const r = recordSale(s, ctx, 'wedding', good, give, wantedBy, short);
    s.wedding.delivered[good] = (s.wedding.delivered[good] ?? 0) + give;
    outcome.coins += r.coins;
    outcome.xp += r.xp;
    units += give;
  }
  if (units === 0) return fail('Nothing in stock for the wedding yet');
  if (Object.keys(weddingRemaining(s)).length === 0) {
    s.wedding.status = 'complete';
    ctx.events.push({ name: 'wedding_complete', props: { hours: (ctx.now - (s.wedding.acceptedAt ?? ctx.now)) / 3600000 } });
  }
  applyLevelUps(s, ctx);
  refresh(s, ctx);
  return { ok: true, outcome };
}

// --- Purchases --------------------------------------------------------------------------

function spend(s: GameState, ctx: Ctx, what: string, level: number, price: number): Result {
  if (s.level < level) return fail(`Opens at level ${level}`);
  if (s.coins < price) return fail('Not enough coins');
  s.coins -= price;
  ctx.events.push({ name: 'purchase', props: { what, price, level: s.level } });
  return OK;
}

export function buyStall(s: GameState, ctx: Ctx, id: StallId): Result {
  if (s.stalls[id].owned) return fail('Already yours');
  const r = spend(s, ctx, `stall_${id}`, STALLS[id].level, STALLS[id].price);
  if (!r.ok) return r;
  s.stalls[id].owned = true;
  if (id === 'tailor') {
    for (const [item, n] of Object.entries(TAILOR_OPENING_STOCK)) s.stock[item as ItemId] += n ?? 0;
  }
  return OK;
}

export function nextSlot(s: GameState, id: StallId) {
  const next = s.stalls[id].slots + 1;
  return next <= QUEUE_MAX_SLOTS ? { slot: next, ...QUEUE_SLOT_PRICES[next] } : null;
}

export function buySlot(s: GameState, ctx: Ctx, id: StallId): Result {
  if (!s.stalls[id].owned) return fail('Buy the stall first');
  const next = nextSlot(s, id);
  if (!next) return fail('No more slots');
  const r = spend(s, ctx, `slot_${next.slot}_${id}`, next.level, next.price);
  if (!r.ok) return r;
  s.stalls[id].slots = next.slot;
  return OK;
}

export function buyCart(s: GameState, ctx: Ctx): Result {
  if (s.hasCart) return fail('Already yours');
  const r = spend(s, ctx, 'cart', CART.level, CART.price);
  if (!r.ok) return r;
  // Batches that "would have" arrived while the old cart was full do not appear.
  for (const id of SUPPLY_IDS) {
    const d = s.deliveries[id];
    if (!d) continue;
    const floor = ctx.now - DELIVERY_BATCH_CAP * SUPPLIES[id].everyMs;
    if (d.cycleStart < floor) d.cycleStart = floor;
  }
  s.hasCart = true;
  return OK;
}

export function nextApprentice(s: GameState) {
  return APPRENTICES[s.apprentices.count] ?? null;
}

export function buyApprentice(s: GameState, ctx: Ctx): Result {
  const next = nextApprentice(s);
  if (!next) return fail('No more apprentices');
  const r = spend(s, ctx, `apprentice_${s.apprentices.count + 1}`, next.level, next.price);
  if (!r.ok) return r;
  if (s.apprentices.count === 0) {
    s.apprentices.shiftStart = ctx.now;
    s.apprentices.nextTickAt = ctx.now + APPRENTICE_SALE_EVERY_MS;
  }
  s.apprentices.count += 1;
  return OK;
}

export function setApprenticeMaySell(s: GameState, good: GoodId, on: boolean) {
  s.apprentices.maySell[good] = on;
}

// --- Catching up ------------------------------------------------------------------------

export interface SettleSummary {
  jobsDone: Partial<Record<GoodId, number>>;
  apprenticeSold: Partial<Record<GoodId, number>>;
  apprenticeCoins: number;
}

function apprenticeSale(s: GameState, summary: SettleSummary) {
  const held = keptBack(s);
  const pool = GOOD_IDS.filter((g) => s.apprentices.maySell[g] && s.stock[g] - (held[g] ?? 0) > 0);
  if (pool.length === 0) return;
  const good = pick(s, pool);
  const { coins } = salePrice(good, 1, 'apprentice');
  s.stock[good] -= 1;
  s.coins += coins;
  s.stats.sales.apprentice.count += 1;
  s.stats.sales.apprentice.coins += coins;
  summary.apprenticeSold[good] = (summary.apprenticeSold[good] ?? 0) + 1;
  summary.apprenticeCoins += coins;
}

function refresh(s: GameState, ctx: Ctx) {
  refreshCustomers(s, ctx);
  refreshOrders(s, ctx);
}

/**
 * Brings the state up to `now`: finishes jobs, runs apprentice sales in time
 * order with those jobs, closes the wedding window, and refills customers and
 * orders. Safe to call as often as you like.
 */
export function settle(s: GameState, ctx: Ctx): SettleSummary {
  const summary: SettleSummary = { jobsDone: {}, apprenticeSold: {}, apprenticeCoins: 0 };
  const a = s.apprentices;
  if (a.count > 0) {
    const shiftEnd = a.shiftStart + APPRENTICE_SHIFT_MS;
    let t = a.nextTickAt;
    while (t <= ctx.now && t <= shiftEnd) {
      finishJobs(s, t, summary.jobsDone);
      for (let i = 0; i < a.count; i++) apprenticeSale(s, summary);
      t += APPRENTICE_SALE_EVERY_MS;
    }
    a.nextTickAt = t;
  }
  finishJobs(s, ctx.now, summary.jobsDone);

  if (summary.apprenticeCoins > 0) {
    ctx.events.push({
      name: 'apprentice_sales',
      props: {
        units: Object.values(summary.apprenticeSold).reduce((n, v) => n + (v ?? 0), 0),
        coins: summary.apprenticeCoins,
      },
    });
  }

  const w = s.wedding;
  if (w.status === 'accepted' && w.acceptedAt !== null && ctx.now >= w.acceptedAt + WEDDING.windowMs) {
    w.status = 'closed';
    const delivered = Object.values(w.delivered).reduce((n, v) => n + (v ?? 0), 0);
    ctx.events.push({ name: 'wedding_closed', props: { units_delivered: delivered } });
  }

  applyLevelUps(s, ctx);
  refresh(s, ctx);
  return summary;
}

/**
 * Call when the player is looking at the game. Restarts the apprentices' shift
 * and counts sessions and days. Returns how long the player was away.
 */
export function markPresent(s: GameState, ctx: Ctx, localDay: string): { awayMs: number; newSession: boolean } {
  const awayMs = Math.max(0, ctx.now - s.lastSeenAt);
  const newSession = s.stats.sessions === 0 || awayMs >= SESSION_GAP_MS;
  if (newSession) {
    s.stats.sessions += 1;
    s.stats.currentSessionContested = false;
    const firstDay = s.stats.daysOpened[0] ?? localDay;
    if (!s.stats.daysOpened.includes(localDay)) s.stats.daysOpened.push(localDay);
    ctx.events.push({
      name: 'session_start',
      props: {
        session_number: s.stats.sessions,
        away_seconds: Math.round(awayMs / 1000),
        days_opened: s.stats.daysOpened.length,
        first_day: firstDay,
        level: s.level,
      },
    });
  }
  s.apprentices.shiftStart = ctx.now;
  if (s.apprentices.nextTickAt <= ctx.now) s.apprentices.nextTickAt = ctx.now + APPRENTICE_SALE_EVERY_MS;
  s.lastSeenAt = ctx.now;
  return { awayMs, newSession };
}

export function addActiveTime(s: GameState, ms: number) {
  s.stats.activeMs += ms;
}
