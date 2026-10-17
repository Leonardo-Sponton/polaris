import { useState } from "react";
import { ArrowLeft, Star } from "lucide-react";
import type { Book } from "../../data/books";
import { bookStats, readYears } from "../../data/bookstats";
import { useBack } from "../useBack";

// Reading stats (SPEC 5.6): pick a year (or all time), see books and pages read, the averages,
// a bar per month (or per year), and the split by format and by status.

const fmt = (n: number, digits = 0) => n.toLocaleString("en", { maximumFractionDigits: digits });

export function BookStats({ books, onBack }: { books: Book[]; onBack(): void }) {
  useBack(true, onBack);
  const thisYear = new Date().getFullYear();
  const years = readYears(books);
  if (!years.includes(thisYear)) years.unshift(thisYear);
  const [year, setYear] = useState<number | null>(thisYear);
  const [measure, setMeasure] = useState<"books" | "pages">("books");
  const s = bookStats(books, year);
  const top = Math.max(1, ...s.bars.map(b => b[measure]));
  const formats = Math.max(1, ...s.byFormat.map(f => f.count));
  const statuses = Math.max(1, ...s.byStatus.map(f => f.count));

  return (
    <div className="note-editor">
      <div className="note-bar">
        <button className="btn ghost icon back" onClick={onBack} aria-label="Back">
          <ArrowLeft size={20} />
        </button>
        <span className="note-status mono">Reading stats</span>
      </div>
      <div className="page">
        <div className="page-inner stats">
          <div className="chips" aria-label="Period">
            {years.map(y => (
              <button key={y} className={`chip${year === y ? " active" : ""}`} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
            <button className={`chip${year === null ? " active" : ""}`} onClick={() => setYear(null)}>
              All time
            </button>
          </div>

          <div className="stat-tiles">
            <Tile label="Books read" value={fmt(s.read.books)} />
            <Tile label="Pages read" value={fmt(s.read.pages)} note={s.noPages ? `${s.noPages} without page count` : undefined} />
            <Tile
              label="Average rating"
              value={
                s.avgRating === null ? (
                  "–"
                ) : (
                  <>
                    {fmt(s.avgRating, 1)} <Star size={16} fill="currentColor" />
                  </>
                )
              }
              note={s.rated ? `${s.rated} rated` : "No rated book"}
            />
            <Tile
              label="Days to finish"
              value={s.avgDays === null ? "–" : fmt(s.avgDays)}
              note={s.timed ? `average of ${s.timed}` : "Needs start and finish dates"}
            />
          </div>

          <section>
            <div className="stat-head">
              <h2>{year === null ? "Per year" : "Per month"}</h2>
              <div className="chips" aria-label="Measure">
                {(["books", "pages"] as const).map(m => (
                  <button key={m} className={`chip${measure === m ? " active" : ""}`} onClick={() => setMeasure(m)}>
                    {m === "books" ? "Books" : "Pages"}
                  </button>
                ))}
              </div>
            </div>
            {s.bars.length === 0 ? (
              <p className="muted">No book marked as read with a finish date yet.</p>
            ) : (
              <div className="bars" style={{ gridTemplateColumns: `repeat(${s.bars.length}, minmax(0, 1fr))` }}>
                {s.bars.map(b => (
                  <div key={b.key} className="bar-col" title={`${b.label}: ${b.books} books, ${fmt(b.pages)} pages`}>
                    <span className="bar-num mono">{b[measure] ? fmt(b[measure]) : ""}</span>
                    <div className="bar-track">
                      <div className="bar" style={{ height: `${(b[measure] / top) * 100}%` }} />
                    </div>
                    <span className="bar-label">{year === null ? b.label : b.label.slice(0, 1)}</span>
                  </div>
                ))}
              </div>
            )}
            {s.undated > 0 && (
              <p className="muted small">
                {s.undated} read {s.undated === 1 ? "book has" : "books have"} no finish date, so {s.undated === 1 ? "it is" : "they are"} only in
                the totals.
              </p>
            )}
          </section>

          <section>
            <h2>By format</h2>
            <Rows rows={s.byFormat} top={formats} />
          </section>

          <section>
            <h2>On the shelf now</h2>
            <Rows rows={s.byStatus} top={statuses} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) {
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

function Rows({ rows, top }: { rows: { id: string; label: string; count: number }[]; top: number }) {
  return (
    <ul className="stat-rows">
      {rows.map(r => (
        <li key={r.id}>
          <span className="stat-row-label">{r.label}</span>
          <div className="hbar-track">
            <div className="hbar" style={{ width: `${(r.count / top) * 100}%` }} />
          </div>
          <span className="mono">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}
