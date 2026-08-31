import { beforeEach, describe, expect, it, vi } from 'vitest';
import { todayKey } from '@/lib/date';
import { SNOOZE_ACTION } from '@/lib/notifications';

// The reminder scheduler, against an in-memory OS (tests/support/expo-notifications.ts).
//
// Everything here is about a race, and every one of them fails silently: a
// reminder that never arrives, or one that arrives about a habit already ticked.
// Nothing on screen reports either, which is why they survived two reviews.

async function fresh() {
  vi.resetModules();
  const notifications = await import('expo-notifications');
  (notifications as unknown as { inspect: { reset: () => void } }).inspect.reset();

  const [reminders, habits, completions, profiles] = await Promise.all([
    import('@/lib/reminders'),
    import('@/lib/db/habits'),
    import('@/lib/db/completions'),
    import('@/lib/db/profiles'),
  ]);
  const inspect = (notifications as unknown as { inspect: Inspect }).inspect;
  return { ...reminders, ...habits, ...completions, ...profiles, inspect };
}

interface Inspect {
  pending: () => { id: string; data: Record<string, unknown>; fireAt: number }[];
  ids: () => string[];
  reset: () => void;
  refuse: (n: number) => void;
  setPermission: (next: { granted: boolean; canAskAgain: boolean }) => void;
  /** Freezes scheduling, so a sync can be caught mid-teardown. */
  hold: () => void;
  release: () => void;
  /** Resolves once a sync has actually reached the frozen point. */
  blocked: () => Promise<void>;
}

type Api = Awaited<ReturnType<typeof fresh>>;
let api: Api;

beforeEach(async () => {
  api = await fresh();
});

/** A habit that wants reminders, due late enough today to still be ahead. */
async function reminded(name: string, overrides: Record<string, unknown> = {}) {
  const profileId = await api.getActiveProfileId();
  return api.createHabit(profileId, {
    name,
    icon: 'ellipse-outline',
    color: '#f08a45',
    scheduleKind: 'daily',
    weekdayMask: 0b1111111,
    targetCount: 1,
    dueTime: '23:59',
    remindEnabled: true,
    followUps: 3,
    targetPct: 80,
    ...overrides,
  });
}

/**
 * The alerts the OS holds for one habit on one day.
 *
 * Scoped to a day on purpose. The plan runs a week ahead, so a total is mostly
 * a statement about the horizon; what every test here cares about is whether
 * *today* is still armed.
 */
const alertsOn = (id: number, day = todayKey()): { fireAt: number }[] =>
  api.inspect.pending().filter((alert) => alert.data.habitId === id && alert.data.day === day);

/** Delivers a Snooze tap, exactly as the OS would. */
const tapSnooze = (habitId: number, day = todayKey()): Promise<void> =>
  api.handleReminderResponse({
    actionIdentifier: SNOOZE_ACTION,
    notification: { request: { content: { data: { habitId, day } } } },
  } as never);

describe('syncReminders', () => {
  it('places a chain for a habit that wants one', async () => {
    const habit = await reminded('Teeth');
    await api.syncReminders();
    expect(alertsOn(habit.id).length).toBeGreaterThan(0);
  });

  it('places nothing for a habit with reminders off', async () => {
    await reminded('Teeth', { remindEnabled: false });
    await api.syncReminders();
    expect(api.inspect.pending()).toHaveLength(0);
  });

  it('places nothing for a habit already done today', async () => {
    const habit = await reminded('Teeth');
    await api.setStatus(habit.id, todayKey(), 'done');
    await api.syncReminders();
    expect(alertsOn(habit.id)).toHaveLength(0);
  });

  it('clears everything when permission is refused', async () => {
    await reminded('Teeth');
    await api.syncReminders();
    expect(api.inspect.pending().length).toBeGreaterThan(0);

    api.inspect.setPermission({ granted: false, canAskAgain: false });
    await api.syncReminders();
    expect(api.inspect.pending()).toHaveLength(0);
  });

  // The in-flight guard handed a caller a run whose snapshot predated that
  // caller's own write, so awaiting it was a false guarantee. `cancelDayChain`
  // relies on exactly that await to redraw the plan after a tick may have met a
  // target — it got the stale run instead, and nothing was ever re-read.
  it('gives a caller who arrives mid-run a run that can see their write', async () => {
    const habit = await reminded('Teeth');
    await api.syncReminders();
    expect(alertsOn(habit.id).length).toBeGreaterThan(0);

    // A sync starts, then the habit is ticked while it is still going.
    const running = api.syncReminders();
    await api.setStatus(habit.id, todayKey(), 'done');
    await Promise.all([running, api.syncReminders()]);

    // A habit done today has nothing left to be chased about.
    expect(alertsOn(habit.id)).toHaveLength(0);
  });

  it('does not start a third run for a third caller', async () => {
    await reminded('Teeth');
    // Two callers arriving during one run share a single follow-up run rather
    // than queueing one each — otherwise every foreground event would stack.
    const [a, b, c] = [api.syncReminders(), api.syncReminders(), api.syncReminders()];
    await Promise.all([a, b, c]);
    expect(b).toBe(c);
    expect(a).not.toBe(b);
  });
});

describe('cancelDayChain', () => {
  it('silences the rest of today for a habit that was ticked', async () => {
    const habit = await reminded('Teeth');
    await api.syncReminders();
    expect(alertsOn(habit.id).length).toBeGreaterThan(0);

    await api.setStatus(habit.id, todayKey(), 'done');
    await api.cancelDayChain(habit.id, todayKey());
    expect(alertsOn(habit.id)).toHaveLength(0);
  });

  it('leaves another habit alone', async () => {
    const teeth = await reminded('Teeth');
    const gym = await reminded('Gym', { dueTime: '23:58' });
    await api.syncReminders();

    await api.setStatus(teeth.id, todayKey(), 'done');
    await api.cancelDayChain(teeth.id, todayKey());
    expect(alertsOn(teeth.id)).toHaveLength(0);
    expect(alertsOn(gym.id).length).toBeGreaterThan(0);
  });

  // The window between a sync's cancel-all and its rewrite of scheduled_notifs:
  // the table names ids the OS has already dropped. A tick landing in there
  // cancelled dead ids, deleted the rows, and then had the pre-tick plan armed
  // on top of it with fresh live ids that nothing would ever cancel.
  it('does not leave a chain armed for a habit ticked during a sync', async () => {
    const habit = await reminded('Teeth');
    await api.syncReminders();

    // Freeze a sync after its cancel-all, before it records anything. This is
    // the window: `scheduled_notifs` still names ids the OS has already
    // dropped, so cancelling them succeeds and achieves nothing.
    api.inspect.hold();
    const running = api.syncReminders();
    await api.inspect.blocked();
    await api.setStatus(habit.id, todayKey(), 'done');

    const cancelling = api.cancelDayChain(habit.id, todayKey());
    api.inspect.release();
    await Promise.all([running, cancelling]);

    expect(alertsOn(habit.id)).toHaveLength(0);
  });
});

describe('a snoozed reminder', () => {
  // Snoozing is the user explicitly asking to be reminded again. A resync then
  // cancelled everything, and planAlerts cannot put a snooze back — it has no
  // idea one was asked for, and for a habit with no follow-ups today's only
  // offset is already in the past.
  it('survives the app being opened', async () => {
    const habit = await reminded('Vitamins', { followUps: 0, dueTime: '00:01' });
    await api.syncReminders();
    // Its one alert for today is already past, so nothing is pending for today.
    expect(alertsOn(habit.id)).toHaveLength(0);

    await tapSnooze(habit.id);
    expect(alertsOn(habit.id)).toHaveLength(1);

    // Foregrounding the app fires a resync.
    await api.syncReminders();
    expect(alertsOn(habit.id)).toHaveLength(1);
  });

  it('is dropped once the habit is done', async () => {
    const habit = await reminded('Vitamins', { followUps: 0, dueTime: '00:01' });
    await api.syncReminders();
    await tapSnooze(habit.id);

    await api.setStatus(habit.id, todayKey(), 'done');
    await api.syncReminders();
    expect(alertsOn(habit.id)).toHaveLength(0);
  });
});
