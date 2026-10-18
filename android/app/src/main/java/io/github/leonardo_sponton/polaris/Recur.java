package io.github.leonardo_sponton.polaris;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.TreeSet;

/**
 * Repeating tasks, the same rules as src/data/recur.ts (SPEC 5.3), for tasks completed from a
 * home-screen widget while the app is closed. Keep both in step: RecurTest checks the same cases.
 */
final class Recur {
    static final List<String> DAY_CODES = Arrays.asList("SU", "MO", "TU", "WE", "TH", "FR", "SA");

    final String freq;
    final int interval;
    /** Weekly: days of the week, 0 = Sunday … 6 = Saturday; null when not given. */
    final int[] byDay;
    /** Monthly: day of the month, -1 for the last day; null when not given. */
    final Integer byMonthDay;

    private Recur(String freq, int interval, int[] byDay, Integer byMonthDay) {
        this.freq = freq;
        this.interval = interval;
        this.byDay = byDay;
        this.byMonthDay = byMonthDay;
    }

    /** Reads FREQ=…;INTERVAL=…;BYDAY=…;BYMONTHDAY=…, or null for anything the app does not follow. */
    static Recur parse(String s) {
        if (s == null || s.trim().isEmpty()) return null;
        String text = s.trim().replaceFirst("(?i)^RRULE:", "");
        String freq = null;
        int interval = 1;
        int[] byDay = null;
        Integer byMonthDay = null;
        List<String[]> parts = new ArrayList<>();
        for (String p : text.split(";", -1)) {
            String[] kv = p.split("=", -1);
            if (kv.length < 2 || kv[0].isEmpty()) return null;
            parts.add(new String[] { kv[0].toUpperCase(Locale.ROOT), kv[1].toUpperCase(Locale.ROOT) });
        }
        for (String[] kv : parts) if (kv[0].equals("FREQ")) freq = kv[1];
        if (freq == null || !Arrays.asList("DAILY", "WEEKLY", "MONTHLY", "YEARLY").contains(freq)) return null;
        for (String[] kv : parts) {
            String k = kv[0], v = kv[1];
            if (k.equals("FREQ")) continue;
            if (k.equals("INTERVAL")) {
                Integer n = integer(v);
                if (n == null || n < 1 || n > 999) return null;
                interval = n;
            } else if (k.equals("BYDAY") && freq.equals("WEEKLY")) {
                TreeSet<Integer> days = new TreeSet<>();
                for (String d : v.split(",", -1)) {
                    int i = DAY_CODES.indexOf(d);
                    if (i < 0) return null;
                    days.add(i);
                }
                byDay = days.stream().mapToInt(Integer::intValue).toArray();
            } else if (k.equals("BYMONTHDAY") && freq.equals("MONTHLY")) {
                Integer n = integer(v);
                if (n == null || !(n == -1 || (n >= 1 && n <= 31))) return null;
                byMonthDay = n;
            } else return null;
        }
        return new Recur(freq, interval, byDay, byMonthDay);
    }

    private static Integer integer(String v) {
        try {
            return Integer.parseInt(v.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** JavaScript's getDay(): 0 = Sunday. */
    private static int jsDay(LocalDate d) {
        return d.getDayOfWeek().getValue() % 7;
    }

    private static LocalDate mondayOf(LocalDate d) {
        return d.minusDays(d.getDayOfWeek().getValue() - DayOfWeek.MONDAY.getValue());
    }

    private static int dayIn(int y, int m, int want) {
        int len = LocalDate.of(y, m, 1).lengthOfMonth();
        return want == -1 ? len : Math.min(want, len);
    }

    /** Does `d` belong to the series that started on `start`? */
    boolean matches(LocalDate start, LocalDate d) {
        int n = interval;
        switch (freq) {
            case "DAILY":
                return ChronoUnit.DAYS.between(start, d) % n == 0;
            case "WEEKLY": {
                int[] days = byDay != null && byDay.length > 0 ? byDay : new int[] { jsDay(start) };
                boolean day = false;
                for (int x : days) if (x == jsDay(d)) day = true;
                return day && (ChronoUnit.DAYS.between(mondayOf(start), mondayOf(d)) / 7) % n == 0;
            }
            case "MONTHLY": {
                int months = (d.getYear() - start.getYear()) * 12 + d.getMonthValue() - start.getMonthValue();
                int want = byMonthDay != null ? byMonthDay : start.getDayOfMonth();
                return months % n == 0 && d.getDayOfMonth() == dayIn(d.getYear(), d.getMonthValue(), want);
            }
            default: // YEARLY
                return (d.getYear() - start.getYear()) % n == 0
                        && d.getMonthValue() == start.getMonthValue()
                        && d.getDayOfMonth() == dayIn(d.getYear(), d.getMonthValue(), start.getDayOfMonth());
        }
    }

    /** The first date of the series strictly after `after`. */
    LocalDate nextAfter(LocalDate start, LocalDate after) {
        LocalDate d = after.plusDays(1);
        for (int i = 0; i < 3700 * interval; i++, d = d.plusDays(1)) {
            if (ChronoUnit.DAYS.between(start, d) >= 0 && matches(start, d)) return d;
        }
        return null;
    }

    /** Next date of a repeating task just completed: from the task's date, never before tomorrow. */
    LocalDate nextDue(LocalDate taskDate, LocalDate today) {
        LocalDate after = ChronoUnit.DAYS.between(taskDate, today) > 0 ? today : taskDate;
        return nextAfter(taskDate, after);
    }
}
