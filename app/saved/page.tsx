"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device-id";

type SavedItem = {
  id: string;
  query: string;
  science_result: { sentence: string; source: string; sourceUrl?: string | null };
  fantasy_result: { sentence: string; source: string; sourceUrl?: string | null };
  created_at: string;
};

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
            <div><p className="saved-label">Science</p><blockquote>“{item.science_result.sentence}”</blockquote><p className="source">{item.science_result.sourceUrl ? <a className="source-link" href={item.science_result.sourceUrl} target="_blank" rel="noreferrer">{item.science_result.source}</a> : item.science_result.source}</p></div>
            <div><p className="saved-label">Fantasy / RPG</p><blockquote>“{item.fantasy_result.sentence}”</blockquote><p className="source">{item.fantasy_result.sourceUrl ? <a className="source-link" href={item.fantasy_result.sourceUrl} target="_blank" rel="noreferrer">{item.fantasy_result.source}</a> : item.fantasy_result.source}</p></div>
          </article>
        ))}
      </section>
    </main>
  );
}