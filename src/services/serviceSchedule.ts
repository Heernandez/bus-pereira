// Service windows of a route variant, as the backend publishes them in the catalog
// (GTFS frequencies.txt grouped by the local calendar: weekdays, Saturdays, Sundays and holidays).
export type ServiceDays = 'weekdays' | 'saturday' | 'sunday_holiday';
export type ServicePeriod = { days: ServiceDays; startTime: string; endTime: string; headwayMinutes: number };

const dayLabels: Record<ServiceDays, string> = { weekdays: 'Lunes a viernes', saturday: 'Sábados', sunday_holiday: 'Domingos y festivos' };
const dayOrder = Object.keys(dayLabels) as ServiceDays[];

// "HH:MM" local time; like GTFS, hours may exceed 23 for service after midnight.
function clock(value: string): string | null {
  const match = /^(\d{1,2}):([0-5]\d)$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]) % 24;
  return `${hours % 12 || 12}:${match[2]} ${hours < 12 ? 'a. m.' : 'p. m.'}`;
}

// One readable line per valid period, e.g. "Lunes a viernes: 5:00 a. m.–10:00 p. m. · cada 8 min".
export function describeService(periods: ServicePeriod[] | null | undefined): string[] {
  return (Array.isArray(periods) ? periods : [])
    .filter(item => item && dayLabels[item.days] && clock(item.startTime) && clock(item.endTime) &&
      Number.isFinite(item.headwayMinutes) && item.headwayMinutes > 0)
    .sort((a, b) => dayOrder.indexOf(a.days) - dayOrder.indexOf(b.days) || a.startTime.localeCompare(b.startTime, undefined, { numeric: true }))
    .map(item => `${dayLabels[item.days]}: ${clock(item.startTime)}–${clock(item.endTime)} · cada ${Math.round(item.headwayMinutes)} min`);
}
