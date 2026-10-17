import { useEffect, useState } from "react";
import { t } from "../../i18n";
import { Quote as QuoteIcon } from "lucide-react";
import type { Book } from "../../data/books";
import { isoDate } from "../../data/dates";
import { loadQuotes, markReviewed, reviewQueue, setLastReviewed, type Quote } from "../../data/quotes";
import { useApp } from "../context";

/** Every quote of every book, reloaded whenever data on disk changes. */
export function useQuotes(books: Book[]): Quote[] {
  const { notes, toast } = useApp();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  useEffect(() => {
    let alive = true;
    loadQuotes(notes, books, p => toast({ text: t.common.couldNotRead(p), error: true })).then(list => alive && setQuotes(list));
    return () => {
      alive = false;
    };
    // `books` is a new list after every change on disk, so it doubles as the reload signal.
  }, [notes, books, toast]);
  return quotes;
}

/** "p. 42 · Letter 1" */
export function quotePlace(q: Quote): string {
  return [q.page && t.books.page(String(q.page)), q.chapter].filter(Boolean).join(" · ");
}

/**
 * The daily quote review (SPEC 5.6), on Today and on the Books shelf: one quote at a time out of
 * today's three. "Reviewed" marks it and shows the next; the card goes away after the third.
 */
export function QuoteReview({ quotes, onOpen }: { quotes: Quote[]; onOpen(q: Quote): void }) {
  const { notes, bump, toast } = useApp();
  const queue = reviewQueue(quotes, isoDate());
  const q = queue[0];
  if (!q) return null;
  const place = quotePlace(q);

  const reviewed = async () => {
    try {
      const old = await markReviewed(notes, q.path);
      bump();
      toast({ text: t.books.reviewed, action: { label: t.common.undo, run: () => setLastReviewed(notes, q.path, old.last_reviewed).then(bump) } });
    } catch (e) {
      toast({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  return (
    <div className="today-card quote-review" aria-label={t.books.toReview}>
      <div className="qr-head muted small">
        <QuoteIcon size={16} />
        <span>{t.books.quotesToReview}</span>
        <span className="count">{t.books.leftToday(queue.length)}</span>
      </div>
      <blockquote className="qr-text">{q.text}</blockquote>
      <div className="qr-source muted small">
        — {q.bookTitle || t.common.untitled}
        {q.bookAuthor && `, ${q.bookAuthor}`}
        {place && ` · ${place}`}
      </div>
      <div className="row qr-actions">
        <button className="btn ghost" onClick={() => onOpen(q)}>
          {t.common.open}
        </button>
        <button className="btn" onClick={reviewed}>
          {t.books.reviewed}
        </button>
      </div>
    </div>
  );
}
