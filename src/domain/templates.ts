import type { RuleContent } from './rules';

export interface TaskTemplate extends RuleContent {
  key: string;
  name: string;
  criteria: string | null;
}

const binary = { tracking: 'binary', target: null, unit: null } as const;

/** The 8 tasks seeded on first launch, in board order. */
export const DEFAULT_TASKS: readonly TaskTemplate[] = [
  'الصلاة',
  'الضحى',
  'النوافل ١٢ ركعة',
  'الشفع والوتر',
  'القرآن',
  'الأذكار',
  'العلم الشرعي',
  'علم الخلافة',
].map((name, i) => ({
  key: `default_${i + 1}`,
  name,
  criteria: null,
  ...binary,
  schedule: { type: 'daily' },
}));

/** One-tap suggestions for the "add task" sheet. */
export const TEMPLATES: readonly TaskTemplate[] = [
  {
    key: 'fast_mon_thu',
    name: 'صيام الإثنين والخميس',
    criteria: null,
    ...binary,
    schedule: { type: 'weekdays', days: [1, 4] },
  },
  {
    key: 'ayyam_al_bid',
    name: 'صيام أيام البيض',
    criteria: '١٣ و١٤ و١٥ من الشهر الهجري',
    ...binary,
    schedule: { type: 'hijri_days', days: [13, 14, 15] },
  },
  {
    key: 'qiyam',
    name: 'قيام الليل',
    criteria: null,
    ...binary,
    schedule: { type: 'daily' },
  },
  {
    key: 'sadaqa',
    name: 'صدقة',
    criteria: 'ولو بالقليل',
    ...binary,
    schedule: { type: 'weekly_quota', perWeek: 1 },
  },
  {
    key: 'silat_rahim',
    name: 'صلة رحم',
    criteria: 'زيارة أو اتصال',
    ...binary,
    schedule: { type: 'weekly_quota', perWeek: 1 },
  },
  {
    key: 'kahf_friday',
    name: 'سورة الكهف يوم الجمعة',
    criteria: null,
    ...binary,
    schedule: { type: 'weekdays', days: [5] },
  },
];
