import React, { useState, useRef, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Avatar from "./Avatar";

type Result = { username: string; avatar_url: string | null; win_rate: number | null };

/**
 * Header user search. Username-only by design - wallet addresses stay private,
 * matching public_profile which never returns them. Debounced so typing doesn't
 * hammer the endpoint; results link to the public profile.
 */
export default function UserSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounce: wait 300ms after the last keystroke before querying.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/content?type=search&q=${encodeURIComponent(term)}`);
        const data = res.ok ? await res.json() : [];
        setResults(Array.isArray(data) ? data : []);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  // Click outside closes.
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const go = useCallback((username: string) => {
    setOpen(false); setQ(""); setResults([]);
    navigate(`/u/${username}`);
  }, [navigate]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); inputRef.current?.blur(); return; }
    if (!results.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => (i + 1) % results.length); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive((i) => (i - 1 + results.length) % results.length); }
    if (e.key === "Enter" && active >= 0) { e.preventDefault(); go(results[active].username); }
  }

  const showDropdown = open && q.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-[280px]">
      <div className="flex items-center gap-2 rounded-[10px] px-3 h-9 transition-all"
           style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}>
        <Search size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search users"
          className="flex-1 bg-transparent outline-none text-sm min-w-0"
          style={{ color: "var(--text)" }}
        />
        {q && (
          <button onClick={() => { setQ(""); setResults([]); inputRef.current?.focus(); }} className="shrink-0">
            <X size={14} style={{ color: "var(--text-muted)" }} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] rounded-[12px] overflow-hidden z-50"
             style={{ background: "var(--panel)", border: "1px solid var(--border)", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
          {loading && (
            <p className="px-3 py-3 text-sm" style={{ color: "var(--text-soft)" }}>Searching…</p>
          )}
          {!loading && results.length === 0 && (
            <p className="px-3 py-3 text-sm" style={{ color: "var(--text-soft)" }}>No users found</p>
          )}
          {!loading && results.map((r, i) => (
            <button
              key={r.username}
              onClick={() => go(r.username)}
              onMouseEnter={() => setActive(i)}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors"
              style={{ background: active === i ? "var(--panel-2)" : "transparent" }}
            >
              <Avatar seed={r.username} size={30} uploadedUrl={r.avatar_url} />
              <span className="flex-1 text-sm font-medium truncate" style={{ color: "var(--text)" }}>@{r.username}</span>
              {r.win_rate != null && (
                <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{r.win_rate}%</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
