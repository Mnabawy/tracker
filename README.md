# Daily Tracker

A personal, offline, Arabic-first (RTL) daily Islamic habit tracker for iOS and Android that
replaces a printed 30-day wall board. Built with Expo SDK 57, React Native, TypeScript, Expo Router and expo-sqlite.

The design (data model, scoring rules, folder layout) is in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Run it on your phone

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** (SDK 57). The first launch in Expo Go reloads once to switch the
layout to right-to-left; native builds are RTL from the start (`forcesRTL` in `app.json`).

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run check` | typecheck + lint + unit tests |
| `npm test` | Jest unit tests (`src/domain`, `src/db` against an in-memory SQLite) |

## Notes

- Mobile only: iOS and Android (`platforms` in `app.json`). There is no web version.
- `app/index.tsx` is a temporary data-layer check screen; it is replaced by the Today tab.

## On-device check (current step: data layer)

1. Launch: the temporary "اختبار طبقة البيانات" screen shows today's Gregorian and Hijri date and
   the 8 default tasks, with names on the **right** and the status mark on the **left**.
2. Tap a task: ○ → ½ → ● → ○. "اليوم" updates immediately.
3. Close the app completely and reopen it: the values are still there.
4. Switch the phone to dark mode: the screen follows.
