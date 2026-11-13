# Market Street: grey-box prototype

A playable build of the whole version one economy with no art. It exists to answer the three questions in the design doc, "What the prototype must prove":

1. Is collecting a delivery and filling a queue satisfying with no art at all?
2. Does the player face a real choice about who to serve at least once a session?
3. Do testers open it again the next day without being asked?

The design doc, "Market Street: game design (version 2)", is the source of truth for every number. All of them live in `src/game/config.ts`. Change a number there and in the doc together.

## Run it

```bash
npm install
npx expo start --web     # quickest look, runs in a browser
npm test                 # engine tests
npm run typecheck
```

On a phone it needs a development build, not Expo Go, because MMKV is a native module:

```bash
npx eas-cli@latest build --profile development --platform ios   # or android
npx eas-cli@latest build --profile preview --platform ios       # the build to hand to testers
```

The bundle identifier and Android package in `app.json` are `com.sambulosenda.marketstreet`. Change them before the first store upload if you want a different one.

## What is in it

- Deliveries for all 8 supplies, stacking to 2 batches (3 with the cart), paid on collection, first batch of a new supply free.
- Three stalls with queues of 3 to 6 jobs, inputs taken when queued, goods straight to stock.
- All 12 goods, levels 1 to 10 on the doc's XP curve, and every coin purchase.
- The four selling channels: walk-ups, the eight regulars with six story beats each, the orders board with pin and skip, and Folake's wedding.
- Apprentices, with the "may sell" switch per good and kept-back stock.
- A "welcome back" card after two minutes away.

## How it is built

- `src/game/config.ts`: every number.
- `src/game/engine.ts`: the economy as pure functions over a JSON state. Timers are timestamps: the state stores when a job or delivery started, and `settle(state, now)` works out everything that has happened since. The app's once-a-second interval only redraws.
- `src/game/story.ts`: placeholder story beats.
- `src/store.ts`: Zustand, saved to MMKV.
- `src/analytics.ts`: PostHog if `EXPO_PUBLIC_POSTHOG_KEY` is set (see `.env.example`), plus an on-device log of the last 500 events.
- `src/ui/`: the screens. Reanimated drives the progress bars and pop-ups.

## Reading the answers

More > Stats shows, per device: sessions with a contested sale, each channel's share of sales, sessions, days opened, and active play time at each level-up. "Share my stats and event log" exports the lot as JSON, so a five-person test works without PostHog.

Events: `session_start`, `sale`, `contested_sale`, `level_up` (with `active_seconds`), `delivery_collected`, `job_queued`, `purchase`, `order_skipped`, `customer_sent_on`, `regular_beat`, `apprentice_sales`, `wedding_accepted`, `wedding_complete`, `wedding_closed`.

In development builds, More > Stats also has buttons that skip the clock forward.

## Where the build goes past the doc

The doc leaves these open, so the prototype picks something. None changes a number in the doc.

- **First free delivery is waiting at once.** When a supply unlocks, its free batch is already there, so a new stall is usable straight away.
- **Walk-ups arrive 5 to 60 seconds after a spot empties**, and ask for any good you can currently craft, chosen evenly.
- **Regulars buy one unit, except Alhaji Sani, who buys two** ("in bulk"). Ngozi wants a gele for her first three beats and a set after that.
- **Apprentices sell a random allowed good** each time. Their eight-hour shift restarts whenever you open the app.
- **The wedding takes part deliveries.** You hand over what you have, each unit pays at 150% as it lands, and the 48-hour window closes the order with no penalty.
- **Safety net.** With no goods, no jobs, nothing to craft and fewer than 30 coins, the next flour batch is free. Without this a player who spends their last coins on a queue slot can never earn again.
- **A new session** is a return after 5 minutes away.
- **Stock shortage on contested sales.** `contested_sale` follows the doc's definition and also carries `stock_short`, true when stock could not cover everyone who wanted the good. See "Known weaknesses".

## Not built

- Story payoffs with a mechanical effect (Tunde's drivers, Alhaji Sani's cheaper cloth, Chidi's review). The story ends and the payoff is shown as text.
- Cancelling a queued job.
- Skia, RevenueCat and Sentry. Nothing in a grey-box draws, sells or ships widely enough to need them yet.
- Push notifications. Question 3 asks whether testers come back unprompted, so there are none on purpose.

## Known weaknesses

- **The contested-sale measure can overcount.** By the doc's definition a sale is contested whenever two channels want the good, even when there is plenty for everyone. The build also records `stock_short`, which is the stricter test. In a short scripted run every contested sale was also short of stock, so the gap may only show later, when stock builds up.
- **Walk-ups dominate early.** In scripted runs to level 3, walk-ups took about 73% of sales, over the 70% bar. Regulars return every 4 hours and orders refill every 10 minutes, so the first session has little else to serve.
- **Pacing is untested.** The XP thresholds come from a rate model. The level-up log is there to check them against real play.
- **It has only been run in a browser and bundled for iOS here.** It has not been run on a device.
