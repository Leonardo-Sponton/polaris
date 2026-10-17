package io.github.leonardo_sponton.hypomnemata;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.util.Base64;
import android.view.inputmethod.InputMethodManager;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.NoSuchFileException;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.nio.file.attribute.BasicFileAttributes;
import java.util.Comparator;
import java.util.stream.Stream;

/**
 * File access for the web app (src/platform/android.ts), rooted at the data folder.
 * Every path from the web side is relative to that folder and may never leave it.
 * Writes are atomic: the text goes to a temp file, which is then renamed over the target.
 */
@CapacitorPlugin(name = "HypoFiles")
public class HypoFilesPlugin extends Plugin {

    /** Action of the "Capture" home-screen shortcut (res/xml/shortcuts.xml). */
    static final String ACTION_CAPTURE = "io.github.leonardo_sponton.hypomnemata.CAPTURE";

    // ---- "Capture" shortcut (SPEC 5.2) ----

    /**
     * Capacitor hands every intent to the plugins, also the one that started the app. The event
     * is kept until the web side listens, so a cold start through the shortcut is not missed.
     */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        if (intent == null || !ACTION_CAPTURE.equals(intent.getAction())) return;
        intent.setAction(Intent.ACTION_MAIN); // handled once, not again after a reload
        notifyListeners("capture", new JSObject(), true);
    }

    /**
     * Opens the keyboard for the focused field: WebView focus() alone does not, without a tap.
     * Coming back from the home screen the window gets its focus a moment after the intent, and
     * the keyboard is refused until then, so it retries for up to about a second.
     */
    @PluginMethod
    public void showKeyboard(PluginCall call) {
        android.view.View v = getBridge().getWebView();
        InputMethodManager imm = (InputMethodManager) getContext().getSystemService(Context.INPUT_METHOD_SERVICE);
        Runnable[] tryShow = new Runnable[1];
        int[] left = { 10 };
        tryShow[0] = () -> {
            if (v.hasWindowFocus()) {
                v.requestFocus();
                imm.showSoftInput(v, InputMethodManager.SHOW_IMPLICIT);
            } else if (--left[0] > 0) {
                v.postDelayed(tryShow[0], 100);
            }
        };
        v.post(tryShow[0]);
        call.resolve();
    }

    // ---- "All files access" (SPEC 2.3) ----

    @PluginMethod
    public void hasAccess(PluginCall call) {
        boolean granted;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            granted = Environment.isExternalStorageManager();
        } else {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    == PackageManager.PERMISSION_GRANTED;
        }
        JSObject r = new JSObject();
        r.put("granted", granted);
        call.resolve(r);
    }

    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
        } else {
            ActivityCompat.requestPermissions(getActivity(), new String[] {
                    Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE }, 1);
        }
        call.resolve();
    }

    /** The app's own Android settings page (notifications refused before can be allowed there). */
    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:" + getContext().getPackageName()));
        getActivity().startActivity(i);
        call.resolve();
    }

    @PluginMethod
    public void storageRoot(PluginCall call) {
        JSObject r = new JSObject();
        r.put("path", Environment.getExternalStorageDirectory().getAbsolutePath());
        call.resolve(r);
    }

    // ---- Files ----

    /** Resolves a relative path inside the root, refusing anything that would leave it. */
    private Path resolve(PluginCall call, String key) throws IOException {
        String root = call.getString("root");
        String rel = call.getString(key, "");
        if (root == null || root.isEmpty()) throw new IOException("No data folder");
        if (rel.startsWith("/")) throw new IOException("Invalid path: " + rel);
        for (String part : rel.split("/")) {
            if (part.equals("..") || part.equals(".")) throw new IOException("Invalid path: " + rel);
        }
        Path base = Paths.get(root).normalize();
        Path p = base.resolve(rel).normalize();
        if (!p.startsWith(base)) throw new IOException("Invalid path: " + rel);
        return p;
    }

    private static JSObject info(Path p, BasicFileAttributes a) {
        JSObject o = new JSObject();
        o.put("name", p.getFileName().toString());
        o.put("isDir", a.isDirectory());
        o.put("size", a.size());
        o.put("mtime", a.lastModifiedTime().toMillis());
        return o;
    }

    private interface Action {
        void run() throws Exception;
    }

    /** Runs file work and turns any exception into a rejected promise on the web side. */
    private void guard(PluginCall call, Action a) {
        try {
            a.run();
        } catch (NoSuchFileException e) {
            call.reject("Not found: " + e.getFile(), "ENOENT");
        } catch (Exception e) {
            call.reject(e.toString());
        }
    }

    @PluginMethod
    public void list(PluginCall call) {
        guard(call, () -> {
            Path dir = resolve(call, "path");
            JSArray entries = new JSArray();
            if (Files.isDirectory(dir)) {
                try (DirectoryStream<Path> s = Files.newDirectoryStream(dir)) {
                    for (Path p : s) {
                        if (p.getFileName().toString().contains(".tmp-")) continue;
                        try {
                            entries.put(info(p, Files.readAttributes(p, BasicFileAttributes.class)));
                        } catch (NoSuchFileException ignored) {
                            // removed while listing
                        }
                    }
                }
            }
            JSObject r = new JSObject();
            r.put("entries", entries);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void stat(PluginCall call) {
        guard(call, () -> {
            Path p = resolve(call, "path");
            JSObject r = new JSObject();
            if (Files.exists(p)) r.put("info", info(p, Files.readAttributes(p, BasicFileAttributes.class)));
            else r.put("info", JSObject.NULL);
            call.resolve(r);
        });
    }

    @PluginMethod
    public void read(PluginCall call) {
        guard(call, () -> {
            byte[] bytes = Files.readAllBytes(resolve(call, "path"));
            JSObject r = new JSObject();
            r.put("text", new String(bytes, StandardCharsets.UTF_8));
            call.resolve(r);
        });
    }

    @PluginMethod
    public void readBase64(PluginCall call) {
        guard(call, () -> {
            byte[] bytes = Files.readAllBytes(resolve(call, "path"));
            JSObject r = new JSObject();
            r.put("data", Base64.encodeToString(bytes, Base64.NO_WRAP));
            call.resolve(r);
        });
    }

    private static void atomicWrite(Path target, byte[] data) throws IOException {
        Files.createDirectories(target.getParent());
        Path tmp = target.resolveSibling(target.getFileName() + ".tmp-" + System.nanoTime());
        try (FileOutputStream out = new FileOutputStream(tmp.toFile())) {
            out.write(data);
            out.getFD().sync();
        }
        try {
            Files.move(tmp, target, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        guard(call, () -> {
            atomicWrite(resolve(call, "path"), call.getString("text", "").getBytes(StandardCharsets.UTF_8));
            call.resolve();
        });
    }

    @PluginMethod
    public void writeBase64(PluginCall call) {
        guard(call, () -> {
            atomicWrite(resolve(call, "path"), Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        });
    }

    @PluginMethod
    public void move(PluginCall call) {
        guard(call, () -> {
            Path from = resolve(call, "from");
            Path to = resolve(call, "to");
            Files.createDirectories(to.getParent());
            Files.move(from, to); // never replaces an existing file
            call.resolve();
        });
    }

    @PluginMethod
    public void remove(PluginCall call) {
        guard(call, () -> {
            Path p = resolve(call, "path");
            if (Files.exists(p)) {
                try (Stream<Path> walk = Files.walk(p)) {
                    for (Path x : (Iterable<Path>) walk.sorted(Comparator.reverseOrder())::iterator) {
                        Files.delete(x);
                    }
                }
            }
            call.resolve();
        });
    }
}
