import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Bubble } from '@/components/ui/Bubble';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { LineChart } from '@/components/ui/LineChart';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { addDays, fromDayKey, todayKey } from '@/lib/date';
import { completionsForProfile, type Completion } from '@/lib/db/completions';
import { listHabitsWithArchived, type Habit } from '@/lib/db/habits';
import { getActiveProfileId } from '@/lib/db/profiles';
import { describeSchedule, indexCompletions, monthRange, weekRange } from '@/lib/schedule';
import {
  dailyRates,
  hadOpportunities,
  needsImprovement,
  overallGrade,
  rollingAverage,
  statsFor,
} from '@/lib/stats';
import { useAccent } from '@/hooks/useAccent';
import { GUTTER, colors, spacing } from '@/lib/theme';

type PeriodKey = 'week' | 'month' | 'quarter';

const PERIODS: readonly { readonly key: PeriodKey; readonly label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'quarter', label: 'Last 90 days' },
];

export default function AnalyticsScreen() {
  const accent = useAccent();
  const today = todayKey();
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [habits, setHabits] = useState<Habit[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const load = async (): Promise<void> => {
        const profileId = await getActiveProfileId();
        const [rows, days] = await Promise.all([
          listHabitsWithArchived(profileId),
          completionsForProfile(profileId),
        ]);
        if (!active) return;
        setHabits(rows);
        setCompletions(days);
      };
      load().catch((error: unknown) => console.error('Could not load analytics:', error));
      return () => {
        active = false;
      };
    }, [])
  );

  const range = useMemo(() => {
    if (period === 'week') return weekRange(today);
    if (period === 'month') return monthRange(today);
    return { from: addDays(today, -89), to: today };
  }, [period, today]);

  const stats = useMemo(() => {
    const index = indexCompletions(completions);
    return habits
      .map((habit) => statsFor(habit, index, range, today))
      // A habit with no opportunities in the window has nothing to say about it.
      .filter(hadOpportunities);
  }, [habits, completions, range, today]);

  const grade = useMemo(() => overallGrade(stats), [stats]);

  // A seven-day trailing average: the daily series is spiky enough to be
  // unreadable, and the question the chart answers is which way things are
  // going, not what happened last Tuesday.
  const trend = useMemo(() => {
    const rates = dailyRates(habits, indexCompletions(completions), range, today);
    return {
      values: rollingAverage(rates, 7),
      labels: rates.map((rate) =>
        fromDayKey(rate.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
      ),
    };
  }, [habits, completions, range, today]);
  const improve = useMemo(() => needsImprovement(stats), [stats]);

  return (
    <Screen edgeToEdgeBottom>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {PERIODS.map((option) => {
            return (
              <Chip
                key={option.key}
                label={option.label}
                selected={period === option.key}
                onPress={() => setPeriod(option.key)}
                style={styles.grow}
              />
            );
          })}
        </View>

        <Card>
          <View style={styles.gradeRow}>
            <View style={styles.gradeLabels}>
              <Text variant="caption" tone="muted">
                GRADE
              </Text>
              <Text style={styles.gradePct}>{grade.pct}%</Text>
              <Text variant="caption" tone="muted">
                {stats.length === 0
                  ? 'Nothing scheduled'
                  : `across ${stats.length} habit${stats.length === 1 ? '' : 's'}`}
              </Text>
            </View>
            <Bubble accent size={64}>
              <Text style={styles.gradeLetter}>{grade.letter}</Text>
            </Bubble>
          </View>

          <View style={styles.chart}>
            <LineChart
              tint={accent.base}
              values={trend.values}
              labels={trend.labels}
              accessibilityLabel={`Completion trend: ${grade.pct} percent, seven-day average`}
            />
          </View>
          <Text variant="caption" tone="muted">
            Seven-day average of everything scheduled.
          </Text>
        </Card>

        {stats.length > 0 && (
          <>
            <Text variant="caption" tone="muted" style={styles.section}>
              EVERY HABIT
            </Text>
            {stats.map((entry) => (
              <Card key={entry.habit.id}>
                <View style={styles.habitRow}>
                  <View style={styles.habitLabels}>
                    <Text variant="heading">{entry.habit.name}</Text>
                    <Text variant="caption" tone="muted">
                      {describeSchedule(entry.habit)} · target {entry.habit.targetPct}%
                    </Text>
                  </View>
                  <Text
                    variant="heading"
                    tone={entry.belowTarget ? 'error' : 'default'}
                    style={styles.habitPct}
                  >
                    {entry.pct}%
                  </Text>
                </View>

                {/* Width as well as colour, so the reading does not depend on
                    telling green from amber. */}
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        width: `${entry.pct}%`,
                        backgroundColor: entry.belowTarget ? colors.warning : colors.success,
                      },
                    ]}
                  />
                </View>

                <Text variant="caption" tone="muted">
                  {entry.done} of {entry.scheduled} · streak {entry.streak} · best {entry.best}
                </Text>
              </Card>
            ))}
          </>
        )}

        {improve.length > 0 && (
          <>
            <Text variant="caption" tone="muted" style={styles.section}>
              NEEDS IMPROVEMENT
            </Text>
            <Card>
              {improve.map((entry, position) => (
                <View key={entry.habit.id} style={styles.improveRow}>
                  <Text tone="muted" style={styles.improveRank}>
                    {position + 1}
                  </Text>
                  <Text style={styles.improveName}>{entry.habit.name}</Text>
                  <Text tone="error" style={styles.improvePct}>
                    {entry.pct}%
                  </Text>
                </View>
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: GUTTER, gap: spacing.sm, paddingVertical: spacing.md },
  chips: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  grow: { flex: 1 },
  section: { marginTop: spacing.md, letterSpacing: 1 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  gradeLabels: { gap: 2 },
  gradePct: { fontSize: 40, fontWeight: '700', color: colors.fg, fontVariant: ['tabular-nums'] },
  gradeLetter: { fontSize: 30, fontWeight: '700', color: colors.onAccent },
  chart: { marginTop: spacing.md },
  habitRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  habitLabels: { flex: 1, gap: spacing.xs },
  habitPct: { fontVariant: ['tabular-nums'] },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bgAlt,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  barFill: { height: 6, borderRadius: 3 },
  improveRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 32 },
  improveRank: { width: 20, fontVariant: ['tabular-nums'] },
  improveName: { flex: 1 },
  improvePct: { fontVariant: ['tabular-nums'] },
});
