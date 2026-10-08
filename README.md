# Daily Tracker

A personal, offline, Arabic-first (RTL) daily Islamic habit tracker that replaces a printed 30-day
wall board. Built with Expo SDK 57, React Native, TypeScript, Expo Router and expo-sqlite.

The design (data model, scoring rules, folder layout) is in [`docs/PROPOSAL.md`](docs/PROPOSAL.md).

## Run it on your phone

```bash
npm install          # also applies patches/ (see below)
npx expo start
```

Scan the QR code with **Expo Go** (SDK 57). The first launch in Expo Go reloads once to switch the
layout to right-to-left; native builds are RTL from the start (`forcesRTL` in `app.json`).

## Scripts

| Command | What it does |
|---------|--------------|
| `npm run check` | typecheck + lint + unit tests |
| `npm test` | Jest unit tests (`src/domain`, `src/db` against an in-memory SQLite) |
| `npm run web:preview` | static web build served with the headers expo-sqlite needs, for layout checks |

## Notes

- **`patches/expo-sqlite+57.0.4.patch`** fixes an upstream bug in expo-sqlite's *web* worker: the
  length of a synchronous result was written into a byte array, keeping only its low byte, so any
  result over 255 bytes (e.g. a few Arabic task names) was truncated. iOS and Android are not
  affected. Still present in 58.0.10; drop the patch once fixed upstream.
- `app/index.tsx` is a temporary data-layer check screen; it is replaced by the Today tab.

## On-device check (current step: data layer)

1. Launch: the temporary "اختبار طبقة البيانات" screen shows today's Gregorian and Hijri date and
   the 8 default tasks, with names on the **right** and the status mark on the **left**.
2. Tap a task: ○ → ½ → ● → ○. "اليوم" updates immediately.
3. Close the app completely and reopen it: the values are still there.
4. Switch the phone to dark mode: the screen follows.
