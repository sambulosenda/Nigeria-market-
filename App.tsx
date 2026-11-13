import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MAX_LEVEL } from './src/game/config';
import { xpProgress } from './src/game/engine';
import { useGame } from './src/store';
import { Btn, C, NowContext, Section, s } from './src/ui/bits';
import { More } from './src/ui/More';
import { Cards, Toasts } from './src/ui/Overlays';
import { Customers, Orders, StockStrip, Wedding } from './src/ui/Selling';
import { Deliveries, Street } from './src/ui/Street';

const REDRAW_MS = 1000;
/** A redraw that arrives late (app was suspended) does not count as play time. */
const MAX_ACTIVE_STEP_MS = 2 * REDRAW_MS;

/**
 * Redraws once a second while the app is in front. The interval only asks the
 * engine to catch up from its timestamps; closing the app loses nothing.
 */
function useGameClock(): number {
  const tick = useGame((g) => g.tick);
  const getNow = useGame((g) => g.now);
  const [now, setNow] = useState(getNow);
  const last = useRef(Date.now());

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const step = (countAsPlay: boolean) => {
      const real = Date.now();
      const delta = real - last.current;
      last.current = real;
      tick(countAsPlay ? Math.min(Math.max(delta, 0), MAX_ACTIVE_STEP_MS) : 0);
      setNow(getNow());
    };
    const start = () => {
      if (timer) return;
      last.current = Date.now();
      step(false);
      timer = setInterval(() => step(true), REDRAW_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => (state === 'active' ? start() : stop()));
    return () => {
      stop();
      sub.remove();
    };
  }, [tick, getNow]);

  return now;
}

function Header({ onMore }: { onMore: () => void }) {
  const game = useGame((g) => g.game);
  const xp = xpProgress(game);
  const atCap = game.level >= MAX_LEVEL;
  return (
    <View style={st.header}>
      <View style={{ flex: 1 }}>
        <View style={[s.row, { justifyContent: 'space-between' }]}>
          <Text style={st.level} testID="level">
            Level {game.level}
          </Text>
          <Text style={s.dim} testID="xp">
            {atCap ? 'top level' : `${xp.into} / ${xp.needed} XP`}
          </Text>
        </View>
        <View style={[s.track, { marginTop: 4 }]}>
          <View style={[s.fill, { backgroundColor: C.ink, width: atCap ? '100%' : `${(xp.into / xp.needed) * 100}%` }]} />
        </View>
      </View>
      <View style={st.coins}>
        <Text style={st.coinsNum} testID="coins">
          {game.coins}
        </Text>
        <Text style={s.dim}>coins</Text>
      </View>
      <Btn testID="more" quiet label="More" onPress={onMore} />
    </View>
  );
}

export default function App() {
  const now = useGameClock();
  const [more, setMore] = useState(false);
  return (
    <SafeAreaProvider>
      <NowContext.Provider value={now}>
        <SafeAreaView style={st.root} edges={['top', 'left', 'right']}>
          <StatusBar style="dark" />
          <Header onMore={() => setMore(true)} />
          <ScrollView contentContainerStyle={{ paddingBottom: 48 }}>
            <Section title="Deliveries" right={<Text style={s.dim}>pay when you collect</Text>}>
              <Deliveries />
            </Section>
            <Section title="Your street" right={<Text style={s.dim}>swipe sideways</Text>}>
              <Street />
            </Section>
            <StockStrip />
            <Customers />
            <Wedding />
            <Orders />
          </ScrollView>
          <Toasts />
          <Cards />
          <More open={more} onClose={() => setMore(false)} />
        </SafeAreaView>
      </NowContext.Provider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
    backgroundColor: C.card,
  },
  level: { fontSize: 16, fontWeight: '900', color: C.ink },
  coins: { alignItems: 'flex-end', minWidth: 56 },
  coinsNum: { fontSize: 20, fontWeight: '900', color: C.ink },
});
