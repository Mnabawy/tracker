// Temporary data-layer check screen. Replaced by the Today tab in the next step.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { monthOf, trackingDay } from '@/domain/dates';
import { isScheduled, makeScheduleContext, ruleAt } from '@/domain/schedule';
import { dayScore, nextBinaryValue, rate, statusOf, valueOf } from '@/domain/scoring';
import { monthStats } from '@/domain/stats';
import { useDb, useLive, useSettings } from '@/db/react';
import { loadEntries, setEntry } from '@/db/repo/entries';
import { listTasks } from '@/db/repo/tasks';
import { formatAmount, formatGregorian, formatHijri, formatPercent } from '@/i18n/format';

const MARK = { none: '○', partial: '½', done: '●' } as const;

export default function DataCheckScreen() {
  const db = useDb();
  const settings = useSettings();
  const dark = useColorScheme() === 'dark';
  const today = trackingDay(new Date(), settings.dayStartsAt);
  const month = monthOf(today);
  const n = settings.numerals;

  const ctx = useMemo(() => makeScheduleContext(settings.hijriOffset), [settings.hijriOffset]);
  const tasks = useLive((d) => listTasks(d).filter((t) => !t.archivedAt), []);
  const entries = useLive((d) => loadEntries(d, { from: `${month}-01`, to: today }), [month, today]);

  const todays = tasks.filter((t) => isScheduled(t, today, ctx));
  const score = dayScore(tasks, entries, today, ctx);
  const stats = monthStats(tasks, month, entries, ctx, today);
  const monthRate = rate(stats.total);

  const fg = dark ? '#ECEAE6' : '#1F1E1C';
  const muted = dark ? '#9A968F' : '#6E6A63';
  const card = dark ? '#1E1D1B' : '#FFFFFF';

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: dark ? '#141412' : '#F6F5F2' }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: fg }]}>اختبار طبقة البيانات</Text>
        <Text style={[styles.sub, { color: muted }]}>{formatGregorian(today, n)}</Text>
        <Text style={[styles.sub, { color: muted }]}>{formatHijri(today, settings.hijriOffset, n)}</Text>

        <View style={[styles.card, { backgroundColor: card }]}>
          <Text style={[styles.row, { color: fg }]}>
            اليوم: {formatAmount(score.earned, n)} / {formatAmount(score.possible, n)}
          </Text>
          <Text style={[styles.row, { color: fg }]}>
            الشهر: {monthRate === null ? '—' : formatPercent(monthRate, n)}
          </Text>
        </View>

        {todays.map((task) => {
          const value = valueOf(entries, task.id, today);
          const status = statusOf(ruleAt(task, today), value);
          return (
            <Pressable
              key={task.id}
              accessibilityRole="button"
              onPress={() => setEntry(db, task.id, today, nextBinaryValue(value))}
              style={[styles.card, styles.task, { backgroundColor: card }]}
            >
              <Text style={[styles.taskName, { color: fg }]}>{task.name}</Text>
              <Text style={[styles.mark, { color: fg }]}>{MARK[status]}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 16, gap: 8 },
  title: { fontSize: 22, fontWeight: '600' },
  sub: { fontSize: 14 },
  card: { borderRadius: 12, padding: 16 },
  row: { fontSize: 16 },
  task: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56 },
  taskName: { fontSize: 17 },
  mark: { fontSize: 20, width: 28, textAlign: 'center' },
});
