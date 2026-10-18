package io.github.leonardo_sponton.polaris;

import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Completes and reopens a task file from a home-screen widget, as src/data/todo.ts finishTask
 * and reopenTask do: the header lines the app does not touch stay exactly as they are, and a
 * repeating task gets a new file for its next date. TaskFileTest covers it.
 */
final class TaskFile {
    /** The file changed (already done, deleted, not a task): the widget data is out of date. */
    static final class Gone extends Exception {}

    static final class Completed {
        final String title;
        /** The next copy of a repeating task (path relative to the data folder), or null. */
        final String nextPath;
        final String nextText;
        /** The date the next copy counts on, or null. */
        final String nextDay;

        Completed(String title, String nextPath, String nextText, String nextDay) {
            this.title = title;
            this.nextPath = nextPath;
            this.nextText = nextText;
            this.nextDay = nextDay;
        }
    }

    private static final DateTimeFormatter MINUTE = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm");
    private static final DateTimeFormatter STAMP = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss");
    private static final Pattern KEY = Pattern.compile("^([A-Za-z0-9_][A-Za-z0-9_-]*):(?:[ \\t]|$)(.*)$");
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");
    private static final Pattern MINUTE_RE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$");

    // ---- A file split into header lines and body ----

    static final class Doc {
        final List<String> header = new ArrayList<>();
        String body;

        static Doc parse(String text) throws Gone {
            if (!text.startsWith("---\n") && !text.startsWith("---\r\n")) throw new Gone();
            Doc d = new Doc();
            int at = text.indexOf('\n') + 1;
            while (true) {
                int end = text.indexOf('\n', at);
                String line = end < 0 ? text.substring(at) : text.substring(at, end);
                if (line.replaceAll("[ \\t\\r]+$", "").equals("---")) {
                    d.body = end < 0 ? "" : text.substring(end + 1);
                    return d;
                }
                if (end < 0) throw new Gone();
                d.header.add(line);
                at = end + 1;
            }
        }

        String text() {
            StringBuilder s = new StringBuilder("---\n");
            for (String l : header) s.append(l).append('\n');
            return s.append("---\n").append(body).toString();
        }

        /** Index of the line of a top-level key, or -1. */
        private int find(String key) {
            for (int i = 0; i < header.size(); i++) {
                Matcher m = KEY.matcher(header.get(i));
                if (m.matches() && m.group(1).equals(key)) return i;
            }
            return -1;
        }

        /** How many lines after `i` belong to the same key (a list or an indented block). */
        private int extra(int i) {
            int n = 0;
            while (i + 1 + n < header.size()) {
                String l = header.get(i + 1 + n);
                if (l.startsWith(" ") || l.startsWith("\t") || l.startsWith("- ") || l.equals("-")) n++;
                else break;
            }
            return n;
        }

        /** A plain value (quotes taken off), or null when missing, empty or a block. */
        String get(String key) {
            int i = find(key);
            if (i < 0) return null;
            Matcher m = KEY.matcher(header.get(i));
            if (!m.matches()) return null;
            String v = m.group(2).replaceAll("\\s+#.*$", "").trim();
            if (v.length() >= 2 && (v.startsWith("\"") && v.endsWith("\"") || v.startsWith("'") && v.endsWith("'")))
                v = v.substring(1, v.length() - 1);
            return v.isEmpty() ? null : v;
        }

        /** Replaces a key in place, or adds it at the end (as the app's YAML writer does). */
        void set(String key, String value) {
            String line = key + ": " + value;
            int i = find(key);
            if (i < 0) {
                header.add(line);
                return;
            }
            for (int n = extra(i); n > 0; n--) header.remove(i + 1);
            header.set(i, line);
        }

        void remove(String key) {
            int i = find(key);
            if (i < 0) return;
            for (int n = extra(i); n >= 0; n--) header.remove(i);
        }
    }

    // ---- Small helpers, as in src/data ----

    private static LocalDate date(String s) {
        if (s == null || !DATE.matcher(s).matches()) return null;
        try {
            return LocalDate.parse(s);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static LocalDateTime minute(String s) {
        if (s == null || !MINUTE_RE.matcher(s).matches()) return null;
        try {
            return LocalDateTime.parse(s, MINUTE);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    /** The "# " heading, else the first line (data/todo toTask). */
    static String titleOf(String body) {
        Matcher m = Pattern.compile("(?m)^#[ \\t]+(.+?)[ \\t]*#*[ \\t]*$").matcher(body);
        if (m.find()) return m.group(1).trim();
        for (String l : body.split("\n")) if (!l.trim().isEmpty()) return l.trim();
        return "";
    }

    /** Lowercase ASCII words joined by "-", max 40 characters (data/dates slugify). */
    static String slugify(String text) {
        String s = Normalizer.normalize(text, Normalizer.Form.NFD)
                .replaceAll("[\\u0300-\\u036f]", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        s = s.substring(0, Math.min(40, s.length())).replaceAll("-+$", "");
        return s.isEmpty() ? "untitled" : s;
    }

    static String resetSubtasks(String body) {
        return body.replaceAll("(?m)^(\\s*[-*+] )\\[[xX]\\]", "$1[ ]");
    }

    private static String read(Path p) throws IOException {
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }

    /**
     * Written to a temporary file (named like PolarisFilesPlugin's, which the USB sync skips),
     * renamed over the target and read back, as the app saves.
     */
    static void write(Path p, String text) throws IOException {
        Path tmp = p.resolveSibling(p.getFileName() + ".tmp-" + System.nanoTime());
        try (FileOutputStream out = new FileOutputStream(tmp.toFile())) {
            out.write(text.getBytes(StandardCharsets.UTF_8));
            out.getFD().sync();
        }
        try {
            Files.move(tmp, p, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (IOException e) {
            Files.deleteIfExists(tmp);
            throw e;
        }
        if (!read(p).equals(text)) throw new IOException("The file does not read back as written: " + p);
    }

    private static Path inside(Path root, String rel) throws Gone {
        Path p = root.resolve(rel).normalize();
        if (!p.startsWith(root.normalize()) || !rel.startsWith("todo/") || !rel.endsWith(".md")) throw new Gone();
        return p;
    }

    // ---- Complete / reopen ----

    static Completed complete(Path root, String rel, LocalDateTime now) throws IOException, Gone {
        Path p = inside(root, rel);
        if (!Files.isRegularFile(p)) throw new Gone();
        Doc d = Doc.parse(read(p));
        String type = d.get("type");
        String status = d.get("status");
        if (type != null && !type.equals("todo")) throw new Gone();
        if ("done".equals(status) || "canceled".equals(status)) throw new Gone();
        String title = titleOf(d.body);
        String original = d.text();
        String stamp = now.format(MINUTE);

        d.set("status", "done");
        d.set("done_at", stamp);
        d.set("modified", stamp);
        write(p, d.text());

        Recur rule = Recur.parse(Doc.parse(original).get("repeat"));
        if (rule == null) return new Completed(title, null, null, null);
        Doc next = Doc.parse(original);
        LocalDate today = now.toLocalDate();
        String whenText = next.get("when");
        LocalDate when = "someday".equals(whenText) ? null : date(whenText);
        LocalDate due = date(next.get("due"));
        LocalDate base = when != null ? when : due != null ? due : today;
        LocalDate nextWhen = rule.nextDue(base, today);
        if (nextWhen == null) return new Completed(title, null, null, null);
        long shift = ChronoUnit.DAYS.between(base, nextWhen);

        // As finishTask: the header without created/modified/done_at/status, then status open and
        // the new date; the due date and a set reminder move by the same number of days.
        next.remove("done_at");
        next.remove("status");
        next.set("created", stamp);
        next.set("modified", stamp);
        next.set("status", "open");
        next.set("when", nextWhen.toString());
        LocalDate nextDue = null;
        if (due != null) next.set("due", (nextDue = due.plusDays(shift)).toString());
        LocalDateTime remind = minute(next.get("remind"));
        if (remind != null) next.set("remind", remind.plusDays(shift).format(MINUTE));
        next.body = resetSubtasks(next.body);
        // created/modified/type first, as a new file from the app has them.
        moveFirst(next, "modified");
        moveFirst(next, "created");
        moveFirst(next, "type");

        String name = now.format(STAMP) + "-" + slugify(title);
        Path to = root.resolve("todo").resolve(name + ".md");
        for (int i = 2; Files.exists(to); i++) to = root.resolve("todo").resolve(name + "-" + i + ".md");
        String text = next.text();
        write(to, text);
        LocalDate day = nextDue != null && nextDue.isBefore(nextWhen) ? nextDue : nextWhen;
        return new Completed(title, "todo/" + to.getFileName(), text, day.toString());
    }

    private static void moveFirst(Doc d, String key) {
        int i = d.find(key);
        if (i <= 0) return;
        List<String> lines = new ArrayList<>(d.header.subList(i, i + 1 + d.extra(i)));
        for (int n = lines.size(); n > 0; n--) d.header.remove(i);
        d.header.addAll(0, lines);
    }

    /**
     * Undo from the widget: the task is open again (data/todo reopenTask), and the copy a repeating
     * task made is removed when it is still exactly as written.
     */
    static void reopen(Path root, String rel, String nextPath, String nextText, LocalDateTime now) throws IOException, Gone {
        Path p = inside(root, rel);
        if (!Files.isRegularFile(p)) throw new Gone();
        Doc d = Doc.parse(read(p));
        if (!"done".equals(d.get("status"))) throw new Gone();
        d.remove("done_at");
        d.set("status", "open");
        d.set("modified", now.format(MINUTE));
        write(p, d.text());
        if (nextPath != null && nextText != null) {
            Path n = inside(root, nextPath);
            if (Files.isRegularFile(n) && read(n).equals(nextText)) Files.delete(n);
        }
    }
}
