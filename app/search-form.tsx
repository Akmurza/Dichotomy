"use client";

import { Fragment, FormEvent, useState, type CSSProperties } from "react";

type Result = {
  sentence: string;
  source: string;
  sourceUrl: string | null;
  isFallback?: boolean;
};

type SearchResponse = {
  query: string;
  science: Result;
  fantasy: Result;
  cached: boolean;
  demo?: boolean;
};

export default function SearchForm() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [motion, setMotion] = useState<"idle" | "dissolve" | "reveal">("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    if (result) setMotion("dissolve");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      if (!result) {
        setResult(data);
        setMotion("reveal");
        window.setTimeout(() => setMotion("idle"), 900);
      } else {
        window.setTimeout(() => {
          setResult(data);
          setMotion("reveal");
          window.setTimeout(() => setMotion("idle"), 1200);
        }, 850);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed.");
      setMotion("idle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="search-form" onSubmit={handleSubmit}>
        <label htmlFor="word">Enter a word or short phrase</label>
        <div className="search-row">
          <input id="word" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="try: twist" />
          <button type="submit" disabled={loading}>{loading ? "Searching..." : "Search"}</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      {result && motion !== "idle" && <span className={`site-blackout is-${motion}`} aria-hidden="true" />}
      {result && (
        <section className={`results ${motion !== "idle" ? `is-${motion}` : ""}`} aria-live="polite">
          <ResultCard title="Science" result={result.science} type="science" />
          <ResultCard title="Fantasy / RPG" result={result.fantasy} type="fantasy" />
          {motion !== "idle" && <span className="word-substance" aria-hidden="true" />}
        </section>
      )}
    </>
  );
}

function ResultCard({ title, result, type }: { title: string; result: Result; type: "science" | "fantasy" }) {
  return (
    <article className={`result-card result-${type}`}>
      <p className="card-label">{title}</p>
      <blockquote>
        “{type === "fantasy"
          ? result.sentence.split(" ").map((word, index) => (
            <Fragment key={`${word}-${index}`}>
              {index > 0 && " "}<span className="fragment" style={{ "--fragment-index": index } as CSSProperties}>{word}</span>
            </Fragment>
          ))
          : result.sentence}”
      </blockquote>
      <p className="source">{result.source}</p>
      {result.isFallback && <p className="fallback">Matched through a related word.</p>}
    </article>
  );
}
