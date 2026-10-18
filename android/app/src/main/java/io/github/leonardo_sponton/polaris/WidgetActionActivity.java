package io.github.leonardo_sponton.polaris;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.LocalDateTime;

/**
 * Taps on widget list rows land here (one invisible screen that closes at once): a row opens
 * its place in the app; a task's checkbox completes it, or opens it again when it is ticked,
 * without opening the app.
 */
public class WidgetActionActivity extends Activity {
    /** The USB sync's lock (src/data/sync.ts LOCK_PATH); older than this it is a broken sync. */
    private static final String LOCK = ".polaris/sync.lock";
    private static final long LOCK_STALE_MS = 10 * 60_000;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent in = getIntent();
        String target = in.getStringExtra(Widgets.EXTRA_TARGET);
        String toggle = in.getStringExtra(WidgetListService.EXTRA_TOGGLE);
        if (target != null) {
            startActivity(new Intent(this, MainActivity.class)
                    .setAction(Widgets.ACTION_OPEN)
                    .putExtra(Widgets.EXTRA_TARGET, target)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } else if (toggle != null) {
            toggle(toggle);
        }
        finish();
        overridePendingTransition(0, 0);
    }

    private void toast(String text) {
        Toast.makeText(getApplicationContext(), text, Toast.LENGTH_SHORT).show();
    }

    private void toggle(String path) {
        JSONObject snap = Widgets.load(this);
        String root = snap.optString("root", "");
        JSONArray tasks = snap.optJSONArray("tasks");
        if (root.isEmpty() || tasks == null) return;
        int index = -1;
        for (int i = 0; i < tasks.length(); i++) {
            JSONObject k = tasks.optJSONObject(i);
            if (k != null && path.equals(k.optString("path"))) index = i;
        }
        if (index < 0) return;
        JSONObject k = tasks.optJSONObject(index);

        File lock = new File(root, LOCK);
        if (lock.exists() && System.currentTimeMillis() - lock.lastModified() < LOCK_STALE_MS) {
            toast(Widgets.label(this, snap, "syncing", R.string.widget_today));
            return;
        }

        Path base = Paths.get(root);
        LocalDateTime now = LocalDateTime.now().withSecond(0).withNano(0);
        String title = k.optString("title");
        try {
            if (k.optBoolean("done")) {
                TaskFile.reopen(base, path, k.optString("next", null), k.optString("nextText", null), now);
                k.put("done", false);
                if (k.has("openDay")) k.put("day", k.optString("openDay"));
                String next = k.optString("next", "");
                k.remove("next");
                k.remove("nextText");
                if (!next.isEmpty()) removeTask(tasks, next);
                toast(String.format(Widgets.label(this, snap, "reopened", R.string.widget_today), title));
            } else {
                TaskFile.Completed c = TaskFile.complete(base, path, now);
                k.put("done", true);
                k.put("openDay", k.optString("day"));
                k.put("day", now.toLocalDate().toString());
                if (c.nextPath != null) {
                    k.put("next", c.nextPath);
                    k.put("nextText", c.nextText);
                    JSONObject copy = new JSONObject(k.toString());
                    copy.put("path", c.nextPath);
                    copy.put("day", c.nextDay);
                    copy.put("done", false);
                    copy.remove("openDay");
                    copy.remove("next");
                    copy.remove("nextText");
                    tasks.put(copy);
                }
                toast(String.format(Widgets.label(this, snap, "done", R.string.widget_today), title));
            }
        } catch (TaskFile.Gone e) {
            tasks.remove(index);
            toast(Widgets.label(this, snap, "gone", R.string.widget_setup));
        } catch (Exception e) {
            toast(e.getMessage() != null ? e.getMessage() : e.toString());
            return;
        }
        try {
            Widgets.save(this, snap);
        } catch (Exception e) {
            // The file changed anyway; the app writes a fresh snapshot when it next runs.
        }
        Widgets.updateAll(this);
        PolarisFilesPlugin.widgetChanged();
    }

    private static void removeTask(JSONArray tasks, String path) throws JSONException {
        for (int i = tasks.length() - 1; i >= 0; i--) {
            JSONObject k = tasks.optJSONObject(i);
            if (k != null && path.equals(k.optString("path"))) tasks.remove(i);
        }
    }
}
