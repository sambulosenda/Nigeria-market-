import {
  APPRENTICE_SALE_EVERY_MS,
  GOODS,
  GOOD_IDS,
  GoodId,
  HOUR,
  ItemId,
  LEVEL_XP_TOTAL,
  MINUTE,
  SECOND,
  SUPPLIES,
  WEDDING,
} from './config';
import * as E from './engine';

const T0 = 1_800_000_000_000;

function ctx(now: number): E.Ctx {
  return { now, events: [] };
}

function game(seed = 7) {
  return E.newGame(T0, seed);
}

/** Jumps a game to a level with every stall bought, for tests of later content. */
function atLevel(level: number, coins = 100_000) {
  const s = game();
  s.xp = LEVEL_XP_TOTAL[level];
  s.coins = coins;
  const c = ctx(T0);
  E.settle(s, c);
  E.buyStall(s, c, 'dye');
  E.buyStall(s, c, 'tailor');
  return s;
}

function give(s: E.GameState, items: Partial<Record<ItemId, number>>) {
  for (const [id, n] of Object.entries(items)) s.stock[id as ItemId] += n ?? 0;
}

describe('the design doc numbers', () => {
  test('every crafted item sells for more than its inputs (rule 2)', () => {
    const value = (id: ItemId): number =>
      id in SUPPLIES ? SUPPLIES[id as keyof typeof SUPPLIES].cost : GOODS[id as GoodId].price;
    for (const id of GOOD_IDS) {
      const inputs = Object.entries(GOODS[id].inputs).reduce((sum, [i, n]) => sum + value(i as ItemId) * (n ?? 0), 0);
      expect(GOODS[id].price).toBeGreaterThan(inputs);
    }
  });

  test('the orders board never pays less for a set than for its iro and buba', () => {
    const set = E.salePrice('iroBubaSet', 1, 'order').coins;
    const parts = E.salePrice('iro', 1, 'order').coins + E.salePrice('buba', 1, 'order').coins;
    expect(set).toBeGreaterThanOrEqual(parts);
  });

  test('the wedding pays 3,285 coins and 6,570 XP', () => {
    expect(E.weddingValue()).toEqual({ coins: 3285, xp: 6570 });
  });

  test('a new game starts with 20 coins, 10 flour, the food stall and Iya Kemi', () => {
    const s = game();
    expect(s.coins).toBe(20);
    expect(s.stock.flour).toBe(10);
    expect(s.level).toBe(1);
    expect(s.stalls.food.owned).toBe(true);
    expect(s.spots[0].customer).toMatchObject({ kind: 'regular', regular: 'iyaKemi', good: 'puffPuff' });
  });
});

describe('queues run on timestamps', () => {
  test('inputs are taken when queued and jobs run one at a time', () => {
    const s = game();
    const c = ctx(T0);
    expect(E.queueJob(s, c, 'puffPuff').ok).toBe(true);
    expect(E.queueJob(s, c, 'puffPuff').ok).toBe(true);
    expect(E.queueJob(s, c, 'puffPuff').ok).toBe(true);
    expect(s.stock.flour).toBe(4);
    expect(E.queueJob(s, c, 'puffPuff')).toEqual({ ok: false, reason: 'Queue is full' });
    expect(s.stalls.food.jobs.map((j) => j.endAt - T0)).toEqual([MINUTE, 2 * MINUTE, 3 * MINUTE]);

    E.settle(s, ctx(T0 + 90 * SECOND));
    expect(s.stock.puffPuff).toBe(1);
    expect(s.stalls.food.jobs).toHaveLength(2);

    // One call a day later gives the same result as watching every second.
    E.settle(s, ctx(T0 + 24 * HOUR));
    expect(s.stock.puffPuff).toBe(3);
    expect(s.stalls.food.jobs).toHaveLength(0);
  });

  test('a job queued behind a finished one starts now, not in the past', () => {
    const s = game();
    E.queueJob(s, ctx(T0), 'puffPuff');
    const later = T0 + 10 * MINUTE;
    const c = ctx(later);
    E.settle(s, c);
    E.queueJob(s, c, 'puffPuff');
    expect(s.stalls.food.jobs[0]).toMatchObject({ startAt: later, endAt: later + MINUTE });
  });
});

describe('deliveries', () => {
  test('batches stack to two, cost on collection, and the clock restarts from a full cart', () => {
    const s = game();
    s.coins = 100;
    expect(E.deliveryStatus(s, 'flour', T0 + 4 * MINUTE)!.waiting).toBe(0);
    expect(E.deliveryStatus(s, 'flour', T0 + 5 * MINUTE)!.waiting).toBe(1);
    const late = T0 + 3 * HOUR;
    expect(E.deliveryStatus(s, 'flour', late)).toMatchObject({ waiting: 2, cap: 2, nextArrivalAt: null, cost: 30 });

    expect(E.collectDelivery(s, ctx(late), 'flour').ok).toBe(true);
    expect(s.coins).toBe(70);
    expect(s.stock.flour).toBe(20);
    // One batch still waits, and the next is a full five minutes away.
    expect(E.deliveryStatus(s, 'flour', late)).toMatchObject({ waiting: 1, nextArrivalAt: late + 5 * MINUTE });
  });

  test('the first delivery of a newly unlocked supply is waiting and free', () => {
    const s = game();
    s.xp = 40;
    const c = ctx(T0 + MINUTE);
    E.settle(s, c);
    expect(s.level).toBe(2);
    expect(E.deliveryStatus(s, 'beans', c.now)).toMatchObject({ waiting: 1, cost: 0, free: true });
    const coins = s.coins;
    E.collectDelivery(s, c, 'beans');
    expect(s.coins).toBe(coins);
    expect(s.stock.beans).toBe(8);
    expect(E.deliveryStatus(s, 'beans', c.now + 10 * MINUTE)).toMatchObject({ waiting: 1, cost: 32, free: false });
  });

  test('the bigger cart holds three', () => {
    const s = atLevel(6);
    E.buyCart(s, ctx(T0));
    expect(E.deliveryStatus(s, 'flour', T0)!.waiting).toBeLessThanOrEqual(2);
    expect(E.deliveryStatus(s, 'flour', T0 + 3 * HOUR)!.waiting).toBe(3);
  });

  test('a player with nothing left is given one flour batch', () => {
    const s = game();
    s.coins = 0;
    s.stock.flour = 0;
    const later = T0 + 5 * MINUTE;
    expect(E.isStuck(s, later)).toBe(true);
    expect(E.deliveryStatus(s, 'flour', later)).toMatchObject({ cost: 0, free: true });
    expect(E.collectDelivery(s, ctx(later), 'flour').ok).toBe(true);
    expect(E.isStuck(s, later)).toBe(false);
  });
});

describe('who to serve', () => {
  test('a walk-up pays list and 1x XP; a regular pays 120% and moves the story on', () => {
    const s = game();
    give(s, { puffPuff: 5 });
    const c = ctx(T0);
    const r = E.serveCustomer(s, c, 0); // Iya Kemi
    expect(r.outcome).toMatchObject({ coins: 12, xp: 10, story: { regular: 'iyaKemi', beat: 1 } });
    expect(s.regulars.iyaKemi.nextVisitAt).toBe(T0 + 4 * HOUR);
    expect(s.spots[0].customer).toBeNull();
    expect(s.spots[0].refillAt).toBeGreaterThan(T0);
    expect(s.spots[0].refillAt).toBeLessThanOrEqual(T0 + MINUTE);

    const c2 = ctx(T0 + 2 * MINUTE);
    E.settle(s, c2);
    const i = s.spots.findIndex((sp) => sp.customer?.kind === 'walkup');
    expect(E.serveCustomer(s, c2, i).outcome).toEqual({ coins: 10, xp: 10 });
  });

  test('a regular who is sent on keeps the same beat and returns after four hours', () => {
    const s = game();
    const c = ctx(T0);
    expect(E.sendOnCustomer(s, c, 0).ok).toBe(true);
    expect(s.regulars.iyaKemi.beat).toBe(0);
    E.settle(s, ctx(T0 + 3 * HOUR));
    expect(s.spots.some((sp) => sp.customer?.kind === 'regular')).toBe(false);
    // Free a spot after she is due, and she takes it.
    const due = ctx(T0 + 4 * HOUR + MINUTE);
    E.sendOnCustomer(s, due, 1);
    E.settle(s, ctx(due.now + 2 * MINUTE));
    expect(s.spots.some((sp) => sp.customer?.kind === 'regular' && sp.customer.regular === 'iyaKemi')).toBe(true);
  });

  test('at most two regulars wait at once', () => {
    const s = atLevel(8);
    for (let step = 0; step < 20; step++) {
      const c = ctx(T0 + step * 2 * MINUTE);
      E.settle(s, c);
      const walkup = s.spots.findIndex((sp) => sp.customer?.kind === 'walkup');
      if (walkup >= 0) E.sendOnCustomer(s, c, walkup);
      const regulars = s.spots.filter((sp) => sp.customer?.kind === 'regular').length;
      expect(regulars).toBeLessThanOrEqual(2);
    }
  });

  test('orders pay 90% and 3x XP, only when complete, and refill after ten minutes', () => {
    const s = game();
    s.xp = 40;
    const c = ctx(T0);
    E.settle(s, c);
    expect(s.orders.every((o) => o.order !== null)).toBe(true);
    const order = s.orders[0].order!;
    // Orders trail the unlocks: at level 2 the board only asks for puff-puff.
    expect(s.orders.every((o) => o.order!.lines.every((l) => l.good === 'puffPuff'))).toBe(true);
    const units = order.lines.reduce((n, l) => n + l.qty, 0);
    expect(units).toBeGreaterThanOrEqual(2);
    expect(units).toBeLessThanOrEqual(4);

    expect(E.fillOrder(s, c, 0).ok).toBe(false);
    give(s, { puffPuff: units });
    const xp = s.xp;
    const r = E.fillOrder(s, c, 0);
    expect(r.outcome).toEqual({ coins: units * 9, xp: units * 30 });
    expect(s.xp).toBe(xp + units * 30);
    expect(s.orders[0].order).toBeNull();
    E.settle(s, ctx(T0 + 9 * MINUTE));
    expect(s.orders[0].order).toBeNull();
    E.settle(s, ctx(T0 + 10 * MINUTE));
    expect(s.orders[0].order).not.toBeNull();
  });

  test('a sale wanted by two channels is logged as contested', () => {
    const s = game();
    s.xp = 40;
    const c = ctx(T0);
    E.settle(s, c); // orders board now wants puff-puff, and so does Iya Kemi
    give(s, { puffPuff: 1 });
    E.markPresent(s, c, '2027-01-15');
    E.serveCustomer(s, c, 0);
    const contested = c.events.find((e) => e.name === 'contested_sale');
    expect(contested?.props).toMatchObject({ good: 'puffPuff', sold_to: 'regular' });
    expect(String(contested?.props.wanted_by)).toContain('order');
    expect(contested?.props.stock_short).toBe(true);
    expect(s.stats.contestedSales).toBe(1);
    expect(s.stats.contestedShortSales).toBe(1);
    expect(s.stats.sessionsWithContested).toBe(1);
  });

  test('a sale only one channel wanted is not contested', () => {
    const s = game();
    give(s, { puffPuff: 1 });
    s.spots.forEach((sp, i) => i > 0 && (sp.customer = null));
    const c = ctx(T0);
    E.serveCustomer(s, c, 0);
    expect(c.events.some((e) => e.name === 'contested_sale')).toBe(false);
  });
});

describe('levels', () => {
  test('XP opens levels at the doc thresholds and logs active seconds', () => {
    const s = game();
    s.stats.activeMs = 4 * MINUTE;
    s.xp = 159;
    const c = ctx(T0);
    E.settle(s, c);
    expect(s.level).toBe(2);
    s.xp = 160;
    E.settle(s, c);
    expect(s.level).toBe(3);
    expect(c.events.filter((e) => e.name === 'level_up').map((e) => e.props)).toEqual([
      { level: 2, active_seconds: 240 },
      { level: 3, active_seconds: 240 },
    ]);
    expect(s.deliveries.plainCloth).toBeDefined();
    expect(s.deliveries.thread).toBeUndefined();
  });

  test('stalls are made available by level and paid for in coins', () => {
    const s = game();
    s.coins = 500;
    const c = ctx(T0);
    expect(E.buyStall(s, c, 'dye')).toEqual({ ok: false, reason: 'Opens at level 3' });
    s.xp = 400;
    E.settle(s, c);
    expect(E.buyStall(s, c, 'dye').ok).toBe(true);
    expect(E.buyStall(s, c, 'tailor').ok).toBe(true);
    expect(s.coins).toBe(300);
    expect(s.stock.indigoCloth).toBe(3);
    expect(E.buySlot(s, c, 'food').ok).toBe(true);
    expect(s.stalls.food.slots).toBe(4);
    expect(E.buySlot(s, c, 'food')).toEqual({ ok: false, reason: 'Opens at level 6' });
  });
});

describe('apprentices', () => {
  function withApprentice() {
    const s = atLevel(5);
    E.buyApprentice(s, ctx(T0));
    s.spots.forEach((sp) => (sp.refillAt = Number.MAX_SAFE_INTEGER));
    return s;
  }

  test('sell one item every five minutes at 80%, with no XP', () => {
    const s = withApprentice();
    give(s, { puffPuff: 10 });
    const coins = s.coins;
    const xp = s.xp;
    const summary = E.settle(s, ctx(T0 + 3 * APPRENTICE_SALE_EVERY_MS));
    expect(summary.apprenticeSold).toEqual({ puffPuff: 3 });
    expect(s.coins).toBe(coins + 24);
    expect(s.xp).toBe(xp);
    expect(s.stock.puffPuff).toBe(7);
  });

  test('stop after eight hours away', () => {
    const s = withApprentice();
    give(s, { puffPuff: 500 });
    E.settle(s, ctx(T0 + 24 * HOUR));
    expect(500 - s.stock.puffPuff).toBe((8 * HOUR) / APPRENTICE_SALE_EVERY_MS);
    // Coming back starts a new shift.
    const back = ctx(T0 + 24 * HOUR);
    E.markPresent(s, back, '2027-01-16');
    const before = s.stock.puffPuff;
    E.settle(s, ctx(back.now + 10 * MINUTE));
    expect(before - s.stock.puffPuff).toBe(2);
  });

  test('never sell goods that are switched off, pinned or kept for the wedding', () => {
    const s = withApprentice();
    give(s, { indigoCloth: 5, puffPuff: 2, suya: 3 });
    s.orders[0].order = { id: 99, lines: [{ good: 'puffPuff', qty: 2 }], pinned: true };
    s.wedding = { status: 'accepted', acceptedAt: T0, delivered: {} };
    const cloth = s.stock.indigoCloth;
    E.settle(s, ctx(T0 + 2 * HOUR));
    expect(s.stock.indigoCloth).toBe(cloth); // switch is off by default
    expect(s.stock.puffPuff).toBe(2); // pinned
    expect(s.stock.suya).toBe(3); // the wedding needs ten
  });

  test('sell goods in the order they are finished while away', () => {
    const s = withApprentice();
    give(s, { flour: 2 });
    E.queueJob(s, ctx(T0), 'puffPuff'); // ready after one minute
    const summary = E.settle(s, ctx(T0 + HOUR));
    expect(summary.jobsDone).toEqual({ puffPuff: 1 });
    expect(summary.apprenticeSold).toEqual({ puffPuff: 1 });
  });
});

describe('the wedding', () => {
  test('is offered at level 8, pays for part deliveries and completes', () => {
    const s = atLevel(8);
    expect(s.wedding.status).toBe('offered');
    const c = ctx(T0);
    E.acceptWedding(s, c);
    give(s, { iroBubaSet: 1, suya: 12 });
    const coins = s.coins;
    const r = E.deliverWedding(s, c);
    expect(r.outcome).toEqual({ coins: 345 + 630, xp: 3 * (230 + 420) });
    expect(s.coins).toBe(coins + 975);
    expect(s.stock.suya).toBe(2);
    expect(E.weddingRemaining(s)).toEqual({ iroBubaSet: 3, jollof: 10 });

    give(s, { iroBubaSet: 3, jollof: 10 });
    E.deliverWedding(s, c);
    expect(s.wedding.status).toBe('complete');
    expect(s.coins).toBe(coins + 3285);
  });

  test('closes after 48 hours with no penalty', () => {
    const s = atLevel(8);
    E.acceptWedding(s, ctx(T0));
    give(s, { suya: 4 });
    E.deliverWedding(s, ctx(T0 + HOUR));
    const coins = s.coins;
    E.settle(s, ctx(T0 + WEDDING.windowMs));
    expect(s.wedding.status).toBe('closed');
    expect(s.coins).toBe(coins);
    expect(E.keptBack(s)).toEqual({});
  });
});

describe('sessions', () => {
  test('a return after the gap counts as a new session and a new day', () => {
    const s = game();
    E.markPresent(s, ctx(T0), '2027-01-15');
    E.markPresent(s, ctx(T0 + MINUTE), '2027-01-15');
    expect(s.stats.sessions).toBe(1);
    const c = ctx(T0 + 20 * HOUR);
    const r = E.markPresent(s, c, '2027-01-16');
    expect(r).toEqual({ awayMs: 20 * HOUR - MINUTE, newSession: true });
    expect(s.stats.sessions).toBe(2);
    expect(s.stats.daysOpened).toEqual(['2027-01-15', '2027-01-16']);
    expect(c.events[0]).toMatchObject({ name: 'session_start', props: { session_number: 2, days_opened: 2 } });
  });
});
