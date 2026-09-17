import Image from "next/image";
import SearchForm from "./search-form";

export default function Home() {
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
          <h1>Put a word<br /><span>under pressure.</span></h1>
          <p className="intro">See the same language collide with a scientific paper and a fantasy world. Real sources, sharply different worlds.</p>
          <SearchForm />
        </div>
        <div className="photo-stage" aria-label="Laundry moving above a Tbilisi courtyard">
          <Image className="photo photo-still" src="/images.jpeg" alt="Laundry hanging from an old Tbilisi building" fill sizes="(max-width: 640px) 100vw, 44vw" priority />
          <Image className="photo photo-fabric" src="/images.jpeg" alt="" aria-hidden="true" fill sizes="(max-width: 640px) 100vw, 44vw" />
        </div>
      </section>
    </main>
  );
}
