import { ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  GOODS,
  GOOD_IDS,
  GoodId,
  ItemId,
  STALLS,
  STALL_IDS,
  SUPPLIES,
  SUPPLY_IDS,
  StallId,
  SupplyId,
  itemName,
} from '../game/config';
import { canCraft, deliveryStatus, nextSlot } from '../game/engine';
import { useGame } from '../store';
import { Btn, C, Progress, fmt, s, useNow } from './bits';

const CARD_W = 300;
const GAP = 12;

/** The street scrolls sideways, one stall per card. */
export function Street() {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToInterval={CARD_W + GAP}
      decelerationRate="fast"
      contentContainerStyle={st.street}
    >
      {STALL_IDS.map((id) => (
        <StallCard key={id} id={id} />
      ))}
    </ScrollView>
  );
}

/** The supplier's deliveries, always in reach above the street. */
export function Deliveries() {
  const game = useGame((g) => g.game);
  const unlocked = SUPPLY_IDS.filter((id) => game.deliveries[id]);
  const next = SUPPLY_IDS.find((id) => !game.deliveries[id]);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.street} testID="supplier">
      {unlocked.map((id) => (
        <SupplyTile key={id} id={id} />
      ))}
      {next ? (
        <View style={[s.card, st.tile, st.locked, { justifyContent: 'center' }]}>
          <Text style={s.dim}>
            {SUPPLIES[next].name} opens at level {SUPPLIES[next].level}
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function SupplyTile({ id }: { id: SupplyId }) {
  const now = useNow();
  const game = useGame((g) => g.game);
  const collect = useGame((g) => g.collect);
  const def = SUPPLIES[id];
  const d = deliveryStatus(game, id, now);
  if (!d) return null;
  const canPay = game.coins >= d.cost;
  return (
    <View style={[s.card, st.tile]}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={[s.body, { fontWeight: '800' }]}>{def.name}</Text>
        <Text style={st.dots}>
          {'●'.repeat(d.waiting)}
          <Text style={{ color: C.off }}>{'●'.repeat(d.cap - d.waiting)}</Text>
        </Text>
      </View>
      <Text style={s.dim}>
        have {game.stock[id]} · {def.units} a batch
      </Text>
      <View style={{ marginTop: 6 }}>
        {d.nextArrivalAt ? (
          <Progress startAt={d.currentStartAt} endAt={d.nextArrivalAt} color={C.dim} />
        ) : (
          <View style={[s.track, { backgroundColor: C.dim }]} />
        )}
      </View>
      <Text style={[s.dim, { marginTop: 2 }]}>{d.nextArrivalAt ? `next in ${fmt(d.nextArrivalAt - now)}` : 'supplier is waiting'}</Text>
      <Btn
        testID={`collect-${id}`}
        label={d.waiting === 0 ? 'On its way' : d.free ? 'Collect · free' : `Collect · ${d.cost}`}
        disabled={d.waiting === 0 || !canPay}
        haptic="medium"
        onPress={() => collect(id)}
        style={{ marginTop: 8 }}
      />
    </View>
  );
}

function inputsText(good: GoodId, stock: Record<ItemId, number>) {
  return Object.entries(GOODS[good].inputs)
    .map(([item, n]) => `${n} ${itemName(item as ItemId).toLowerCase()} (${stock[item as ItemId]})`)
    .join(', ');
}

function StallCard({ id }: { id: StallId }) {
  const now = useNow();
  const game = useGame((g) => g.game);
  const queue = useGame((g) => g.queue);
  const buyStall = useGame((g) => g.buyStall);
  const buySlot = useGame((g) => g.buySlot);
  const stall = game.stalls[id];
  const def = STALLS[id];

  if (!stall.owned) {
    const open = game.level >= def.level;
    return (
      <View style={[s.card, st.card, st.locked]} testID={`stall-${id}`}>
        <Text style={s.h}>{def.name}</Text>
        {open ? (
          <>
            <Text style={[s.dim, { marginVertical: 8 }]}>Ready to open.</Text>
            <Btn
              testID={`buy-stall-${id}`}
              label={`Open the ${def.name.toLowerCase()}`}
              sub={`${def.price} coins`}
              disabled={game.coins < def.price}
              haptic="success"
              onPress={() => buyStall(id)}
            />
          </>
        ) : (
          <Text style={[s.dim, { marginTop: 8 }]}>Opens at level {def.level}</Text>
        )}
      </View>
    );
  }

  const goods = GOOD_IDS.filter((g) => GOODS[g].stall === id);
  const open = goods.filter((g) => game.level >= GOODS[g].level);
  const nextGood = goods.find((g) => game.level < GOODS[g].level);
  const slot = nextSlot(game, id);
  const slots = Array.from({ length: stall.slots }, (_, i) => stall.jobs[i] ?? null);

  return (
    <View style={[s.card, st.card]} testID={`stall-${id}`}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={s.h}>{def.name}</Text>
        <Text style={s.dim}>
          queue {stall.jobs.length}/{stall.slots}
        </Text>
      </View>

      <View style={st.slots}>
        {slots.map((job, i) => {
          const running = job && job.startAt <= now;
          return (
            <View key={i} style={[st.slot, !job && st.slotEmpty]}>
              {job ? (
                <>
                  <Text style={st.slotName} numberOfLines={1}>
                    {GOODS[job.good].name}
                  </Text>
                  {running ? (
                    <>
                      <Progress startAt={job.startAt} endAt={job.endAt} />
                      <Text style={st.slotTime}>{fmt(job.endAt - now)}</Text>
                    </>
                  ) : (
                    <Text style={st.slotTime}>waiting</Text>
                  )}
                </>
              ) : (
                <Text style={st.slotTime}>empty</Text>
              )}
            </View>
          );
        })}
      </View>

      {open.map((good) => {
        const g = GOODS[good];
        const check = canCraft(game, good);
        return (
          <View key={good} style={st.recipe}>
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={s.body}>
                <Text style={{ fontWeight: '700' }}>{g.name}</Text>
                <Text style={s.dim}>
                  {' '}
                  · {fmt(g.craftMs)} · sells {g.price} · have {game.stock[good]}
                </Text>
              </Text>
              <Text style={s.dim}>{inputsText(good, game.stock)}</Text>
            </View>
            <Btn
              testID={`craft-${good}`}
              label="Make"
              disabled={!check.ok}
              onPress={() => queue(good)}
              style={{ width: 64 }}
            />
          </View>
        );
      })}

      {nextGood ? (
        <Text style={[s.dim, { marginTop: 8 }]}>
          {GOODS[nextGood].name} opens at level {GOODS[nextGood].level}
        </Text>
      ) : null}

      {slot && game.level >= slot.level ? (
        <Btn
          testID={`buy-slot-${id}`}
          quiet
          label={`Add queue slot ${slot.slot} · ${slot.price} coins`}
          disabled={game.coins < slot.price}
          onPress={() => buySlot(id)}
          style={{ marginTop: 10 }}
        />
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  street: { paddingHorizontal: 16, gap: GAP, alignItems: 'flex-start' },
  card: { width: CARD_W, minHeight: 250 },
  locked: { borderStyle: 'dashed', backgroundColor: 'transparent' },
  tile: { width: 156 },
  dots: { fontSize: 12, color: C.ink, letterSpacing: 2 },
  slots: { flexDirection: 'row', gap: 6, marginTop: 10, marginBottom: 6 },
  slot: {
    flex: 1,
    minHeight: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: '#fff',
    padding: 5,
    justifyContent: 'space-between',
  },
  slotEmpty: { borderStyle: 'dashed', backgroundColor: 'transparent', justifyContent: 'center', alignItems: 'center' },
  slotName: { fontSize: 11, fontWeight: '700', color: C.ink },
  slotTime: { fontSize: 10, color: C.dim },
  recipe: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.line,
  },
});
