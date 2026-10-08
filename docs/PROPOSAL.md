# Daily Tracker — Data model & folder structure (proposal)

Status: **approved** with the proposed defaults (Gregorian month board, Arabic-Indic digits,
½ breaks a streak, day starts at 03:00).

Build progress: data layer ✅ · Today ⏳ · Add/Edit task · Month board · Progress · Settings ·
reminders · PDF export

Target stack: Expo SDK 57 (React Native 0.86, React 19.2), TypeScript, Expo Router,
expo-sqlite. Arabic-first, forced RTL, light + dark.

---

## 1. Key decisions

| # | Decision | Why |
|---|----------|-----|
| 1 | **expo-sqlite**, not MMKV | Stats need range queries across months ("entries for task X between two dates"). SQLite does this directly. MMKV would mean loading everything into JS. Migrations use `PRAGMA user_version`. |
| 2 | **Schedule and target are versioned by date** (`task_rules.effective_from`) | Editing a task must not rewrite history. If "القرآن" goes from 5 to 10 pages today, last month still counts against 5. If a task changes from every day to Mon/Thu, last month's cells don't turn grey. When editing, you choose "from today" (the default) or "also apply to the past". |
| 3 | **Entries are sparse**: one row per (task, day), stored only when something was logged | No row means not done. Each row holds a single `value` that the rule for that date interprets. |
| 4 | **Day keys are local `YYYY-MM-DD` strings**, never UTC timestamps | Avoids timezone and DST bugs, and keeps SQL range queries simple. |
| 5 | **Configurable day boundary**, default 03:00 | A Witr logged at 1 AM belongs to the previous night. Until 03:00, "Today" still shows yesterday. Set it to 00:00 to turn this off. |
| 6 | **Week = Saturday → Friday** | Friday ends the week, which fits the Friday weekly review. Used by "X times per week" tasks and by weekly reviews. |
| 7 | **Hijri = Umm al-Qura** (`@tabby_ai/hijri-converter`, pure TS) **plus a manual ±2 day offset** setting | Hermes `Intl` support for Islamic calendars isn't reliable on both platforms. Local moon sighting often differs from Umm al-Qura by a day, and the offset matters for scheduling أيام البيض. |
| 8 | **All business logic is pure TypeScript** in `src/domain/` (no React Native imports) and unit-tested with Jest | Scheduling, scoring, streaks and stats are where the subtle bugs are. They can all be tested without a device. |
| 9 | **Logical start/end styles only** (`marginStart`, `paddingEnd`, `start`/`end`), never `left`/`right` | RTL then works without per-platform special cases. |

---

## 2. Data model

### 2.1 SQLite schema (migration v1)

```sql
CREATE TABLE categories (
  id          TEXT PRIMARY KEY,          -- uuid
  name        TEXT NOT NULL UNIQUE,      -- e.g. عبادة، علم، ذكر
  sort_order  INTEGER NOT NULL
);

CREATE TABLE tasks (
  id            TEXT PRIMARY KEY,        -- uuid
  name          TEXT NOT NULL,
  category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
  criteria      TEXT,                    -- "what counts as done" / note
  sort_order    INTEGER NOT NULL,        -- drag-to-reorder
  start_date    TEXT NOT NULL,           -- 'YYYY-MM-DD'
  end_date      TEXT,                    -- inclusive; NULL = open-ended
  archived_at   TEXT,                    -- 'YYYY-MM-DD'; not scheduled from this date on
  reminder_time TEXT,                    -- 'HH:MM' per-task reminder, NULL = none
  template_key  TEXT,                    -- set when added from a template
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

-- Effective-dated rules: the rule in force on day D is the row with the
-- greatest effective_from <= D. The first row's effective_from = start_date.
CREATE TABLE task_rules (
  task_id        TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  effective_from TEXT NOT NULL,          -- 'YYYY-MM-DD'
  tracking_type  TEXT NOT NULL CHECK (tracking_type IN ('binary','count','duration')),
  target         REAL,                   -- count or minutes; NULL for binary
  unit           TEXT,                   -- optional label for count tasks: 'صفحة', 'مرة'
  schedule_type  TEXT NOT NULL CHECK (schedule_type IN ('daily','weekdays','hijri_days','weekly_quota')),
  schedule_days  TEXT,                   -- JSON: weekdays [1,4] (0=Sun…6=Sat) or Hijri days [13,14,15]
  weekly_quota   INTEGER,                -- for 'weekly_quota' only, 1..7
  PRIMARY KEY (task_id, effective_from)
);

CREATE TABLE entries (
  task_id    TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  date       TEXT NOT NULL,              -- 'YYYY-MM-DD' (tracking day)
  value      REAL NOT NULL CHECK (value > 0), -- binary: 0.5 | 1 ; count: n ; duration: minutes
  updated_at TEXT NOT NULL,
  PRIMARY KEY (task_id, date)
);
CREATE INDEX entries_by_date ON entries(date);

CREATE TABLE weekly_reviews (
  week_start TEXT PRIMARY KEY,           -- Saturday 'YYYY-MM-DD'
  note       TEXT NOT NULL,              -- answer to "ما العبادة التي تقع منك؟ ولماذا؟"
  updated_at TEXT NOT NULL
);

CREATE TABLE monthly_notes (
  month      TEXT PRIMARY KEY,           -- 'YYYY-MM'
  note       TEXT NOT NULL,              -- ملاحظة / دعاء
  updated_at TEXT NOT NULL
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                    -- JSON
);
```

Settings keys and their defaults:

| key | default |
|-----|---------|
| `theme` | `"system"` (`light` / `dark` / `system`) |
| `dailyReminder` | `{ "enabled": true, "time": "21:00" }` |
| `weeklyReminder` | `{ "enabled": true, "time": "17:00" }` (Fridays) |
| `dayStartsAt` | `"03:00"` |
| `hijriOffset` | `0` (−2…+2) |
| `numerals` | `"arabic"` (١٢٣) or `"latin"` (123) |
| `seededAt` | timestamp of first-launch seeding |

### 2.2 Domain types (TypeScript)

```ts
type DateKey = string;                       // 'YYYY-MM-DD'
type TrackingType = 'binary' | 'count' | 'duration';

type Schedule =
  | { type: 'daily' }
  | { type: 'weekdays'; days: Weekday[] }    // 0=Sun … 6=Sat
  | { type: 'hijri_days'; days: number[] }   // 1..30
  | { type: 'weekly_quota'; perWeek: number };

interface TaskRule {
  effectiveFrom: DateKey;
  tracking: TrackingType;
  target: number | null;
  unit: string | null;
  schedule: Schedule;
}

interface Task {
  id: string; name: string; categoryId: string | null; criteria: string | null;
  sortOrder: number; startDate: DateKey; endDate: DateKey | null;
  archivedAt: DateKey | null; reminderTime: string | null;
  rules: TaskRule[];                         // sorted by effectiveFrom
}

type Status = 'none' | 'partial' | 'done';
```

### 2.3 Scoring and stats rules

These are the rules everything else depends on, so they're worth checking.

**Is task T scheduled on day D?**
`startDate ≤ D`, and `D ≤ endDate` if there is one, and `D < archivedAt` if archived, and the rule in force on D matches:
- `daily` matches every day.
- `weekdays` matches if D's weekday is in the list.
- `hijri_days` matches if D's Hijri day (after the offset) is in the list. A month with 29 days has no "30".
- `weekly_quota` makes every day *available*, but the target is per week (see below).

**Turning one cell into a ratio (0…1):**
- binary: `value` is 0, 0.5 or 1. Tapping cycles none → ½ → done → none.
- count / duration: `min(value / target, 1)`. The status is `done` when `value ≥ target` and `partial` when `0 < value < target`.

**Day score** (Today screen, "best day"): the sum of ratios for daily-type tasks scheduled that day, divided by the number of such tasks. It's shown as e.g. `6½ / 8` and as a %. Weekly-quota tasks are not in the daily denominator. On Today they show "٢/٣ هذا الأسبوع" instead.

**Task total for a month:**
- Daily-type tasks: numerator = Σ ratio over scheduled days in the month; denominator = number of scheduled days. For example, Mon/Thu fasting in a month = 8 or 9.
- Weekly-quota tasks: each Sat→Fri week belongs to the month its **Friday** falls in, so a month has 4 or 5 weeks. Numerator = Σ over those weeks of `min(Σ ratios that week, X)`; denominator = `weeks × X`.

**Monthly total** = Σ task numerators ÷ Σ task denominators, over tasks scheduled at least once that month. Archived and future tasks drop out automatically.

**Streaks:**
- Daily-type tasks: count consecutive *scheduled* occurrences that are `done`. Unscheduled days are skipped, so Mon→Thu counts as consecutive for fasting. Today doesn't break the current streak until the day is over.
- Weekly-quota tasks: the streak is counted in weeks, as consecutive weeks where the quota was met.
- Best streak: the longest run over the task's whole history.

**Weakest task this month**: the lowest completion %, among tasks with at least 3 scheduled slots so far this month. This avoids flagging a task that has only had one chance.

**3-month comparison**: per-task % and the monthly total for M-2, M-1 and M, side by side.

### 2.4 Seed (first launch)

The 8 default tasks are inserted in order. Each is `binary` and `daily`, and starts on the 1st of the
current month, so days already ticked on the paper board can be filled in (until they are, those
days count as missed in this month's %; move the start date in the task editor to change that):
الصلاة، الضحى، النوافل ١٢ ركعة، الشفع والوتر، القرآن، الأذكار، العلم الشرعي، علم الخلافة.
They're ordinary rows after seeding, so they're fully editable, archivable and deletable.

### 2.5 Backup format (export / import JSON)

```json
{
  "app": "daily-tracker",
  "schemaVersion": 1,
  "exportedAt": "2026-10-08T21:00:00+03:00",
  "data": {
    "categories": [], "tasks": [], "task_rules": [], "entries": [],
    "weekly_reviews": [], "monthly_notes": [], "settings": {}
  }
}
```

Import first validates the file. After a confirmation, it **replaces** all data, but it automatically writes a backup of the current data to the app's documents folder first, so an import can be undone.

---

## 3. Folder structure

```
app/                                  # Expo Router (file-based routes)
  _layout.tsx                         # fonts, RTL, theme, DB provider, seeding, splash
  (tabs)/
    _layout.tsx                       # tab bar: اليوم · الشهر · التقدم · الإعدادات
    index.tsx                         # Today
    month.tsx                         # Month board
    progress.tsx                      # Progress
    settings.tsx                      # Settings home
  task/
    new.tsx                           # "مهمة جديدة" (form sheet)
    [id].tsx                          # Edit task (form sheet)
  tasks.tsx                           # Manage tasks: drag reorder, archive, delete
  templates.tsx                       # One-tap templates
  review/[week].tsx                   # Weekly review (Friday)
  entry/[taskId]/[date].tsx           # Small sheet to edit one cell (board / count tasks)

src/
  domain/                             # pure TS, no React Native — unit-tested
    types.ts
    dates.ts                          # DateKey helpers, day boundary, Sat–Fri weeks
    hijri.ts                          # Umm al-Qura + offset
    schedule.ts                       # ruleAt(task, d), isScheduled(task, d)
    scoring.ts                        # cell ratio/status, day score, cycle()
    stats.ts                          # month totals, streaks, best day, weakest, 3-month
    rules.ts                          # rule versioning: normalize, apply edit "from today" / "all"
    validation.ts                     # task draft validation (form + backup import)
    templates.ts                      # the 8 seed tasks + one-tap templates
  db/
    client.ts                         # open DB, PRAGMA foreign_keys/journal_mode
    migrations.ts                     # versioned SQL via user_version
    seed.ts
    database.ts                       # driver interface, transactions, change notifications
    rows.ts                           # row types and row ↔ domain mapping
    repo/                             # typed queries: tasks, entries, categories, notes, settings
    backup.ts                         # export/import JSON, validation
    react.tsx                         # DbProvider, useLive (re-runs a query when the DB changes)
  features/                           # screen-specific components and hooks
    today/                            # TaskRow, Stepper, DayHeader, DaySwitcher
    task-form/                        # TaskForm, TrackingPicker, SchedulePicker, …
    board/                            # MonthGrid (fixed name column, scrolling days)
    progress/                         # BarChart (plain Views), StreakList, CompareTable
    settings/
  notifications/
    planner.ts                        # computes what to schedule (pure, tested)
    scheduler.ts                      # applies the plan via expo-notifications
  pdf/
    boardHtml.ts                      # month → printable HTML (A3 landscape, RTL)
    exportBoard.ts                    # expo-print → expo-sharing
  ui/                                 # design system: Text, Screen, Card, Button,
                                      # Sheet, IconButton, Star8 (SVG ornament), …
  theme/                              # tokens: colors (light/dark), 8-pt spacing, type scale
  i18n/
    ar.ts                             # every UI string lives here
    format.ts                         # numerals, Gregorian + Hijri date formatting
__tests__/  (or colocated *.test.ts)  # jest-expo
```

### Libraries

| Purpose | Library |
|---------|---------|
| Storage | `expo-sqlite` |
| Font | `@expo-google-fonts/ibm-plex-sans-arabic` (one family, weights 400/500/600) |
| Haptics | `expo-haptics` |
| Reminders | `expo-notifications` |
| PDF and sharing | `expo-print`, `expo-sharing` |
| Backup | `expo-document-picker`, `expo-file-system` |
| Native RTL | `expo-localization` (config plugin with `supportsRTL` / `forcesRTL`) |
| Drag-to-reorder | `react-native-reorderable-list` (needs reanimated and gesture-handler) |
| Star ornament | `react-native-svg` |
| Hijri conversion | `@tabby_ai/hijri-converter` |
| Date maths | `date-fns` |
| Charts | none: simple bars are plain Views, which keeps RTL straightforward |
| State | no state library: SQLite is the single source of truth, read through small live-query hooks |

---

## 4. Reminders

- **Daily reminder**: a repeating daily trigger at the chosen time (default 21:00). It keeps firing even if the app isn't opened.
- **Friday weekly review**: a repeating weekly trigger. Tapping it opens the review screen directly.
- **Per-task reminders**: schedules can be Hijri-based or have end dates, which repeating triggers can't express. So the planner computes the next 14 days of exact occurrences as one-off notifications. It rebuilds them every time the app opens and after every task edit, staying under iOS's limit of 64 pending notifications. When a task is marked done, its reminder for today is cancelled.

## 5. PDF export

The PDF is an HTML table rendered by `expo-print` at A3 landscape (1191 × 842 pt), with `dir="rtl"` and the Arabic font embedded. It mirrors the board: task names on the right, days 1→31, greyed unscheduled cells, ✓ / ½ / numbers, a total per task, a total per day, the monthly total, and the month's note/dua at the bottom. A small 8-point star sits in the header. It's shared through the system share sheet, so you can print or save it.

## 6. Design direction

- Neutral warm-grey surfaces and a single muted accent (deep teal-green) for "done".
- 8-pt spacing grid, generous padding, minimum tap target of 56 pt on Today.
- No badges, confetti or streak flames. Streaks are shown as plain numbers on the Progress screen.
- The 8-point star appears only as a small ornament: the Today header, the PDF header and the app icon.

## 7. Verification

The build environment is a Linux cloud container with no hardware virtualization.

- **iOS simulator**: not possible here at all, because it needs macOS.
- **Android emulator**: not practical here, because there is no KVM.

The app is mobile-only (iOS and Android); there is no web version.

What I'll do at each step:
1. TypeScript strict type-check, lint, and Jest unit tests for `src/domain` and `src/db`.
2. `expo export --platform ios` and `--platform android`, which proves both native bundles compile.

The on-device check is yours: `npx expo start` and scan the QR code with Expo Go on your phone. I'll write down exactly what to check for each step. If you have an Expo account, I can also set up EAS preview builds.
