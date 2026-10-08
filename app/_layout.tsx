import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { trackingDay } from '@/domain/dates';
import { openAppDatabase } from '@/db/client';
import type { Database } from '@/db/database';
import { DbProvider } from '@/db/react';
import { getSettings } from '@/db/repo/settings';
import { seedIfNeeded } from '@/db/seed';
import { ensureRTL } from '@/i18n/rtl';

ensureRTL();

type Boot = { status: 'loading' } | { status: 'ready'; db: Database } | { status: 'failed'; error: Error };

async function boot(): Promise<Database> {
  const db = await openAppDatabase();
  seedIfNeeded(db, trackingDay(new Date(), getSettings(db).dayStartsAt));
  return db;
}

export default function RootLayout() {
  const [state, setState] = useState<Boot>({ status: 'loading' });

  useEffect(() => {
    boot().then(
      (db) => setState({ status: 'ready', db }),
      (e: unknown) => setState({ status: 'failed', error: e instanceof Error ? e : new Error(String(e)) }),
    );
  }, []);

  if (state.status === 'loading') return null;

  if (state.status === 'failed') {
    return (
      <View style={styles.error}>
        <Text style={styles.errorTitle}>تعذّر فتح قاعدة البيانات</Text>
        <Text selectable>{state.error.message}</Text>
      </View>
    );
  }

  return (
    <DbProvider db={state.db}>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }} />
    </DbProvider>
  );
}

const styles = StyleSheet.create({
  error: { flex: 1, justifyContent: 'center', padding: 24, gap: 8 },
  errorTitle: { fontSize: 18, fontWeight: '600' },
});
