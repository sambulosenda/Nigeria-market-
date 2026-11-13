/**
 * Analytics for the prototype's three questions.
 *
 * Events go to PostHog when EXPO_PUBLIC_POSTHOG_KEY is set, and always to a
 * small on-device log that the Stats tab can share, so a five-person test
 * works with no PostHog project at all.
 */
import PostHog from 'posthog-react-native';
import { createMMKV } from 'react-native-mmkv';
import type { GameEvent } from './game/engine';

const KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY;
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com';

const posthog = KEY ? new PostHog(KEY, { host: HOST }) : null;

const LOG_KEY = 'event-log';
const LOG_MAX = 500;

export interface LoggedEvent extends GameEvent {
  at: number;
}

const storage = createMMKV({ id: 'market-street-events' });

let log: LoggedEvent[] = [];
try {
  log = JSON.parse(storage.getString(LOG_KEY) ?? '[]');
} catch {
  log = [];
}

export function track(events: GameEvent[], at: number) {
  if (events.length === 0) return;
  for (const e of events) {
    posthog?.capture(e.name, e.props);
    log.push({ ...e, at });
  }
  if (log.length > LOG_MAX) log = log.slice(log.length - LOG_MAX);
  storage.set(LOG_KEY, JSON.stringify(log));
}

export function eventLog(): LoggedEvent[] {
  return log;
}

export function clearEventLog() {
  log = [];
  storage.remove(LOG_KEY);
}

export const analyticsEnabled = posthog !== null;
