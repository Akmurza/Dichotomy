"use client";

import { Fragment, FormEvent, useEffect, useState, type CSSProperties } from "react";
import { getDeviceId } from "@/lib/device-id";
import type { SearchResponse, SearchResult, SearchSideState } from "@/lib/search-types";

type ResultCardState = SearchSideState | { status: "loading" };
type SeenPair = {
  science: { sentence: string; sourceUrl: string | null };
  fantasy: { sentence: string; sourceUrl: string | null };
};

type PhotoMotion = "idle" | "breaking" | "reassembled";

export default function SearchForm({ onPhotoMotion }: { onPhotoMotion: (motion: PhotoMotion) => void }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [motion, setMotion] = useState<"idle" | "dissolve" | "reveal">("idle");
  const [saved, setSaved] = useState(false);

  function seenPairsFor(queryValue: string): SeenPair[] {
    try {
      const key = `dichotomy-seen:${queryValue.toLocaleLowerCase()}`;
      return JSON.parse(window.sessionStorage.getItem(key) ?? "[]") as SeenPair[];
    } catch {
      return [];
    }
  }

  function rememberPair(response: SearchResponse) {
    if (response.science.status !== "found" || response.fantasy.status !== "found") return;
    const key = `dichotomy-seen:${response.query.toLocaleLowerCase()}`;
    const seen = seenPairsFor(response.query);
    seen.push({
      science: { sentence: response.science.result.sentence, sourceUrl: response.science.result.sourceUrl },
      fantasy: { sentence: response.fantasy.result.sentence, sourceUrl: response.fantasy.result.sourceUrl },
    });
    window.sessionStorage.setItem(key, JSON.stringify(seen.slice(-50)));
  }

  async function saveResult() {
    if (!result || result.science.status !== "found" || result.fantasy.status !== "found") return;
    const response = await fetch("/api/saved", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: getDeviceId(),
        query: result.query,
        science: result.science.result,
        fantasy: result.fantasy.result,
      }),
    });
    if (!response.ok) throw new Error("Could not save this pairing.");
    setSaved(true);
  }
  useEffect(() => {
    try {
      getDeviceId();
    } catch (deviceIdError) {
      console.warn("Could not initialize the device ID:", deviceIdError);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setSaved(false);
    onPhotoMotion("breaking");
    setError("");
    if (result) setMotion("dissolve");

    try {
      const response = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, refresh: Boolean(result), seen: seenPairsFor(query) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Search failed.");
      onPhotoMotion("reassembled");
      rememberPair(data);
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
      onPhotoMotion("idle");
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
      {(result || loading) && (
        <section
          className={`results ${motion !== "idle" ? `is-${motion}` : ""}`}
          aria-live="polite"
          aria-busy={loading}
        >
          <ResultCard
            title="Science"
            query={result?.query ?? query}
            state={loading ? { status: "loading" } : result?.science ?? { status: "empty" }}
            type="science"
            saved={saved}
            onSave={() => saveResult().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not save this pairing."))}
          />
          <ResultCard
            title="Fantasy / RPG"
            query={result?.query ?? query}
            state={loading ? { status: "loading" } : result?.fantasy ?? { status: "empty" }}
            type="fantasy"
            saved={saved}
            onSave={() => saveResult().catch((requestError) => setError(requestError instanceof Error ? requestError.message : "Could not save this pairing."))}
          />
          {motion !== "idle" && <span className="word-substance" aria-hidden="true" />}
        </section>
      )}
    </>
  );
}

function ResultCard({
  title,
  query,
  state,
  type,
  saved,
  onSave,
}: {
  title: string;
  query: string;
  state: ResultCardState;
  type: "science" | "fantasy";
  saved: boolean;
  onSave: () => void;
}) {
  if (state.status === "loading") {
    return (
      <article className={`result-card result-${type}`} aria-busy="true">
        <p className="card-label">{title}</p>
        <p className="result-state" role="status">Searching {title.toLowerCase()}...</p>
      </article>
    );
  }

  if (state.status === "empty") {
    return (
      <article className={`result-card result-${type}`}>
        <p className="card-label">{title}</p>
        <p className="result-state">No {title.toLowerCase()} result found for &ldquo;{query}&rdquo;.</p>
      </article>
    );
  }

  if (state.status === "error") {
    return (
      <article className={`result-card result-${type}`}>
        <p className="card-label">{title}</p>
        <p className="result-state" role="alert">{state.message}</p>
      </article>
    );
  }

  return <FoundResultCard title={title} result={state.result} type={type} saved={saved} onSave={onSave} />;
}

function FoundResultCard({ title, result, type, saved, onSave }: { title: string; result: SearchResult; type: "science" | "fantasy"; saved: boolean; onSave: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const context = expanded && result.context?.length ? result.context : [result.sentence];

  return (
    <article className={`result-card result-${type}`}>
      <p className="card-label">{title}</p>
      <blockquote>
        “{context.map((sentence, sentenceIndex) => <Fragment key={`${sentence}-${sentenceIndex}`}>
          {sentenceIndex > 0 && " "}
          {type === "fantasy"
            ? sentence.split(" ").map((word, index) => (
              <Fragment key={`${word}-${index}`}>
                {index > 0 && " "}
                <span className="fragment" style={{ "--fragment-index": index } as CSSProperties}>{word}</span>
              </Fragment>
            ))
            : sentence}
        </Fragment>)}”
      </blockquote>
      <p className="source">
        {result.sourceUrl ? (
          <a className="source-link" href={result.sourceUrl} target="_blank" rel="noreferrer">
            {result.source}
          </a>
        ) : result.source}
      </p>
      {result.isFallback && <p className="fallback">Matched through related word: {result.fallbackWord ?? "a synonym"}.</p>}
      <div className="result-controls">
        {result.context && result.context.length > 1 && <button type="button" className="text-control" onClick={() => setExpanded((value) => !value)}>{expanded ? "Collapse" : "Expand"}</button>}
        <button type="button" className="text-control" onClick={onSave}>{saved ? "Saved" : "Save"}</button>
      </div>
    </article>
  );
}
