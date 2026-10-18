package io.github.leonardo_sponton.polaris;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.widget.RemoteViews;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.time.LocalDate;
import java.time.ZoneId;

/**
 * Home-screen widgets: shared parts. The app writes what they show into widgets.json in its
 * private folder (src/data/widgets.ts, through PolarisFilesPlugin.setWidgetData); the widgets
 * only read it, except the Today widget, which completes tasks (WidgetActionActivity).
 */
final class Widgets {
    /** Opens a place in the app: the intent carries a target (src/ui/Shell.tsx OpenRequest). */
    static final String ACTION_OPEN = "io.github.leonardo_sponton.polaris.OPEN";
    static final String EXTRA_TARGET = "target";
    /** Draws every widget again (after midnight, when the dates move). */
    static final String ACTION_REFRESH = "io.github.leonardo_sponton.polaris.WIDGETS_REFRESH";

    static final Class<?>[] PROVIDERS = {
        PolarisWidget.Today.class, PolarisWidget.Capture.class, PolarisWidget.Notes.class,
        PolarisWidget.Ideas.class, PolarisWidget.Projects.class, PolarisWidget.Reading.class,
        PolarisWidget.Thought.class, PolarisWidget.Day.class,
    };

    private Widgets() {}

    /** The provider of a widget kind ("today", "capture"…), or null. */
    static Class<?> provider(String kind) {
        for (Class<?> p : PROVIDERS) {
            try {
                if (((PolarisWidget) p.getDeclaredConstructor().newInstance()).kind().equals(kind)) return p;
            } catch (ReflectiveOperationException e) {
                // every provider has a public no-argument constructor
            }
        }
        return null;
    }

    // ---- The snapshot ----

    private static File file(Context c) {
        return new File(c.getFilesDir(), "widgets.json");
    }

    static synchronized JSONObject load(Context c) {
        try {
            return new JSONObject(new String(Files.readAllBytes(file(c).toPath()), StandardCharsets.UTF_8));
        } catch (IOException | JSONException e) {
            return new JSONObject();
        }
    }

    static synchronized void save(Context c, JSONObject snap) throws IOException {
        Path to = file(c).toPath();
        Path tmp = to.resolveSibling("widgets.json.tmp");
        Files.write(tmp, snap.toString().getBytes(StandardCharsets.UTF_8));
        Files.move(tmp, to, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    /** A word sent by the app in its language, or the Android string when there is no snapshot yet. */
    static String label(Context c, JSONObject snap, String key, int fallback) {
        JSONObject l = snap.optJSONObject("labels");
        String v = l == null ? "" : l.optString(key, "");
        return v.isEmpty() ? c.getString(fallback) : v;
    }

    static String today() {
        return LocalDate.now(ZoneId.systemDefault()).toString();
    }

    // ---- Colors: the app's theme (CSS variables), with the dark theme before the first snapshot ----

    static final class Palette {
        final int bg, surface, line, text, strong, muted, accent, onAccent, h1, h2, h3, ok, cyan, err;

        Palette(JSONObject snap) {
            JSONObject c = snap.optJSONObject("colors");
            if (c == null) c = new JSONObject();
            bg = color(c, "bg", 0xFF010A29);
            surface = color(c, "surface", 0xFF000623);
            line = color(c, "line", 0xFF1B2350);
            text = color(c, "text", 0xFFAFA7D4);
            strong = color(c, "strong", 0xFFD4CCF5);
            muted = color(c, "muted", 0xFF7D76A6);
            accent = color(c, "accent", 0xFFA67CFF);
            onAccent = color(c, "on-accent", 0xFF0B0420);
            h1 = color(c, "h1", 0xFFE6958C);
            h2 = color(c, "h2", 0xFFDAA069);
            h3 = color(c, "h3", 0xFFE0C07A);
            ok = color(c, "ok", 0xFF8FD3A0);
            cyan = color(c, "cyan", 0xFF7FD1D8);
            err = color(c, "err", 0xFFF0857A);
        }

        private static int color(JSONObject c, String key, int fallback) {
            try {
                return Color.parseColor(c.optString(key, "").trim());
            } catch (IllegalArgumentException e) {
                return fallback;
            }
        }

        /** A mood color name from data/journal MOODS. */
        int named(String name) {
            switch (name == null ? "" : name) {
                case "h1": return h1;
                case "h2": return h2;
                case "h3": return h3;
                case "ok": return ok;
                case "cyan": return cyan;
                case "accent": return accent;
                default: return muted;
            }
        }
    }

    /** The rounded background (an ImageView, so it can take any color on every Android version). */
    static void background(RemoteViews v, int id, int color) {
        v.setInt(id, "setColorFilter", color);
        v.setInt(id, "setImageAlpha", 245);
    }

    static void tint(RemoteViews v, int id, int color) {
        v.setInt(id, "setColorFilter", color);
    }

    // ---- Taps ----

    /** Opens the app at `target`. One PendingIntent per target (the data URI keeps them apart). */
    static PendingIntent open(Context c, String target) {
        Intent i = new Intent(c, MainActivity.class)
                .setAction(ACTION_OPEN)
                .setData(Uri.parse("polaris-widget://open/" + Uri.encode(target)))
                .putExtra(EXTRA_TARGET, target)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    /** List rows: each row fills in what it does (WidgetActionActivity). */
    static PendingIntent rowTemplate(Context c, String kind, int widgetId) {
        Intent i = new Intent(c, WidgetActionActivity.class)
                .setData(Uri.parse("polaris-widget://row/" + kind + "/" + widgetId))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    // ---- Redraw ----

    /** Draws every placed widget again with the current snapshot. */
    static void updateAll(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (Class<?> p : PROVIDERS) {
            int[] ids = m.getAppWidgetIds(new ComponentName(c, p));
            if (ids.length == 0) continue;
            Intent i = new Intent(c, p).setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
                    .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
            c.sendBroadcast(i);
        }
    }

    /** The dates move at midnight (late tasks, the thought of the day): redraw just after it. */
    static void scheduleMidnight(Context c) {
        AlarmManager am = (AlarmManager) c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        Intent i = new Intent(c, PolarisWidget.Today.class).setAction(ACTION_REFRESH);
        PendingIntent pi = PendingIntent.getBroadcast(c, 1, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        long at = LocalDate.now().plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli() + 60_000;
        am.set(AlarmManager.RTC, at, pi);
    }
}
