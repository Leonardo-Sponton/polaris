import { useState, type ReactNode } from "react";
import { CheckSquare, Inbox, Menu, Search, Settings as SettingsIcon, Sun, Trash2 } from "lucide-react";
import { SettingsView } from "./SettingsView";

// The areas built so far. Ideas, Books, Journal… join in later stages (SPEC 7).
export type Area = "today" | "todo" | "inbox" | "search" | "trash" | "settings" | "more";

const AREAS: { id: Area; label: string; icon: ReactNode }[] = [
  { id: "today", label: "Today", icon: <Sun size={20} /> },
  { id: "todo", label: "To-do", icon: <CheckSquare size={20} /> },
  { id: "inbox", label: "Inbox", icon: <Inbox size={20} /> },
  { id: "search", label: "Search", icon: <Search size={20} /> },
  { id: "trash", label: "Trash", icon: <Trash2 size={20} /> },
  { id: "settings", label: "Settings", icon: <SettingsIcon size={20} /> },
];

// Phone bottom bar (SPEC 4.1); the rest lives under More.
const BOTTOM: Area[] = ["today", "todo", "more"];

function Placeholder({ title, note }: { title: string; note: string }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>{title}</h1>
        <p className="muted">{note}</p>
      </div>
    </div>
  );
}

function More({ go }: { go: (a: Area) => void }) {
  return (
    <div className="page">
      <div className="page-inner">
        <h1>More</h1>
        <div className="stack" style={{ gap: 4 }}>
          {AREAS.filter(a => !BOTTOM.includes(a.id)).map(a => (
            <button key={a.id} className="nav-item" onClick={() => go(a.id)}>
              {a.icon}
              <span className="label">{a.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Shell() {
  const [area, setArea] = useState<Area>("today");

  let page: ReactNode;
  switch (area) {
    case "settings":
      page = <SettingsView />;
      break;
    case "more":
      page = <More go={setArea} />;
      break;
    default:
      page = <Placeholder title={AREAS.find(a => a.id === area)!.label} note="Being built in stage 1." />;
  }

  const inMore = !BOTTOM.includes(area);

  return (
    <div className="app">
      <nav className="sidebar" aria-label="Areas">
        <div className="brand">HYPOMNEMATA</div>
        {AREAS.map(a => (
          <button
            key={a.id}
            className={`nav-item${area === a.id ? " active" : ""}`}
            onClick={() => setArea(a.id)}
            title={a.label}
          >
            {a.icon}
            <span className="label">{a.label}</span>
          </button>
        ))}
      </nav>
      <main className="main">{page}</main>
      <nav className="bottombar" aria-label="Areas">
        {BOTTOM.map(id => {
          const a = AREAS.find(x => x.id === id);
          const active = id === "more" ? inMore : area === id;
          return (
            <button key={id} className={`nav-item${active ? " active" : ""}`} onClick={() => setArea(id)}>
              {a ? a.icon : <Menu size={20} />}
              <span>{a ? a.label : "More"}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
