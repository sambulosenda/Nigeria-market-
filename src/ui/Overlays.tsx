import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, ZoomIn } from 'react-native-reanimated';
import { GOODS, GoodId, REGULARS, REGULAR_STORY_BEATS, SUPPLIES, SUPPLY_IDS } from '../game/config';
import { deliveryStatus } from '../game/engine';
import { Card, useGame, useUi } from '../store';
import { Btn, C, fmt, s, tap } from './bits';

export function Toasts() {
  const toasts = useUi((u) => u.toasts);
  return (
    <View pointerEvents="none" style={st.toasts}>
      {toasts.map((t) => (
        <Animated.View
          key={t.id}
          entering={FadeInDown.duration(160)}
          exiting={FadeOutUp.duration(220)}
          style={[st.toast, t.tone === 'good' && { backgroundColor: C.accent }, t.tone === 'bad' && { backgroundColor: C.warn }]}
        >
          <Text style={st.toastText}>{t.text}</Text>
        </Animated.View>
      ))}
    </View>
  );
}

/**
 * Level-ups, story beats and the welcome-back summary. Drawn as an overlay
 * rather than a Modal so it can also sit on top of the More sheet.
 */
export function Cards() {
  const card = useUi((u) => u.cards[0]);
  const dismiss = useUi((u) => u.dismissCard);
  useEffect(() => {
    if (card?.kind === 'levelUp') tap('success');
  }, [card]);
  if (!card) return null;
  return (
    <View style={st.scrim}>
      <Animated.View entering={ZoomIn.duration(180)} style={[s.card, st.cardBox]} testID={`card-${card.kind}`}>
        <CardBody card={card} />
        <Btn testID="card-ok" label={card.kind === 'story' ? 'Carry on' : 'OK'} onPress={dismiss} style={{ marginTop: 14 }} />
      </Animated.View>
    </View>
  );
}

function list(map: Partial<Record<GoodId, number>>) {
  return Object.entries(map)
    .map(([g, n]) => `${n} × ${GOODS[g as GoodId].name}`)
    .join(', ');
}

function CardBody({ card }: { card: Card }) {
  const game = useGame((g) => g.game);
  const now = useGame((g) => g.now)();
  if (card.kind === 'levelUp') {
    return (
      <>
        <Text style={s.dim}>Level up</Text>
        <Text style={st.big}>Level {card.level}</Text>
        <Text style={s.body}>Now open: {card.opens}.</Text>
      </>
    );
  }
  if (card.kind === 'story') {
    return (
      <>
        <Text style={[s.dim, { color: C.regular }]}>
          {REGULARS[card.regular].name} · story {card.beat} of {REGULAR_STORY_BEATS}
        </Text>
        <Text style={[s.body, { fontSize: 16, lineHeight: 23, marginTop: 8 }]}>{card.text}</Text>
        {card.beat === REGULAR_STORY_BEATS ? (
          <Text style={[s.dim, { marginTop: 8 }]}>Story complete: {REGULARS[card.regular].payoff}.</Text>
        ) : null}
      </>
    );
  }
  const made = list(card.summary.jobsDone);
  const sold = list(card.summary.apprenticeSold);
  const waiting = SUPPLY_IDS.map((id) => ({ id, d: deliveryStatus(game, id, now) }))
    .filter((x) => x.d && x.d.waiting > 0)
    .map((x) => `${SUPPLIES[x.id].name} ×${x.d!.waiting}`)
    .join(', ');
  const regulars = game.spots.flatMap((sp) => (sp.customer?.kind === 'regular' ? [REGULARS[sp.customer.regular].name] : []));
  return (
    <>
      <Text style={s.dim}>You were away {fmt(card.awayMs)}</Text>
      <Text style={st.big}>Welcome back</Text>
      <Text style={s.body}>{made ? `Finished: ${made}.` : 'Nothing finished while you were out.'}</Text>
      {sold ? (
        <Text style={[s.body, { marginTop: 4 }]}>
          Apprentices sold {sold} for {card.summary.apprenticeCoins} coins.
        </Text>
      ) : null}
      {waiting ? <Text style={[s.body, { marginTop: 4 }]}>Deliveries waiting: {waiting}.</Text> : null}
      {regulars.length ? <Text style={[s.body, { marginTop: 4, color: C.regular }]}>{regulars.join(' and ')} came by.</Text> : null}
    </>
  );
}

const st = StyleSheet.create({
  toasts: { position: 'absolute', zIndex: 10, top: 96, left: 0, right: 0, alignItems: 'center', gap: 6 },
  toast: { backgroundColor: C.ink, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
  toastText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 20, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  cardBox: { width: '100%', maxWidth: 360, padding: 18 },
  big: { fontSize: 28, fontWeight: '900', color: C.ink, marginBottom: 6 },
});
