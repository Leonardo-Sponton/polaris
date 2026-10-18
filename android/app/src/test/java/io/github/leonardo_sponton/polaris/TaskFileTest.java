package io.github.leonardo_sponton.polaris;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Scanner;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class TaskFileTest {

    /** Cases written by tests/widgets.test.ts with the app's own recur.ts. */
    @Test
    public void repeatRulesMatchTheApp() throws Exception {
        InputStream in = getClass().getClassLoader().getResourceAsStream("recur-cases.json");
        String text = new Scanner(in, "UTF-8").useDelimiter("\\A").next();
        JSONArray cases = new JSONArray(text);
        assertTrue(cases.length() > 100);
        for (int i = 0; i < cases.length(); i++) {
            JSONObject c = cases.getJSONObject(i);
            Recur r = Recur.parse(c.getString("rule"));
            String want = c.isNull("next") ? null : c.getString("next");
            String got = r == null ? null : String.valueOf(r.nextDue(LocalDate.parse(c.getString("base")), LocalDate.parse(c.getString("today"))));
            assertEquals(c.toString(), want, got);
        }
    }

    private static String read(Path p) throws Exception {
        return new String(Files.readAllBytes(p), StandardCharsets.UTF_8);
    }

    @Test
    public void completesAPlainTask() throws Exception {
        Path root = Files.createTempDirectory("polaris");
        Files.createDirectories(root.resolve("todo"));
        Path f = root.resolve("todo/a.md");
        Files.write(f, ("---\ntype: todo\ncreated: 2026-10-01T10:00\nmodified: 2026-10-01T10:00\nstatus: open\n"
                + "when: 2026-10-18\ntime: \"17:00\"\ntags:\n  - x\n  - y\nlist: home\n---\n# Pay rent\n").getBytes(StandardCharsets.UTF_8));
        TaskFile.Completed c = TaskFile.complete(root, "todo/a.md", LocalDateTime.of(2026, 10, 18, 9, 5));
        assertEquals("Pay rent", c.title);
        assertNull(c.nextPath);
        assertEquals("---\ntype: todo\ncreated: 2026-10-01T10:00\nmodified: 2026-10-18T09:05\nstatus: done\n"
                + "when: 2026-10-18\ntime: \"17:00\"\ntags:\n  - x\n  - y\nlist: home\ndone_at: 2026-10-18T09:05\n---\n# Pay rent\n", read(f));

        // Twice: the second sees it done already.
        try {
            TaskFile.complete(root, "todo/a.md", LocalDateTime.of(2026, 10, 18, 9, 6));
            fail();
        } catch (TaskFile.Gone expected) {
        }

        TaskFile.reopen(root, "todo/a.md", null, null, LocalDateTime.of(2026, 10, 18, 9, 7));
        assertEquals("---\ntype: todo\ncreated: 2026-10-01T10:00\nmodified: 2026-10-18T09:07\nstatus: open\n"
                + "when: 2026-10-18\ntime: \"17:00\"\ntags:\n  - x\n  - y\nlist: home\n---\n# Pay rent\n", read(f));
    }

    @Test
    public void repeatingTaskGetsItsNextCopy() throws Exception {
        Path root = Files.createTempDirectory("polaris");
        Files.createDirectories(root.resolve("todo"));
        Path f = root.resolve("todo/w.md");
        // As tests/todo.test.ts "finishing a repeating task…".
        Files.write(f, ("---\ntype: todo\ncreated: 2026-10-01T10:00\nmodified: 2026-10-01T10:00\nstatus: open\n"
                + "when: 2026-10-17\ndue: 2026-10-18\nrepeat: FREQ=DAILY\nremind: 2026-10-17T08:00\n---\n"
                + "# Water plants\n\n- [x] front\n- [ ] back\n").getBytes(StandardCharsets.UTF_8));
        TaskFile.Completed c = TaskFile.complete(root, "todo/w.md", LocalDateTime.of(2026, 10, 17, 9, 30));
        assertEquals("todo/20261017-093000-water-plants.md", c.nextPath);
        assertEquals("2026-10-18", c.nextDay);
        assertEquals("---\ntype: todo\ncreated: 2026-10-17T09:30\nmodified: 2026-10-17T09:30\n"
                + "when: 2026-10-18\ndue: 2026-10-19\nrepeat: FREQ=DAILY\nremind: 2026-10-18T08:00\nstatus: open\n---\n"
                + "# Water plants\n\n- [ ] front\n- [ ] back\n", read(root.resolve(c.nextPath)));
        assertTrue(read(f).contains("status: done\n"));

        // Undo removes the copy (still as written) and opens the task again.
        TaskFile.reopen(root, "todo/w.md", c.nextPath, c.nextText, LocalDateTime.of(2026, 10, 17, 9, 31));
        assertFalse(Files.exists(root.resolve(c.nextPath)));
        assertTrue(read(f).contains("status: open\n"));
        assertFalse(read(f).contains("done_at"));
    }

    @Test
    public void refusesPathsOutsideTodo() throws Exception {
        Path root = Files.createTempDirectory("polaris");
        for (String p : new String[] { "../x.md", "todo/../ideas/a.md", "ideas/a.md", "todo/missing.md" }) {
            try {
                TaskFile.complete(root, p, LocalDateTime.of(2026, 10, 17, 9, 30));
                fail(p);
            } catch (TaskFile.Gone expected) {
            }
        }
    }

    @Test
    public void slugAsTheApp() {
        assertEquals("acao-rapida-de-hoje", TaskFile.slugify("Ação rápida de hoje!"));
        assertEquals("untitled", TaskFile.slugify("!!!"));
        assertEquals("aaaaaaaaaa-bbbbbbbbbb-cccccccccc-ddddddd", TaskFile.slugify("aaaaaaaaaa bbbbbbbbbb cccccccccc dddddddddd eeee"));
    }
}
