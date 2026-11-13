import * as Haptics from 'expo-haptics';
import { createContext, ReactNode, useContext, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { HOUR, MINUTE } from '../game/config';
import { useGame } from '../store';

// Grey-box palette: greys, with one accent for "you can do this now".
export const C = {
  bg: '#e9e9e9',
  card: '#f7f7f7',
  line: '#c4c4c4',
  ink: '#1c1c1c',
  dim: '#6b6b6b',
  faint: '#a3a3a3',
  accent: '#1f6f54',
  accentInk: '#ffffff',
  off: '#d6d6d6',
  warn: '#a2441b',
  regular: '#5b4a8a',
  order: '#2c5d8f',
  wedding: '#9a3d6a',
};

/** The current game time, refreshed about once a second by App. */
export const NowContext = createContext(0);
export const useNow = () => useContext(NowContext);

export function fmt(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (ms >= HOUR) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  if (ms >= MINUTE) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}m ${r}s` : `${m}m`;
  }
  return `${s}s`;
}

export function tap(kind: 'light' | 'medium' | 'success' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else {
    Haptics.impactAsync(
      kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    ).catch(() => {});
  }
}

export function Btn(props: {
  label: string;
  sub?: string;
  onPress: () => void;
  disabled?: boolean;
  quiet?: boolean;
  haptic?: 'light' | 'medium' | 'success';
  style?: ViewStyle;
  testID?: string;
}) {
  const { label, sub, onPress, disabled, quiet, haptic = 'light', style, testID } = props;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        tap(haptic);
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        quiet && s.btnQuiet,
        disabled && s.btnOff,
        pressed && { opacity: 0.6, transform: [{ scale: 0.97 }] },
        style,
      ]}
    >
      <Text style={[s.btnLabel, quiet && s.btnLabelQuiet, disabled && s.btnLabelOff]} numberOfLines={1}>
        {label}
      </Text>
      {sub ? (
        <Text style={[s.btnSub, quiet && s.btnLabelQuiet, disabled && s.btnLabelOff]} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A bar that fills from startAt to endAt. Reanimated runs it on the UI thread,
 * so it stays smooth between the once-a-second redraws.
 */
export function Progress({ startAt, endAt, color = C.accent }: { startAt: number; endAt: number; color?: string }) {
  const clockOffset = useGame((g) => g.clockOffset);
  const p = useSharedValue(0);
  useEffect(() => {
    const now = useGame.getState().now();
    const total = Math.max(1, endAt - startAt);
    p.value = Math.min(1, Math.max(0, (now - startAt) / total));
    p.value = withTiming(1, { duration: Math.max(0, endAt - now), easing: Easing.linear });
  }, [startAt, endAt, clockOffset, p]);
  const fill = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={s.track}>
      <Animated.View style={[s.fill, { backgroundColor: color }, fill]} />
    </View>
  );
}

export function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.tag, { borderColor: color }]}>
      <Text style={[s.tagText, { color }]}>{label}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  btn: {
    backgroundColor: C.accent,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
  },
  btnQuiet: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.line },
  btnOff: { backgroundColor: C.off, borderColor: C.off },
  btnLabel: { color: C.accentInk, fontWeight: '700', fontSize: 14 },
  btnSub: { color: C.accentInk, fontSize: 11, marginTop: 1 },
  btnLabelQuiet: { color: C.ink },
  btnLabelOff: { color: C.faint },
  track: { height: 8, borderRadius: 4, backgroundColor: C.off, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  section: { marginTop: 18 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: C.dim, textTransform: 'uppercase', letterSpacing: 0.6 },
  tag: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1, alignSelf: 'flex-start' },
  tagText: { fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4 },
  card: {
    backgroundColor: C.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
    padding: 12,
  },
  h: { fontSize: 16, fontWeight: '800', color: C.ink },
  body: { fontSize: 13, color: C.ink },
  dim: { fontSize: 12, color: C.dim },
  row: { flexDirection: 'row', alignItems: 'center' },
});
