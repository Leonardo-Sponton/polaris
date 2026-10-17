import { useState } from "react";
import { num, t } from "../../i18n";
import { ArrowLeft, Star } from "lucide-react";
import type { Book } from "../../data/books";
import { bookStats, readYears } from "../../data/bookstats";
import { useBack } from "../useBack";

// Reading stats (SPEC 5.6): pick a year (or all time), see books and pages read, the averages,
// a bar per month (or per year), and the split by format and by status.

const fmt = num;

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
        <button className="btn ghost icon back" onClick={onBack} aria-label={t.common.back}>
          <ArrowLeft size={20} />
        </button>
        <span className="note-status mono">{t.books.stats}</span>
      </div>
      <div className="page">
        <div className="page-inner stats">
          <div className="chips" aria-label={t.books.period}>
            {years.map(y => (
              <button key={y} className={`chip${year === y ? " active" : ""}`} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
            <button className={`chip${year === null ? " active" : ""}`} onClick={() => setYear(null)}>
              {t.books.allTime}
            </button>
          </div>

          <div className="stat-tiles">
            <Tile label={t.books.booksRead} value={fmt(s.read.books)} />
            <Tile label={t.books.pagesRead} value={fmt(s.read.pages)} note={s.noPages ? t.books.withoutPages(s.noPages) : undefined} />
            <Tile
              label={t.books.avgRating}
              value={
                s.avgRating === null ? (
                  "–"
                ) : (
                  <>
                    {fmt(s.avgRating, 1)} <Star size={16} fill="currentColor" />
                  </>
                )
              }
              note={s.rated ? t.books.rated(s.rated) : t.books.noRated}
            />
            <Tile
              label={t.books.daysToFinish}
              value={s.avgDays === null ? "–" : fmt(s.avgDays)}
              note={s.timed ? t.books.averageOf(s.timed) : t.books.needDates}
            />
          </div>

          <section>
            <div className="stat-head">
              <h2>{year === null ? t.books.perYear : t.books.perMonth}</h2>
              <div className="chips" aria-label={t.books.measure}>
                {(["books", "pages"] as const).map(m => (
                  <button key={m} className={`chip${measure === m ? " active" : ""}`} onClick={() => setMeasure(m)}>
                    {m === "books" ? t.books.mBooks : t.books.mPages}
                  </button>
                ))}
              </div>
            </div>
            {s.bars.length === 0 ? (
              <p className="muted">{t.books.noBars}</p>
            ) : (
              <div className="bars" style={{ gridTemplateColumns: `repeat(${s.bars.length}, minmax(0, 1fr))` }}>
                {s.bars.map(b => (
                  <div key={b.key} className="bar-col" title={t.books.bar(b.label, b.books, fmt(b.pages))}>
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
              <p className="muted small">{t.books.undated(s.undated)}</p>
            )}
          </section>

          <section>
            <h2>{t.books.byFormat}</h2>
            <Rows rows={s.byFormat} top={formats} />
          </section>

          <section>
            <h2>{t.books.onShelf}</h2>
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
