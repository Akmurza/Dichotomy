"use client";

import Image from "next/image";
import { useState } from "react";
import SearchForm from "./search-form";

type PhotoMotion = "idle" | "breaking" | "reassembled";

export default function Home() {
  const [photoMotion, setPhotoMotion] = useState<PhotoMotion>("idle");

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
        <span className="status">SCIENCE / FANTASY</span>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Vocabulary / extreme contexts</p>
          <h1>Put a <span className="flicker">word</span><br /><span>under pressure.</span></h1>
          <p className="intro">See the same language collide with a scientific paper and a fantasy world. Real sources, sharply different worlds.</p>
          <SearchForm onPhotoMotion={setPhotoMotion} />
        </div>
        <div className={`photo-stage is-${photoMotion}`} aria-label="Laundry moving above a Tbilisi courtyard">
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
    </main>
  );
}
