export type MonthWeek = { week: number; start: string; end: string };

function iso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Monday-independent blocks of up to 7 dates. A month yields 4 or 5 weeks. Names are never filled. */
export function monthWeeks(year: number, month: number): MonthWeek[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weeks: MonthWeek[] = [];
  let week = 1;
  for (let day = 1; day <= days; day += 7) {
    weeks.push({
      week: week++,
      start: iso(year, month, day),
      end: iso(year, month, Math.min(day + 6, days)),
    });
  }
  return weeks;
}

export function currentMonthYear(now = new Date()): { month: number; year: number } {
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
