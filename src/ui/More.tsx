import { useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { analyticsEnabled, eventLog } from '../analytics';
import {
  APPRENTICE_SALE_EVERY_MS,
  CART,
  CHANNELS,
  Channel,
  GOODS,
  GOOD_IDS,
  HOUR,
  MINUTE,
  REGULARS,
  REGULAR_IDS,
  REGULAR_STORY_BEATS,
} from '../game/config';
import { keptBack, nextApprentice, salePrice } from '../game/engine';
import { STORY } from '../game/story';
import { useGame } from '../store';
import { Btn, C, fmt, s, useNow } from './bits';
import { Cards, Toasts } from './Overlays';

const TABS = ['Shop', 'Regulars', 'Stats'] as const;
type Tab = (typeof TABS)[number];

export function More({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('Shop');
  return (
    <Modal visible={open} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={st.head}>
          <View style={[s.row, { gap: 6 }]}>
            {TABS.map((t) => (
              <Pressable key={t} testID={`tab-${t}`} onPress={() => setTab(t)} style={[st.tab, tab === t && st.tabOn]}>
                <Text style={[st.tabText, tab === t && { color: C.accentInk }]}>{t}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable testID="more-close" onPress={onClose} hitSlop={12}>
            <Text style={[s.body, { fontWeight: '700' }]}>Close</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 10 }}>
          {tab === 'Shop' ? <Shop /> : null}
          {tab === 'Regulars' ? <Regulars /> : null}
          {tab === 'Stats' ? <Stats /> : null}
        </ScrollView>
        <Toasts />
        <Cards />
      </SafeAreaView>
    </Modal>
  );
}

function Shop() {
  const game = useGame((g) => g.game);
  const buyCart = useGame((g) => g.buyCart);
  const buyApprentice = useGame((g) => g.buyApprentice);
  const setMaySell = useGame((g) => g.setMaySell);
  const next = nextApprentice(game);
  const held = keptBack(game);
  const goods = GOOD_IDS.filter((g) => game.level >= GOODS[g].level);
  return (
    <>
      <Text style={s.dim}>Stalls and queue slots are bought on the street. You have {game.coins} coins.</Text>

      <View style={s.card}>
        <Text style={s.h}>Bigger supplier cart</Text>
        <Text style={s.dim}>Three batches of each supply wait for you instead of two.</Text>
        {game.hasCart ? (
          <Text style={[s.body, { marginTop: 8 }]}>Yours.</Text>
        ) : game.level < CART.level ? (
          <Text style={[s.dim, { marginTop: 8 }]}>Opens at level {CART.level}</Text>
        ) : (
          <Btn testID="buy-cart" label={`Buy · ${CART.price} coins`} disabled={game.coins < CART.price} onPress={buyCart} style={{ marginTop: 8 }} />
        )}
      </View>

      <View style={s.card}>
        <Text style={s.h}>Apprentices · {game.apprentices.count} of 2</Text>
        <Text style={s.dim}>
          Each sells one item every {fmt(APPRENTICE_SALE_EVERY_MS)} at {Math.round(CHANNELS.apprentice.coinMult * 100)}% of
          list, for eight hours after you leave. No XP, no stories.
        </Text>
        {next ? (
          game.level < next.level ? (
            <Text style={[s.dim, { marginTop: 8 }]}>
              {game.apprentices.count === 0 ? 'First' : 'Second'} apprentice opens at level {next.level}
            </Text>
          ) : (
            <Btn
              testID="buy-apprentice"
              label={`Hire · ${next.price} coins`}
              disabled={game.coins < next.price}
              haptic="success"
              onPress={buyApprentice}
              style={{ marginTop: 8 }}
            />
          )
        ) : null}

        {game.apprentices.count > 0 ? (
          <View style={{ marginTop: 10 }}>
            <Text style={[s.body, { fontWeight: '700' }]}>Apprentices may sell</Text>
            {goods.map((g) => (
              <View key={g} style={st.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.body}>{GOODS[g].name}</Text>
                  <Text style={s.dim}>
                    {salePrice(g, 1, 'apprentice').coins} coins each · have {game.stock[g]}
                    {held[g] ? ` · ${held[g]} kept back` : ''}
                  </Text>
                </View>
                <Switch testID={`maysell-${g}`} value={game.apprentices.maySell[g]} onValueChange={(on) => setMaySell(g, on)} />
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </>
  );
}

function Regulars() {
  const game = useGame((g) => g.game);
  const now = useNow();
  return (
    <>
      {REGULAR_IDS.map((id) => {
        const def = REGULARS[id];
        const r = game.regulars[id];
        if (r.nextVisitAt === null) {
          return (
            <View key={id} style={[s.card, { opacity: 0.5 }]}>
              <Text style={s.h}>?</Text>
              <Text style={s.dim}>Someone new arrives at level {def.level}</Text>
            </View>
          );
        }
        const waiting = game.spots.some((sp) => sp.customer?.kind === 'regular' && sp.customer.regular === id);
        return (
          <View key={id} style={s.card}>
            <View style={[s.row, { justifyContent: 'space-between' }]}>
              <Text style={s.h}>{def.name}</Text>
              <Text style={s.dim}>
                story {r.beat}/{REGULAR_STORY_BEATS}
              </Text>
            </View>
            <Text style={s.dim}>
              {def.who}. Buys {def.buys.map((g) => GOODS[g].name.toLowerCase()).join(', ')}.
            </Text>
            <Text style={[s.dim, { color: C.regular }]}>
              {waiting ? 'Waiting now' : r.nextVisitAt <= now ? 'On the way' : `Back in ${fmt(r.nextVisitAt - now)}`}
            </Text>
            {STORY[id].slice(0, r.beat).map((line, i) => (
              <Text key={i} style={[s.body, { marginTop: 6 }]}>
                {line}
              </Text>
            ))}
            {r.beat >= REGULAR_STORY_BEATS ? (
              <Text style={[s.dim, { marginTop: 6 }]}>Payoff (not built in the grey-box): {def.payoff}</Text>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

function Stats() {
  const game = useGame((g) => g.game);
  const skipTime = useGame((g) => g.skipTime);
  const reset = useGame((g) => g.reset);
  const [sure, setSure] = useState(false);
  const st8 = game.stats;
  const playerChannels: Channel[] = ['walkup', 'regular', 'order', 'wedding'];
  const total = playerChannels.reduce((n, ch) => n + st8.sales[ch].count, 0);
  const share = (ch: Channel) => (total ? Math.round((st8.sales[ch].count / total) * 100) : 0);
  const exportData = () =>
    Share.share({ message: JSON.stringify({ stats: st8, level: game.level, xp: game.xp, coins: game.coins, events: eventLog() }) }).catch(
      () => {},
    );
  return (
    <>
      <View style={s.card} testID="stats">
        <Text style={s.h}>The three questions</Text>
        <Text style={[s.body, { marginTop: 6, fontWeight: '700' }]}>2. A real choice about who to serve</Text>
        <Text style={s.body}>
          Sessions with a contested sale: {st8.sessionsWithContested} of {st8.sessions}
        </Text>
        <Text style={s.body}>
          Contested sales: {st8.contestedSales} of {total}, {st8.contestedShortSales ?? 0} with too little stock for everyone
        </Text>
        {playerChannels.map((ch) => (
          <Text key={ch} style={[s.body, share(ch) > 70 && { color: C.warn, fontWeight: '700' }]}>
            {CHANNELS[ch].name}: {st8.sales[ch].count} sales, {share(ch)}%, {st8.sales[ch].coins} coins
          </Text>
        ))}
        <Text style={s.dim}>
          Apprentices: {st8.sales.apprentice.count} sales, {st8.sales.apprentice.coins} coins (not counted in the shares)
        </Text>
        <Text style={s.dim}>Target: no channel above about 70%.</Text>

        <Text style={[s.body, { marginTop: 10, fontWeight: '700' }]}>3. Coming back</Text>
        <Text style={s.body}>
          Sessions: {st8.sessions} · days opened: {st8.daysOpened.length} · active play: {fmt(st8.activeMs)}
        </Text>
        <Text style={s.dim}>{st8.daysOpened.join(', ')}</Text>

        <Text style={[s.body, { marginTop: 10, fontWeight: '700' }]}>Pacing</Text>
        {st8.levelUps.length === 0 ? <Text style={s.dim}>No level-ups yet.</Text> : null}
        {st8.levelUps.map((l) => (
          <Text key={l.level} style={s.body}>
            Level {l.level} after {fmt(l.activeSeconds * 1000)} of play
          </Text>
        ))}
      </View>

      <Btn testID="export" quiet label="Share my stats and event log" onPress={exportData} />
      <Text style={s.dim}>
        {analyticsEnabled ? 'Events are also sent to PostHog.' : 'PostHog is off (no key set). Events stay on this device.'}
      </Text>

      {__DEV__ ? (
        <View style={s.card}>
          <Text style={s.h}>Development</Text>
          <Text style={s.dim}>Skipping time moves the clock forward, as if the app had been closed.</Text>
          <View style={[s.row, { gap: 6, marginTop: 8, flexWrap: 'wrap' }]}>
            <Btn testID="skip-1m" quiet label="+1 min" onPress={() => skipTime(MINUTE)} />
            <Btn testID="skip-10m" quiet label="+10 min" onPress={() => skipTime(10 * MINUTE)} />
            <Btn testID="skip-1h" quiet label="+1 hour" onPress={() => skipTime(HOUR)} />
            <Btn testID="skip-8h" quiet label="+8 hours" onPress={() => skipTime(8 * HOUR)} />
          </View>
        </View>
      ) : null}

      <Btn
        testID="reset"
        quiet
        label={sure ? 'Tap again to wipe this save' : 'Start over'}
        onPress={() => {
          if (sure) reset();
          setSure(!sure);
        }}
      />
    </>
  );
}

const st = StyleSheet.create({
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  tab: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: C.line },
  tabOn: { backgroundColor: C.ink, borderColor: C.ink },
  tabText: { fontSize: 13, fontWeight: '700', color: C.ink },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
});
