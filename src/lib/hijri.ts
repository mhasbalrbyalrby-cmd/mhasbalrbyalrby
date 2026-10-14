/**
 * Hijri (Islamic calendar) date conversion and formatting utilities.
 * Uses the Umm al-Qura approximation algorithm (based on astronomical calculations).
 * The Gregorian-to-Hijri conversion uses the Kuwaiti algorithm which is accurate to ±1 day.
 */

const HIJRI_MONTHS_AR = [
  'محرم', 'صفر', 'ربيع الأول', 'ربيع الثاني', 'جمادى الأولى', 'جمادى الآخرة',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذو القعدة', 'ذو الحجة',
];

const HIJRI_MONTHS_EN = [
  'Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Awwal', 'Jumada al-Thani',
  'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhu al-Qidah', 'Dhu al-Hijjah',
];

interface HijriDate {
  year: number;
  month: number;
  day: number;
}

/**
 * Convert a Gregorian date to Hijri using the Kuwaiti algorithm.
 * Accurate to ±1 day for most dates.
 */
export function gregorianToHijri(date: Date): HijriDate {
  const gy = date.getFullYear();
  const gm = date.getMonth() + 1;
  const gd = date.getDate();

  let jdn: number;
  if (gy > 1582 || (gy === 1582 && gm > 10) || (gy === 1582 && gm === 10 && gd > 14)) {
    jdn = Math.floor((1461 * (gy + 4800 + Math.floor((gm - 14) / 12))) / 4)
      + Math.floor((367 * (gm - 2 - 12 * Math.floor((gm - 14) / 12))) / 12)
      - Math.floor((3 * Math.floor((gy + 4900 + Math.floor((gm - 14) / 12)) / 100)) / 4)
      + gd - 32075;
  } else {
    jdn = 367 * gy - Math.floor((7 * (gy + 5001 + Math.floor((gm - 9) / 7))) / 4)
      + Math.floor((275 * gm) / 9) + gd + 1729777;
  }

  const l = jdn - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l2 = l - 10631 * n + 354;
  const j = Math.floor((10985 - l2) / 5316) * Math.floor((50 * l2) / 17719)
    + Math.floor(l2 / 5670) * Math.floor((43 * l2) / 15238);
  const l3 = l2 - Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50)
    - Math.floor(j / 16) * Math.floor((15238 * j) / 43) + 29;
  const hm = Math.floor((24 * l3) / 709);
  const hd = l3 - Math.floor((709 * hm) / 24);
  const hy = 30 * n + j - 30;

  return { year: hy, month: hm, day: hd };
}

/**
 * Convert Hijri date to Gregorian.
 */
export function hijriToGregorian(hy: number, hm: number, hd: number): Date {
  const jdn = hd + Math.floor((11 * hy + 3) / 30) + 354 * hy + 30 * hm - 385 + 1948440;

  const l = jdn + 68569;
  const n = Math.floor((4 * l) / 146097);
  const l2 = l - Math.floor((146097 * n + 3) / 4);
  const i = Math.floor((4000 * (l2 + 1)) / 1461001);
  const l3 = l2 - Math.floor((1461 * i) / 4) + 31;
  const j = Math.floor((80 * l3) / 2447);
  const gd = l3 - Math.floor((2447 * j) / 80);
  const l4 = Math.floor(j / 11);
  const gm = j + 2 - 12 * l4;
  const gy = 100 * (n - 49) + i + l4;

  return new Date(gy, gm - 1, gd);
}

/**
 * Format a date as Hijri string.
 */
export function formatHijri(date: Date | string, lang: 'ar' | 'en' = 'ar'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const hijri = gregorianToHijri(d);
  const months = lang === 'ar' ? HIJRI_MONTHS_AR : HIJRI_MONTHS_EN;
  return `${hijri.day} ${months[hijri.month - 1]} ${hijri.year}هـ`;
}

/**
 * Format a date as both Gregorian and Hijri.
 */
export function formatDualDate(date: Date | string, lang: 'ar' | 'en' = 'ar'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const gregorian = d.toLocaleDateString(lang === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB');
  const hijri = formatHijri(d, lang);
  return `${gregorian} (${hijri})`;
}

/**
 * Format Hijri as YYYY-MM-DD for storage.
 */
export function hijriToDateString(hy: number, hm: number, hd: number): string {
  const greg = hijriToGregorian(hy, hm, hd);
  return greg.toISOString().slice(0, 10);
}

export { HIJRI_MONTHS_AR, HIJRI_MONTHS_EN };
