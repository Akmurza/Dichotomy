"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import SearchForm from "./search-form";

type PhotoMotion = "idle" | "breaking" | "reassembled";

export default function Home() {
  const [photoMotion, setPhotoMotion] = useState<PhotoMotion>("idle");
  const [sourcePanel, setSourcePanel] = useState<"science" | "fantasy" | null>(null);

  return (
    <main className="shell">
      <svg className="filter-definitions" aria-hidden="true">
        <defs>
          <filter id="fabric-wind" x="-10%" y="-10%" width="120%" height="120%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.012 0.08"
              numOctaves="2"
              seed="8"
              result="wind"
            >
              <animate
                attributeName="baseFrequency"
                dur="7s"
                values="0.012 0.08;0.018 0.1;0.012 0.08"
                repeatCount="indefinite"
              />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" in2="wind" scale="13" xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
      </svg>
      <header className="topbar">
        <span className="wordmark">Dichotomy</span>
        <nav className="status" aria-label="Source catalogs">
          <button type="button" className="source-trigger" onClick={() => setSourcePanel("science")}>SCIENCE</button>
          <span aria-hidden="true"> / </span>
          <button type="button" className="source-trigger" onClick={() => setSourcePanel("fantasy")}>FANTASY</button>
        </nav>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Vocabulary / extreme contexts</p>
          <h1>Put a <span className="flicker">word</span><br /><span>under pressure.</span></h1>
          <p className="intro">See the same language collide with a scientific paper and a fantasy world. Real sources, sharply different poles.</p>
          <SearchForm onPhotoMotion={setPhotoMotion} />
        </div>
        <div className={`photo-stage is-${photoMotion}`} aria-label="Laundry moving above a Tbilisi courtyard">
          <Link className="at-home-fragment" href="/saved" aria-label="Open saved vocabulary">
            <Image className="at-home-fragment-photo" src="/images.jpeg" alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 44vw" />
            <span>AT HOME</span>
          </Link>
          {Array.from({ length: 6 }, (_, index) => (
            <Image
              className={`photo-piece photo-piece-${index + 1}`}
              src="/images.jpeg"
              alt={index === 0 ? "Laundry hanging from an old Tbilisi building" : ""}
              aria-hidden={index !== 0}
              fill
              sizes="(max-width: 640px) 100vw, 44vw"
              priority={index === 0}
              key={index}
            />
          ))}
        </div>
      </section>
      {sourcePanel && <SourcePanel kind={sourcePanel} onClose={() => setSourcePanel(null)} />}
    </main>
  );
}

function SourcePanel({ kind, onClose }: { kind: "science" | "fantasy"; onClose: () => void }) {
  const science = kind === "science";
  const fantasyBooks = [
    "Grimm's Fairy Tales — Jacob and Wilhelm Grimm",
    "The Blue Fairy Book — Andrew Lang",
    "Frankenstein — Mary Shelley",
    "The Wonderful Wizard of Oz — L. Frank Baum",
    "Alice's Adventures in Wonderland — Lewis Carroll",
    "The Princess and the Goblin — George MacDonald",
    "Le Morte d'Arthur — Thomas Malory",
    "The Story of Siegfried — James Baldwin",
    "The Arabian Nights Entertainments — Andrew Lang",
    "The Adventures of Sherlock Holmes — Arthur Conan Doyle",
    "The Picture of Dorian Gray — Oscar Wilde",
    "Metamorphosis — Franz Kafka",
    "The Odyssey — Homer",
    "The Jungle Book — Rudyard Kipling",
    "The Time Machine — H. G. Wells",
    "The War of the Worlds — H. G. Wells",
    "Nineteen Eighty-Four — George Orwell",
    "The Iron Heel — Jack London",
    "The Scarlet Plague — Jack London",
    "The Last Man — Mary Shelley",
    "The Night Land — William Hope Hodgson",
  ];

  return (
    <div className="source-panel-backdrop" role="presentation" onClick={onClose}>
      <section className="source-panel" role="dialog" aria-modal="true" aria-labelledby="source-panel-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="source-panel-close" onClick={onClose} aria-label="Close source list">Close</button>
        <p className="eyebrow">Available source layer</p>
        <h2 id="source-panel-title">{science ? "Science" : "Fantasy / RPG"}</h2>
        {science ? (
          <>
            <p className="source-panel-note">Live scholarly works are searched through OpenAlex. The complete OpenAlex catalog is too large to copy into this window; each result links to its original work.</p>
            <a className="catalog-link" href="https://openalex.org/works" target="_blank" rel="noreferrer">Open the OpenAlex catalog</a>
          </>
        ) : (
          <>
            <p className="source-panel-note">The Fantasy/RPG corpus is indexed locally from public-domain Gutenberg texts and SRD datasets.</p>
            <ul className="source-list">{fantasyBooks.map((book) => <li key={book}>{book}</li>)}</ul>
            <p className="source-panel-note">Also indexed: SRD spells, monsters, and equipment.</p>
          </>
        )}
      </section>
    </div>
  );
}
