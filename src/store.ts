import { produce } from 'immer';
import { createMMKV } from 'react-native-mmkv';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { clearEventLog, track } from './analytics';
import { AWAY_SUMMARY_MIN_MS, GOODS, GoodId, LEVEL_OPENS, RegularId, StallId, SupplyId } from './game/config';
import * as E from './game/engine';
import { STORY } from './game/story';

const storage = createMMKV({ id: 'market-street' });

// --- Things on screen that are not saved --------------------------------------

export type Card =
  | { kind: 'levelUp'; level: number; opens: string }
  | { kind: 'story'; regular: RegularId; beat: number; text: string }
  | { kind: 'away'; awayMs: number; summary: E.SettleSummary };

export interface Toast {
  id: number;
  text: string;
  tone: 'good' | 'plain' | 'bad';
}

interface UiState {
  toasts: Toast[];
  cards: Card[];
  toast: (text: string, tone?: Toast['tone']) => void;
  dismissToast: (id: number) => void;
  pushCard: (card: Card) => void;
  dismissCard: () => void;
}

let toastId = 1;

export const useUi = create<UiState>((set) => ({
  toasts: [],
  cards: [],
  toast: (text, tone = 'plain') => {
    const id = toastId++;
    set((u) => ({ toasts: [...u.toasts.slice(-3), { id, text, tone }] }));
    setTimeout(() => useUi.getState().dismissToast(id), 1800);
  },
  dismissToast: (id) => set((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) })),
  pushCard: (card) => set((u) => ({ cards: [...u.cards, card] })),
  dismissCard: () => set((u) => ({ cards: u.cards.slice(1) })),
}));

// --- The saved game ---------------------------------------------------------------

interface GameStore {
  game: E.GameState;
  /** Development only: added to the clock to skip time. */
  clockOffset: number;
  now: () => number;

  /**
   * Called when the app comes to the front and about once a second while it
   * stays there. This only redraws and catches up from timestamps; it is not
   * what moves the game forward.
   */
  tick: (activeMs: number) => void;

  collect: (id: SupplyId) => void;
  queue: (good: GoodId) => void;
  serve: (spot: number) => void;
  sendOn: (spot: number) => void;
  fillOrder: (slot: number) => void;
  skipOrder: (slot: number) => void;
  pinOrder: (slot: number) => void;
  acceptWedding: () => void;
  deliverWedding: () => void;
  buyStall: (id: StallId) => void;
  buySlot: (id: StallId) => void;
  buyCart: () => void;
  buyApprentice: () => void;
  setMaySell: (good: GoodId, on: boolean) => void;

  skipTime: (ms: number) => void;
  reset: () => void;
}

function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => {
      /** Settles the game to now, runs `fn` on it, saves, and sends the events. */
      function run<T>(fn: (s: E.GameState, ctx: E.Ctx) => T): { out: T; summary: E.SettleSummary } {
        const ctx: E.Ctx = { now: get().now(), events: [] };
        const before = get().game;
        let out!: T;
        let summary!: E.SettleSummary;
        const game = produce(before, (draft) => {
          summary = E.settle(draft, ctx);
          out = fn(draft, ctx);
        });
        if (game !== before) set({ game });
        track(ctx.events, ctx.now);
        const ui = useUi.getState();
        for (let level = before.level + 1; level <= game.level; level++) {
          ui.pushCard({ kind: 'levelUp', level, opens: LEVEL_OPENS[level] });
        }
        return { out, summary };
      }

      /** Runs a player action and shows why if it was refused. */
      function act(fn: (s: E.GameState, ctx: E.Ctx) => E.Result) {
        const { out } = run(fn);
        if (!out.ok) useUi.getState().toast(out.reason, 'bad');
        return out;
      }

      function paid(outcome: E.ServeOutcome | undefined) {
        if (!outcome) return;
        const ui = useUi.getState();
        ui.toast(`+${outcome.coins} coins${outcome.xp ? `  +${outcome.xp} XP` : ''}`, 'good');
        if (outcome.story) {
          const { regular, beat } = outcome.story;
          ui.pushCard({ kind: 'story', regular, beat, text: STORY[regular][beat - 1] });
        }
      }

      return {
        game: E.newGame(Date.now()),
        clockOffset: 0,
        now: () => Date.now() + get().clockOffset,

        tick: (activeMs) => {
          const { out, summary } = run((s, ctx) => {
            const present = E.markPresent(s, ctx, localDay(ctx.now));
            E.addActiveTime(s, activeMs);
            return present;
          });
          const ui = useUi.getState();
          if (out.awayMs >= AWAY_SUMMARY_MIN_MS) {
            ui.pushCard({ kind: 'away', awayMs: out.awayMs, summary });
            return;
          }
          for (const [good, n] of Object.entries(summary.jobsDone)) {
            ui.toast(`${n} × ${GOODS[good as GoodId].name} ready`);
          }
        },

        collect: (id) => {
          act((s, ctx) => E.collectDelivery(s, ctx, id));
        },
        queue: (good) => {
          act((s, ctx) => E.queueJob(s, ctx, good));
        },
        serve: (spot) => {
          const r = run((s, ctx) => E.serveCustomer(s, ctx, spot)).out;
          if (!r.ok) useUi.getState().toast(r.reason, 'bad');
          else paid(r.outcome);
        },
        sendOn: (spot) => {
          act((s, ctx) => E.sendOnCustomer(s, ctx, spot));
        },
        fillOrder: (slot) => {
          const r = run((s, ctx) => E.fillOrder(s, ctx, slot)).out;
          if (!r.ok) useUi.getState().toast(r.reason, 'bad');
          else paid(r.outcome);
        },
        skipOrder: (slot) => {
          act((s, ctx) => E.skipOrder(s, ctx, slot));
        },
        pinOrder: (slot) => {
          act((s) => E.togglePinOrder(s, slot));
        },
        acceptWedding: () => {
          act((s, ctx) => E.acceptWedding(s, ctx));
        },
        deliverWedding: () => {
          const r = run((s, ctx) => E.deliverWedding(s, ctx)).out;
          if (!r.ok) useUi.getState().toast(r.reason, 'bad');
          else paid(r.outcome);
        },
        buyStall: (id) => {
          act((s, ctx) => E.buyStall(s, ctx, id));
        },
        buySlot: (id) => {
          act((s, ctx) => E.buySlot(s, ctx, id));
        },
        buyCart: () => {
          act((s, ctx) => E.buyCart(s, ctx));
        },
        buyApprentice: () => {
          act((s, ctx) => E.buyApprentice(s, ctx));
        },
        setMaySell: (good, on) => {
          run((s) => E.setApprenticeMaySell(s, good, on));
        },

        skipTime: (ms) => {
          set({ clockOffset: get().clockOffset + ms });
          get().tick(0);
        },
        reset: () => {
          clearEventLog();
          set({ game: E.newGame(Date.now()), clockOffset: 0 });
          get().tick(0);
        },
      };
    },
    {
      name: 'save-v1',
      version: 1,
      storage: createJSONStorage(() => ({
        getItem: (key) => storage.getString(key) ?? null,
        setItem: (key, value) => storage.set(key, value),
        removeItem: (key) => {
          storage.remove(key);
        },
      })),
      partialize: (state) => ({ game: state.game, clockOffset: state.clockOffset }),
    },
  ),
);
