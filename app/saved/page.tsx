"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type SavedItem = {
  id: string;
  query: string;
  science_result: { sentence: string; source: string };
  fantasy_result: { sentence: string; source: string };
  created_at: string;
};

function getDeviceId(): string {
  const key = "dichotomy-device-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(key, created);
  return created;
}

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/saved?deviceId=${encodeURIComponent(getDeviceId())}`)
      .then((response) => response.json())
      .then((data: { items?: SavedItem[] }) => setItems(data.items ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <main className="saved-page">
      <header className="saved-topbar">
        <Link className="saved-home-link" href="/">Dichotomy</Link>
        <span>Your own vocabulary</span>
        <span>SAVED</span>
      </header>
      {loading && <p className="saved-empty">Loading saved pairings...</p>}
      {!loading && items.length === 0 && <p className="saved-empty">Nothing saved yet.</p>}
      <section className="saved-grid">
        {items.map((item) => (
          <article className="saved-item" key={item.id}>
            <p className="saved-query">{item.query}</p>
            <div><p className="saved-label">Science</p><blockquote>“{item.science_result.sentence}”</blockquote><p className="source">{item.science_result.source}</p></div>
            <div><p className="saved-label">Fantasy / RPG</p><blockquote>“{item.fantasy_result.sentence}”</blockquote><p className="source">{item.fantasy_result.source}</p></div>
          </article>
        ))}
      </section>
    </main>
  );
}