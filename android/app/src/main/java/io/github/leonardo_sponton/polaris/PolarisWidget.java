package io.github.leonardo_sponton.polaris;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The home-screen widgets (one subclass each, listed in AndroidManifest.xml). They draw the
 * snapshot the app wrote (Widgets.load); list rows are made by WidgetListService.
 */
public abstract class PolarisWidget extends AppWidgetProvider {

    abstract String kind();

    @Override
    public void onReceive(Context c, Intent intent) {
        if (Widgets.ACTION_REFRESH.equals(intent.getAction())) Widgets.updateAll(c);
        else super.onReceive(c, intent);
    }

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        JSONObject snap = Widgets.load(c);
        Widgets.Palette p = new Widgets.Palette(snap);
        for (int id : ids) {
            m.updateAppWidget(id, draw(c, snap, p, id));
            if (isList()) m.notifyAppWidgetViewDataChanged(id, R.id.list);
        }
        Widgets.scheduleMidnight(c);
    }

    boolean isList() {
        return true;
    }

    RemoteViews draw(Context c, JSONObject snap, Widgets.Palette p, int id) {
        return list(c, snap, p, id);
    }

    // ---- List widgets: header + rows ----

    /** Header icon, title (and what tapping it opens), the + button's target (null: none). */
    int icon() { return R.drawable.ic_w_sun; }
    String title(Context c, JSONObject snap) { return ""; }
    String headerTarget() { return "area:today"; }
    String addTarget() { return null; }
    String count(JSONObject snap) { return ""; }
    String sub(Context c, JSONObject snap) { return ""; }
    String subTarget() { return null; }
    String empty(Context c, JSONObject snap) { return ""; }

    RemoteViews list(Context c, JSONObject snap, Widgets.Palette p, int id) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_list);
        Widgets.background(v, R.id.bg, p.bg);
        v.setImageViewResource(R.id.icon, icon());
        Widgets.tint(v, R.id.icon, p.accent);
        v.setTextViewText(R.id.title, title(c, snap));
        v.setTextColor(R.id.title, p.strong);
        v.setTextViewText(R.id.count, count(snap));
        v.setTextColor(R.id.count, p.muted);
        v.setOnClickPendingIntent(R.id.header, Widgets.open(c, headerTarget()));
        String add = addTarget();
        v.setViewVisibility(R.id.add, add == null ? View.GONE : View.VISIBLE);
        if (add != null) {
            Widgets.tint(v, R.id.add, p.accent);
            v.setOnClickPendingIntent(R.id.add, Widgets.open(c, add));
        }
        String sub = sub(c, snap);
        v.setViewVisibility(R.id.sub, sub.isEmpty() ? View.GONE : View.VISIBLE);
        v.setTextViewText(R.id.sub, sub);
        v.setTextColor(R.id.sub, p.accent);
        if (subTarget() != null) v.setOnClickPendingIntent(R.id.sub, Widgets.open(c, subTarget()));

        Intent svc = new Intent(c, WidgetListService.class)
                .putExtra(WidgetListService.EXTRA_KIND, kind())
                .putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id);
        svc.setData(Uri.parse("polaris-widget://list/" + kind() + "/" + id));
        v.setRemoteAdapter(R.id.list, svc);
        v.setEmptyView(R.id.list, R.id.empty);
        v.setTextViewText(R.id.empty, snap.has("version") ? empty(c, snap) : c.getString(R.string.widget_setup));
        v.setTextColor(R.id.empty, p.muted);
        v.setPendingIntentTemplate(R.id.list, Widgets.rowTemplate(c, kind(), id));
        return v;
    }

    static int length(JSONObject snap, String key) {
        JSONArray a = snap.optJSONArray(key);
        return a == null ? 0 : a.length();
    }

    // ---- The widgets ----

    /** Today's to-dos (late ones first, This Evening apart); the checkbox completes them. */
    public static class Today extends PolarisWidget {
        String kind() { return "today"; }
        String title(Context c, JSONObject s) { return Widgets.label(c, s, "today", R.string.widget_today); }
        String headerTarget() { return "area:todo"; }
        String addTarget() { return "capture"; }
        String count(JSONObject s) {
            int n = WidgetListService.todayTasks(s, Widgets.today(), false).size();
            return n > 0 ? String.valueOf(n) : "";
        }
        String empty(Context c, JSONObject s) { return Widgets.label(c, s, "nothingToday", R.string.widget_today); }
    }

    public static class Notes extends PolarisWidget {
        String kind() { return "notes"; }
        int icon() { return R.drawable.ic_w_file_text; }
        String title(Context c, JSONObject s) { return Widgets.label(c, s, "notes", R.string.widget_notes); }
        String headerTarget() { return "area:notes"; }
        String addTarget() { return "new:note"; }
        String empty(Context c, JSONObject s) { return Widgets.label(c, s, "noNotes", R.string.widget_notes); }
    }

    public static class Ideas extends PolarisWidget {
        String kind() { return "ideas"; }
        int icon() { return R.drawable.ic_w_lightbulb; }
        String title(Context c, JSONObject s) { return Widgets.label(c, s, "ideas", R.string.widget_ideas); }
        String headerTarget() { return "area:ideas"; }
        String addTarget() { return "new:idea"; }
        String count(JSONObject s) {
            int n = length(s, "ideas");
            return n > 0 ? String.valueOf(n) : "";
        }
        String empty(Context c, JSONObject s) { return Widgets.label(c, s, "noIdeas", R.string.widget_ideas); }
    }

    public static class Projects extends PolarisWidget {
        String kind() { return "projects"; }
        int icon() { return R.drawable.ic_w_folder_kanban; }
        String title(Context c, JSONObject s) { return Widgets.label(c, s, "projects", R.string.widget_projects); }
        String headerTarget() { return "area:projects"; }
        String empty(Context c, JSONObject s) { return Widgets.label(c, s, "noProjects", R.string.widget_projects); }
    }

    /** Books in Reading, and how many quotes wait for today's review. */
    public static class Reading extends PolarisWidget {
        String kind() { return "reading"; }
        int icon() { return R.drawable.ic_w_book_open; }
        String title(Context c, JSONObject s) { return Widgets.label(c, s, "reading", R.string.widget_reading); }
        String headerTarget() { return "area:books"; }
        String sub(Context c, JSONObject s) {
            // Written for the day the app wrote it; tomorrow there are new quotes to review anyway.
            String written = s.optString("written", "");
            return written.startsWith(Widgets.today()) ? s.optString("quotesLabel", "") : "";
        }
        String subTarget() { return "area:books"; }
        String empty(Context c, JSONObject s) { return Widgets.label(c, s, "noReading", R.string.widget_reading); }
    }

    /** The capture bar. */
    public static class Capture extends PolarisWidget {
        String kind() { return "capture"; }
        boolean isList() { return false; }

        RemoteViews draw(Context c, JSONObject s, Widgets.Palette p, int id) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_capture);
            Widgets.background(v, R.id.bg, p.bg);
            Widgets.tint(v, R.id.icon, p.accent);
            v.setTextViewText(R.id.text, Widgets.label(c, s, "capture", R.string.widget_capture_hint));
            v.setTextColor(R.id.text, p.muted);
            v.setOnClickPendingIntent(R.id.bar, Widgets.open(c, "capture"));
            JSONObject inbox = s.optJSONObject("inbox");
            int n = inbox == null ? 0 : inbox.optInt("count");
            v.setTextViewText(R.id.inbox_count, n > 0 ? String.valueOf(n) : "");
            v.setTextColor(R.id.inbox_count, p.accent);
            Widgets.tint(v, R.id.inbox_icon, n > 0 ? p.accent : p.muted);
            v.setOnClickPendingIntent(R.id.inbox, Widgets.open(c, "area:inbox"));
            Widgets.tint(v, R.id.new_note, p.text);
            v.setOnClickPendingIntent(R.id.new_note, Widgets.open(c, "new:note"));
            Widgets.tint(v, R.id.new_idea, p.text);
            v.setOnClickPendingIntent(R.id.new_idea, Widgets.open(c, "new:idea"));
            return v;
        }
    }

    /** The thought of the day; the app sends a week of them, so it changes at midnight by itself. */
    public static class Thought extends PolarisWidget {
        String kind() { return "thought"; }
        boolean isList() { return false; }

        RemoteViews draw(Context c, JSONObject s, Widgets.Palette p, int id) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_thought);
            Widgets.background(v, R.id.bg, p.bg);
            Widgets.tint(v, R.id.icon, p.accent);
            v.setTextViewText(R.id.head, Widgets.label(c, s, "thought", R.string.widget_thought));
            v.setTextColor(R.id.head, p.muted);
            JSONObject days = s.optJSONObject("thoughts");
            JSONObject th = days == null ? null : days.optJSONObject(Widgets.today());
            if (th == null) {
                v.setTextViewText(R.id.text, c.getString(R.string.widget_setup));
                v.setTextViewText(R.id.cite, "");
                v.setOnClickPendingIntent(R.id.body, Widgets.open(c, "area:thoughts"));
            } else {
                v.setTextViewText(R.id.text, th.optString("text"));
                String cite = th.optString("cite");
                v.setTextViewText(R.id.cite, cite.isEmpty() ? "" : "— " + cite);
                v.setOnClickPendingIntent(R.id.body, Widgets.open(c, "thought:" + th.optString("id")));
            }
            v.setTextColor(R.id.text, p.strong);
            v.setTextColor(R.id.cite, p.muted);
            return v;
        }
    }

    /** Today's journal (mood and first line), the evening review and Close the day. */
    public static class Day extends PolarisWidget {
        String kind() { return "day"; }
        boolean isList() { return false; }

        RemoteViews draw(Context c, JSONObject s, Widgets.Palette p, int id) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_day);
            String today = Widgets.today();
            Widgets.background(v, R.id.bg, p.bg);
            Widgets.tint(v, R.id.icon, p.accent);
            JSONObject j = s.optJSONObject("journal");
            boolean fresh = j != null && today.equals(j.optString("day"));
            String journal = Widgets.label(c, s, "journal", R.string.widget_journal);
            String mood = fresh ? j.optString("mood", "") : "";
            v.setTextViewText(R.id.head, mood.isEmpty() ? journal : journal + " · " + mood);
            v.setTextColor(R.id.head, mood.isEmpty() ? p.muted : p.named(j.optString("moodColor")));
            String preview = fresh ? j.optString("preview", "") : "";
            if (preview.isEmpty())
                preview = fresh && j.optBoolean("written") ? Widgets.label(c, s, "noMood", R.string.widget_journal)
                        : Widgets.label(c, s, "journalEmpty", R.string.widget_journal);
            v.setTextViewText(R.id.preview, preview);
            v.setTextColor(R.id.preview, fresh && !j.optString("preview", "").isEmpty() ? p.strong : p.muted);
            v.setOnClickPendingIntent(R.id.journal, Widgets.open(c, "journal:" + today));

            JSONObject r = s.optJSONObject("review");
            String review = r != null && today.equals(r.optString("day")) ? r.optString("label")
                    : Widgets.label(c, s, "eveningReview", R.string.widget_review);
            v.setTextViewText(R.id.btn_review_text, review);
            v.setTextColor(R.id.btn_review_text, p.text);
            Widgets.tint(v, R.id.btn_review_bg, p.line);
            Widgets.tint(v, R.id.btn_review_icon, p.text);
            v.setOnClickPendingIntent(R.id.btn_review, Widgets.open(c, "review:" + today));

            v.setTextViewText(R.id.btn_close_text, Widgets.label(c, s, "closeDay", R.string.widget_close_day));
            v.setTextColor(R.id.btn_close_text, p.onAccent);
            Widgets.tint(v, R.id.btn_close_bg, p.accent);
            Widgets.tint(v, R.id.btn_close_icon, p.onAccent);
            v.setOnClickPendingIntent(R.id.btn_close, Widgets.open(c, "close-day"));
            return v;
        }
    }
}
