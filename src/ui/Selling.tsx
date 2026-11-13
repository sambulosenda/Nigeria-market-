import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHANNELS, GOODS, GOOD_IDS, GoodId, ORDERS_UNLOCK_LEVEL, REGULARS, REGULAR_STORY_BEATS, WEDDING } from '../game/config';
import {
  Customer,
  canFillOrder,
  keptBack,
  orderValue,
  salePrice,
  weddingRemaining,
  weddingValue,
} from '../game/engine';
import { useGame } from '../store';
import { Btn, C, Section, Tag, fmt, s, useNow } from './bits';

/** What you have made, and how much of it is kept back. */
export function StockStrip() {
  const game = useGame((g) => g.game);
  const held = keptBack(game);
  const goods = GOOD_IDS.filter((g) => game.level >= GOODS[g].level && game.stalls[GOODS[g].stall].owned);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.strip}>
      {goods.map((g) => (
        <View key={g} style={[st.chip, game.stock[g] === 0 && { opacity: 0.45 }]} testID={`stock-${g}`}>
          <Text style={st.chipCount}>{game.stock[g]}</Text>
          <Text style={st.chipName}>
            {GOODS[g].name}
            {held[g] ? ` · ${Math.min(held[g]!, game.stock[g])} kept` : ''}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

export function Customers() {
  const game = useGame((g) => g.game);
  const now = useNow();
  return (
    <Section title="Waiting at your stalls" right={<Text style={s.dim}>you cannot serve everyone</Text>}>
      <View style={st.grid}>
        {game.spots.map((spot, i) =>
          spot.customer ? (
            <CustomerCard key={i} index={i} customer={spot.customer} />
          ) : (
            <View key={i} style={[s.card, st.customer, st.empty]}>
              <Text style={s.dim}>next customer in {fmt(spot.refillAt - now)}</Text>
            </View>
          ),
        )}
      </View>
    </Section>
  );
}

function CustomerCard({ index, customer }: { index: number; customer: Customer }) {
  const game = useGame((g) => g.game);
  const serve = useGame((g) => g.serve);
  const sendOn = useGame((g) => g.sendOn);
  const have = game.stock[customer.good];
  const pay = salePrice(customer.good, customer.qty, customer.kind);
  const isRegular = customer.kind === 'regular';
  const beat = isRegular ? game.regulars[customer.regular].beat : 0;
  return (
    <View style={[s.card, st.customer]} testID={`customer-${index}`}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={[s.body, { fontWeight: '800' }]} numberOfLines={1}>
          {isRegular ? REGULARS[customer.regular].name : 'Walk-up'}
        </Text>
        {isRegular ? <Tag label="regular" color={C.regular} /> : null}
      </View>
      <Text style={[s.body, { marginTop: 4 }]}>
        {customer.qty} × {GOODS[customer.good].name}
      </Text>
      <Text style={s.dim}>
        {pay.coins} coins · {pay.xp} XP · have {have}
      </Text>
      {isRegular ? (
        <Text style={[s.dim, { color: C.regular }]}>
          {beat < REGULAR_STORY_BEATS ? `story ${beat + 1} of ${REGULAR_STORY_BEATS} if served` : 'story told'}
        </Text>
      ) : null}
      <View style={[s.row, { gap: 6, marginTop: 8 }]}>
        <Btn
          testID={`serve-${index}`}
          label="Serve"
          disabled={have < customer.qty}
          haptic="medium"
          onPress={() => serve(index)}
          style={{ flex: 1 }}
        />
        <Pressable testID={`sendon-${index}`} onPress={() => sendOn(index)} hitSlop={8} style={st.link}>
          <Text style={s.dim}>send on</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function Orders() {
  const game = useGame((g) => g.game);
  const now = useNow();
  const fillOrder = useGame((g) => g.fillOrder);
  const skipOrder = useGame((g) => g.skipOrder);
  const pinOrder = useGame((g) => g.pinOrder);
  if (game.level < ORDERS_UNLOCK_LEVEL) return null;
  return (
    <Section
      title="Orders board"
      right={
        <Text style={s.dim}>
          {Math.round(CHANNELS.order.coinMult * 100)}% coins · {CHANNELS.order.xpMult}× XP
        </Text>
      }
    >
      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        {game.orders.map((slot, i) => {
          const order = slot.order;
          if (!order) {
            return (
              <View key={i} style={[s.card, st.empty, { minHeight: 56 }]}>
                <Text style={s.dim}>new order in {fmt(slot.refillAt - now)}</Text>
              </View>
            );
          }
          const value = orderValue(order);
          return (
            <View key={i} style={[s.card, order.pinned && { borderColor: C.order, borderWidth: 2 }]} testID={`order-${i}`}>
              <View style={[s.row, { justifyContent: 'space-between' }]}>
                <View style={{ flex: 1 }}>
                  {order.lines.map((l) => (
                    <Text key={l.good} style={s.body}>
                      <Text style={{ fontWeight: '700' }}>
                        {l.qty} × {GOODS[l.good].name}
                      </Text>
                      <Text style={[s.dim, game.stock[l.good] < l.qty && { color: C.warn }]}>
                        {' '}
                        · have {game.stock[l.good]}
                      </Text>
                    </Text>
                  ))}
                  <Text style={[s.dim, { marginTop: 2 }]}>
                    {value.coins} coins · {value.xp} XP{order.pinned ? ' · stock kept back' : ''}
                  </Text>
                </View>
                <Btn
                  testID={`fill-${i}`}
                  label="Fill"
                  disabled={!canFillOrder(game, order)}
                  haptic="medium"
                  onPress={() => fillOrder(i)}
                  style={{ width: 70 }}
                />
              </View>
              <View style={[s.row, { gap: 16, marginTop: 6 }]}>
                <Pressable testID={`pin-${i}`} onPress={() => pinOrder(i)} hitSlop={8}>
                  <Text style={[s.dim, { color: C.order }]}>{order.pinned ? 'unpin' : 'pin'}</Text>
                </Pressable>
                <Pressable testID={`skip-${i}`} onPress={() => skipOrder(i)} hitSlop={8}>
                  <Text style={s.dim}>skip (free)</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </Section>
  );
}

export function Wedding() {
  const game = useGame((g) => g.game);
  const now = useNow();
  const accept = useGame((g) => g.acceptWedding);
  const deliver = useGame((g) => g.deliverWedding);
  const w = game.wedding;
  if (w.status === 'locked') return null;
  const value = weddingValue();
  const remaining = weddingRemaining(game);
  const canGive = (Object.keys(remaining) as GoodId[]).some((g) => game.stock[g] > 0);
  const endsAt = (w.acceptedAt ?? 0) + WEDDING.windowMs;
  return (
    <Section title="Folake's wedding" right={<Tag label="occasion" color={C.wedding} />}>
      <View style={[s.card, { marginHorizontal: 16, borderColor: C.wedding }]} testID="wedding">
        {(Object.entries(WEDDING.needs) as [GoodId, number][]).map(([good, n]) => {
          const done = w.delivered[good] ?? 0;
          return (
            <Text key={good} style={s.body}>
              <Text style={{ fontWeight: '700' }}>
                {done}/{n} {GOODS[good].name}
              </Text>
              <Text style={s.dim}> · have {game.stock[good]}</Text>
            </Text>
          );
        })}
        <Text style={[s.dim, { marginTop: 4 }]}>
          Pays {value.coins} coins and {value.xp} XP in full. Part-filled pays for what you delivered.
        </Text>
        {w.status === 'offered' ? (
          <Btn testID="wedding-accept" label="Accept the order" sub="48 hours, no penalty" onPress={accept} style={{ marginTop: 8 }} />
        ) : null}
        {w.status === 'accepted' ? (
          <>
            <Text style={[s.dim, { marginTop: 4 }]}>{fmt(endsAt - now)} left. Stock for the wedding is kept back.</Text>
            <Btn
              testID="wedding-deliver"
              label="Deliver what you have"
              disabled={!canGive}
              haptic="success"
              onPress={deliver}
              style={{ marginTop: 8 }}
            />
          </>
        ) : null}
        {w.status === 'complete' ? (
          <Text style={[s.body, { marginTop: 8, color: C.wedding, fontWeight: '700' }]}>
            Delivered in full. A wedding canopy now hangs over your street.
          </Text>
        ) : null}
        {w.status === 'closed' ? (
          <Text style={[s.dim, { marginTop: 8 }]}>The wedding has passed. You were paid for everything you delivered.</Text>
        ) : null}
      </View>
    </Section>
  );
}

const st = StyleSheet.create({
  strip: { paddingHorizontal: 16, gap: 6, paddingTop: 12 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: C.card,
  },
  chipCount: { fontWeight: '800', fontSize: 14, color: C.ink },
  chipName: { fontSize: 12, color: C.dim },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  customer: { flexBasis: '46%', flexGrow: 1, minHeight: 124 },
  empty: { borderStyle: 'dashed', backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  link: { paddingHorizontal: 4, paddingVertical: 8 },
});
