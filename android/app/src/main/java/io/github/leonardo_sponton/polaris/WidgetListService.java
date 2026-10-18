package io.github.leonardo_sponton.polaris;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Paint;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

/** The rows of the list widgets (PolarisWidget), read from the snapshot each time it changes. */
public class WidgetListService extends RemoteViewsService {
    static final String EXTRA_KIND = "kind";
    /** What a tapped row does (WidgetActionActivity): open a target, or tick a task. */
    static final String EXTRA_TOGGLE = "toggle";

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext(), intent.getStringExtra(EXTRA_KIND));
    }

    /**
     * The Today widget's tasks for `today`: late ones, today's, This Evening's, then the ones
     * done today. `withDone` false: only the open ones (the count in the header).
     */
    static List<JSONObject> todayTasks(JSONObject snap, String today, boolean withDone) {
        List<JSONObject> late = new ArrayList<>(), day = new ArrayList<>(), evening = new ArrayList<>(), done = new ArrayList<>();
        JSONArray a = snap.optJSONArray("tasks");
        for (int i = 0; a != null && i < a.length(); i++) {
            JSONObject k = a.optJSONObject(i);
            if (k == null) continue;
            String d = k.optString("day");
            if (k.optBoolean("done")) {
                if (d.equals(today)) done.add(k);
            } else if (d.compareTo(today) < 0) late.add(k);
            else if (d.equals(today)) (k.optBoolean("evening") ? evening : day).add(k);
        }
        List<JSONObject> out = new ArrayList<>(late);
        out.addAll(day);
        out.addAll(evening);
        if (withDone) out.addAll(done);
        return out;
    }

    private static final class Row {
        /** "section", "task" or "item". */
        final String type;
        final JSONObject data;
        final String text;
        Bitmap cover;

        Row(String type, JSONObject data, String text) {
            this.type = type;
            this.data = data;
            this.text = text;
        }
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context c;
        private final String kind;
        private final List<Row> rows = new ArrayList<>();
        private JSONObject snap = new JSONObject();
        private Widgets.Palette p;
        private String today;

        Factory(Context c, String kind) {
            this.c = c;
            this.kind = kind == null ? "" : kind;
        }

        @Override public void onCreate() {}
        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 3; }
        @Override public long getItemId(int i) { return i; }
        @Override public boolean hasStableIds() { return false; }

        @Override
        public void onDataSetChanged() {
            snap = Widgets.load(c);
            p = new Widgets.Palette(snap);
            today = Widgets.today();
            rows.clear();
            if (kind.equals("today")) {
                String section = null;
                for (JSONObject k : todayTasks(snap, today, true)) {
                    String s = k.optBoolean("done") ? "done" : k.optString("day").compareTo(today) < 0 ? "overdue"
                            : k.optBoolean("evening") ? "evening" : "today";
                    // Headings where the list changes kind; "Today" only after late ones (the title says it).
                    if (!s.equals(section) && (s.equals("overdue") || s.equals("evening") || s.equals("today") && section != null))
                        rows.add(new Row("section", null, Widgets.label(c, snap, s, R.string.widget_today)));
                    section = s;
                    rows.add(new Row("task", k, null));
                }
                return;
            }
            JSONArray a = snap.optJSONArray(kind.equals("reading") ? "reading" : kind);
            String root = snap.optString("root", "");
            for (int i = 0; a != null && i < a.length(); i++) {
                JSONObject o = a.optJSONObject(i);
                if (o == null) continue;
                Row r = new Row("item", o, null);
                if (kind.equals("reading") && !o.optString("cover").isEmpty() && !root.isEmpty())
                    r.cover = thumbnail(new File(root, o.optString("cover")));
                rows.add(r);
            }
        }

        /** A small copy of a book cover: widgets pass images through a size-limited channel. */
        private static Bitmap thumbnail(File f) {
            if (!f.isFile()) return null;
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            BitmapFactory.decodeFile(f.getPath(), o);
            int sample = 1;
            while (o.outHeight / (sample * 2) >= 160) sample *= 2;
            o = new BitmapFactory.Options();
            o.inSampleSize = sample;
            Bitmap b = BitmapFactory.decodeFile(f.getPath(), o);
            if (b == null || b.getHeight() <= 160) return b;
            return Bitmap.createScaledBitmap(b, Math.max(1, b.getWidth() * 160 / b.getHeight()), 160, true);
        }

        @Override
        public RemoteViews getViewAt(int i) {
            if (i >= rows.size()) return null;
            Row r = rows.get(i);
            switch (r.type) {
                case "section": {
                    RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_row_section);
                    v.setTextViewText(R.id.section, r.text);
                    // "Overdue" in the late color, as in To-do.
                    boolean late = i + 1 < rows.size() && !rows.get(i + 1).data.optBoolean("done")
                            && rows.get(i + 1).data.optString("day").compareTo(today) < 0;
                    v.setTextColor(R.id.section, late ? p.err : p.muted);
                    return v;
                }
                case "task":
                    return task(r.data);
                default:
                    return item(r);
            }
        }

        private RemoteViews task(JSONObject k) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_row_task);
            boolean done = k.optBoolean("done");
            int prio = k.optInt("priority", 0);
            v.setImageViewResource(R.id.ring, done ? R.drawable.widget_dot : R.drawable.widget_ring);
            Widgets.tint(v, R.id.ring, done ? p.ok : prio == 1 ? p.err : prio == 2 ? p.h2 : prio == 3 ? p.accent : p.muted);
            v.setViewVisibility(R.id.tick, done ? View.VISIBLE : View.GONE);
            Widgets.tint(v, R.id.tick, p.onAccent);
            v.setTextViewText(R.id.title, k.optString("title"));
            v.setTextColor(R.id.title, done ? p.muted : p.strong);
            v.setInt(R.id.title, "setPaintFlags", done ? Paint.STRIKE_THRU_TEXT_FLAG | Paint.ANTI_ALIAS_FLAG : Paint.ANTI_ALIAS_FLAG);

            List<String> meta = new ArrayList<>();
            if (!done && !k.optString("time").isEmpty()) meta.add(k.optString("time"));
            if (!k.optString("project").isEmpty()) meta.add(k.optString("project"));
            if (k.optBoolean("repeat")) meta.add("↻");
            v.setViewVisibility(R.id.meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.meta, String.join(" · ", meta));
            v.setTextColor(R.id.meta, p.muted);

            v.setOnClickFillInIntent(R.id.row, new Intent().putExtra(Widgets.EXTRA_TARGET, "open:todo:" + k.optString("path")));
            v.setOnClickFillInIntent(R.id.check, new Intent().putExtra(EXTRA_TOGGLE, k.optString("path")));
            return v;
        }

        private RemoteViews item(Row r) {
            JSONObject o = r.data;
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_row);
            v.setTextViewText(R.id.title, o.optString("title"));
            v.setTextColor(R.id.title, p.strong);
            String meta;
            String area;
            switch (kind) {
                case "notes":
                    meta = o.optString("preview");
                    area = "notes";
                    v.setViewVisibility(R.id.pin, o.optBoolean("pinned") ? View.VISIBLE : View.GONE);
                    Widgets.tint(v, R.id.pin, p.accent);
                    break;
                case "ideas": {
                    JSONObject l = snap.optJSONObject("labels");
                    meta = l == null ? "" : l.optString("idea." + o.optString("status"), "");
                    area = "ideas";
                    break;
                }
                case "projects":
                    meta = o.optString("step") + (o.optString("todos").isEmpty() ? "" : " · " + o.optString("todos"));
                    area = "projects";
                    break;
                default: // reading
                    meta = o.optString("author");
                    area = "books";
                    v.setViewVisibility(R.id.cover, r.cover != null ? View.VISIBLE : View.GONE);
                    if (r.cover != null) v.setImageViewBitmap(R.id.cover, r.cover);
            }
            v.setViewVisibility(R.id.meta, meta.isEmpty() ? View.GONE : View.VISIBLE);
            v.setTextViewText(R.id.meta, meta);
            v.setTextColor(R.id.meta, kind.equals("ideas") && o.optString("status").equals("maturing") ? p.cyan : p.muted);
            v.setOnClickFillInIntent(R.id.row, new Intent().putExtra(Widgets.EXTRA_TARGET, "open:" + area + ":" + o.optString("path")));
            return v;
        }
    }
}
