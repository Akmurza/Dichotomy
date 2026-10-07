"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getDeviceId } from "@/lib/device-id";

type SavedItem = {
  id: string;
  query: string;
  science_result: { sentence: string; source: string };
  fantasy_result: { sentence: string; source: string };
  created_at: string;
};

export default function SavedPage() {
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    async function loadSavedItems() {
      try {
        const response = await fetch(`/api/saved?deviceId=${encodeURIComponent(getDeviceId())}`);
        const data = await response.json().catch(() => null) as { items?: SavedItem[] } | null;
        if (!response.ok) throw new Error("Saved items request failed.");
        setItems(data?.items ?? []);
      } catch {
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    }

    void loadSavedItems();
  }, []);

  return (
    <main className="saved-page">
      <header className="saved-topbar">
        <Link className="saved-home-link" href="/">Dichotomy</Link>
        <span>Your own vocabulary</span>
        <span>SAVED</span>
      </header>
      <section className="saved-intro" aria-labelledby="saved-title">
        <p className="eyebrow">Vocabulary / saved collection</p>
        <div className="saved-heading-row">
          <h1 id="saved-title">Saved <span>pairings.</span></h1>
          <p className="saved-count" aria-live="polite">
            {loading ? "Loading archive" : `${items.length.toString().padStart(2, "0")} ${items.length === 1 ? "PAIR" : "PAIRS"}`}
          </p>
        </div>
      </section>
      {loading && <p className="saved-empty" role="status">Loading saved pairings...</p>}
      {!loading && loadError && (
        <div className="saved-empty saved-load-error" role="alert">
          <p className="saved-empty-title">Saved pairings are temporarily unavailable.</p>
        </div>
      )}
      {!loading && !loadError && items.length === 0 && (
        <div className="saved-empty">
          <p className="saved-empty-title">Nothing saved yet.</p>
          <Link href="/">Explore a word <span aria-hidden="true">↗</span></Link>
        </div>
      )}
      <section className="saved-grid" aria-label="Saved vocabulary">
        {items.map((item) => (
          <article className="saved-item" key={item.id}>
            <div className="saved-item-query">
              <p className="saved-label">Saved query</p>
              <p className="saved-query">{item.query}</p>
            </div>
            <div className="saved-results">
              <section className="saved-result saved-result-science" aria-label="Science result">
                <p className="saved-label">01 / Science</p>
                <blockquote>“{item.science_result.sentence}”</blockquote>
                <p className="source">{item.science_result.source}</p>
              </section>
              <section className="saved-result saved-result-fantasy" aria-label="Fantasy and RPG result">
                <p className="saved-label">02 / Fantasy / RPG</p>
                <blockquote>“{item.fantasy_result.sentence}”</blockquote>
                <p className="source">{item.fantasy_result.source}</p>
              </section>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}