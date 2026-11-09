import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { notify, subscribeNotice } from "./notice.js";
import { Workspace } from "./workspace.jsx";
import { Icon, NAV_ICON } from "./icons.jsx";
import { LANGS, setLanguage, t, useLanguage } from "./i18n.js";

const SESSION_KEY = "ishuri.pwa.session";

const NAV = [
  { id: "home", label: "Discover", path: "#/" },
  { id: "rankings", label: "Rankings", path: "#/rankings" },
  { id: "events", label: "Events", path: "#/events" },
  { id: "now", label: "Now", path: "#/now" },
];

function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  return hash;
}

function go(path) {
  window.location.hash = path;
}

export default function App() {
  const lang = useLanguage();
  const hash = useHash();
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem(SESSION_KEY);
    if (saved) setSession(JSON.parse(saved));
    setReady(true);
  }, []);

  function signIn(next) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(next));
    setSession(next);
    go("#/desk");
  }

  function signOut() {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    go("#/");
  }

  const route = useMemo(() => {
    const path = hash.replace(/^#/, "") || "/";
    if (path.startsWith("/school/")) return { name: "school", id: decodeURIComponent(path.slice(8)) };
    if (path === "/desk" || path.startsWith("/desk/")) return { name: "desk", section: path.replace(/^\/desk\/?/, "") || "home" };
    if (path.startsWith("/gate")) return { name: "gate" };
    if (path.startsWith("/events")) return { name: "events" };
    if (path.startsWith("/now")) return { name: "now" };
    if (path.startsWith("/rankings")) return { name: "rankings" };
    return { name: "home" };
  }, [hash]);

  useEffect(() => {
    const titles = {
      home: t("IshuriApp — Rwanda’s school atlas"),
      rankings: t("School rankings in Rwanda — IshuriApp"),
      events: t("School events in Rwanda — IshuriApp"),
      now: t("Opportunities now — IshuriApp"),
      gate: t("Staff sign in — IshuriApp"),
      desk: t("School workspace — IshuriApp"),
      school: t("School — IshuriApp"),
    };
    document.title = titles[route.name] || titles.home;
    if (route.name !== "school") {
      const description = document.querySelector('meta[name="description"]');
      if (description) description.setAttribute("content", t("IshuriApp is Rwanda’s school atlas. Search approved schools, open a school website, and compare national rankings, events and notices. Students and parents browse freely."));
    }
  }, [route.name, lang]);

  if (!ready) return null;

  const workspace = route.name === "gate" || route.name === "desk";

  return (
    <div className="app">
      <div className="scene" aria-hidden="true">
        <span className="orb one" />
        <span className="orb two" />
        <span className="orb three" />
        <svg className="orbit" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="70" />
          <circle cx="100" cy="100" r="46" />
          <circle cx="170" cy="100" r="5" />
        </svg>
      </div>
      <header className="topbar">
        <a className="brand" href="#/" onClick={(event) => { event.preventDefault(); go("#/"); }}>
          <img src="/logo-512.png" alt={t("IshuriApp")} width="64" height="64" />
          <div>
            <strong>{t("IshuriApp")}</strong>
            <span>{t("Rwanda’s school atlas")}</span>
          </div>
        </a>
        <nav className="nav">
          {NAV.map((item) => (
            <button key={item.id} className={route.name === item.id ? "active" : ""} onClick={() => go(item.path)}>
              <Icon name={NAV_ICON[item.id]} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <label className="lang-switch">
          <span>{t("Language")}</span>
          <select value={lang} aria-label={t("Language")} onChange={(event) => setLanguage(event.target.value)}>
            {LANGS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button className={`workspace-link${workspace ? " active" : ""}`} onClick={() => go(session ? "#/desk" : "#/gate")}>
          <Icon name={session ? "briefcase" : "key"} />
          <span>{session ? t("Workspace") : t("Staff sign in")}</span>
        </button>
      </header>
      <main key={hash} className="stage">
        {route.name === "home" && <Home />}
        {route.name === "events" && <Events />}
        {route.name === "rankings" && <Rankings />}
        {route.name === "now" && <Now />}
        {route.name === "school" && <SchoolPage id={route.id} />}
        {route.name === "gate" && <Gate onSignIn={signIn} />}
        {route.name === "desk" && <Workspace session={session} section={route.section} onSignOut={signOut} onSession={setSession} />}
      </main>
      <footer className="site-foot">
        <span>{t("IshuriApp · Rwanda’s school atlas")}</span>
        <span>{t("Students and parents browse freely. Staff sign in for the desk.")}</span>
      </footer>
      <NoticeHost />
    </div>
  );
}

function NoticeHost() {
  const [note, setNote] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => subscribeNotice((next) => {
    if (next.kind === "busy") setBusy(next.busy);
    else setNote(next);
  }), []);
  useEffect(() => {
    if (!note) return undefined;
    const timer = window.setTimeout(() => setNote((current) => (current?.id === note.id ? null : current)), 4500);
    return () => window.clearTimeout(timer);
  }, [note]);
  const tone = note?.tone === "bad" ? "bad" : note?.tone === "warn" ? "warn" : note?.tone === "alert" ? "alert" : "ok";
  const toneIcon = tone === "bad" ? "close" : tone === "warn" ? "alert" : tone === "alert" ? "info" : "check";
  const toneLabel = tone === "bad" ? t("Error") : tone === "warn" ? t("Warning") : tone === "alert" ? t("Alert") : t("Success");
  return (
    <>
      {busy ? (
        <div className="loading-overlay" role="status">
          <div className="loading-card">
            <span className="loader-stage">
              <span className="loader-ring" />
              <span className="loader-dot" />
            </span>
            <strong>{t("Loading...")}</strong>
            <div className="track busy-track" aria-hidden="true"><div className="fill" /></div>
          </div>
        </div>
      ) : null}
      {note ? (
        <button type="button" className={`toast ${tone}`} onClick={() => setNote(null)}>
          <span className="toast-icon"><Icon name={toneIcon} /></span>
          <span className="toast-copy">
            <em>{toneLabel}</em>
            <strong>{note.title}</strong>
            {note.body ? <p>{note.body}</p> : null}
          </span>
          <i className="toast-bar" />
        </button>
      ) : null}
    </>
  );
}

function adSlides(ads, mode) {
  return (ads || []).flatMap((ad) => {
    const video = Boolean(ad.videoUrl);
    const image = Boolean(ad.imageUrl);
    if (mode === "home") {
      if (video) return [{ key: `${ad._id}-video`, ad, kind: "video" }];
      if (image) return [{ key: `${ad._id}-image`, ad, kind: "image" }];
      return [{ key: `${ad._id}-text`, ad, kind: "text" }];
    }
    const parts = [];
    if (image) parts.push({ key: `${ad._id}-image`, ad, kind: "image" });
    if (video) parts.push({ key: `${ad._id}-video`, ad, kind: "video" });
    if (!parts.length) parts.push({ key: `${ad._id}-text`, ad, kind: "text" });
    return parts;
  });
}

function AdVideo({ src, poster, onEnded, loop = false, interactive = false }) {
  const ref = useRef(null);
  const done = useRef(onEnded);
  const armedSrc = useRef("");
  const [sound, setSound] = useState(false);
  done.current = onEnded;
  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    node.loop = loop;
    if (armedSrc.current !== src) {
      armedSrc.current = src;
      node.muted = true;
      node.volume = 0;
      setSound(false);
    }
    let finished = false;
    let timer;
    const finish = () => {
      if (finished || loop) return;
      finished = true;
      done.current?.();
    };
    const arm = () => {
      if (loop) return;
      clearTimeout(timer);
      const ms = Number.isFinite(node.duration) && node.duration > 0 ? node.duration * 1000 + 500 : 20000;
      timer = setTimeout(finish, ms);
    };
    node.addEventListener("loadedmetadata", arm);
    node.addEventListener("ended", finish);
    const play = node.play();
    if (play && typeof play.catch === "function") play.catch(() => undefined);
    return () => {
      clearTimeout(timer);
      node.removeEventListener("loadedmetadata", arm);
      node.removeEventListener("ended", finish);
    };
  }, [src, loop]);

  function toggleSound(event) {
    event.preventDefault();
    event.stopPropagation();
    const node = ref.current;
    if (!node) return;
    const enable = node.muted;
    node.muted = !enable;
    node.volume = enable ? 1 : 0;
    const play = node.play();
    if (play && typeof play.catch === "function") play.catch(() => undefined);
    setSound(enable);
  }

  return (
    <>
      <video ref={ref} src={src} poster={poster || undefined} autoPlay muted={!sound} playsInline loop={loop} onClick={interactive ? toggleSound : undefined} />
      {interactive ? (
        <button type="button" className={`now-sound${sound ? " on" : ""}`} onClick={toggleSound}>
          {sound ? t("Sound on") : t("Tap for sound")}
        </button>
      ) : null}
    </>
  );
}

function AdStage({ ads, mode }) {
  const slides = useMemo(() => adSlides(ads, mode), [ads, mode]);
  const [index, setIndex] = useState(0);
  const [docked, setDocked] = useState(false);
  const slide = slides[index] || null;
  const cinema = mode === "now" && slide?.kind === "video" && !docked;

  useEffect(() => {
    setIndex(0);
  }, [slides.length, mode]);

  useEffect(() => {
    setDocked(false);
  }, [index]);

  function next() {
    setIndex((current) => (slides.length ? (current + 1) % slides.length : 0));
  }

  useEffect(() => {
    if (!slide || slide.kind === "video" || slides.length < 2) return undefined;
    const timer = setTimeout(next, 7000);
    return () => clearTimeout(timer);
  }, [index, slide, slides.length]);

  useEffect(() => {
    if (!cinema) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [cinema]);

  if (!slide) return null;
  const ad = slide.ad;
  if (mode === "home") {
    return (
      <div className="ad-reel home-stage">
        <div className="ad-media">
          {slide.kind === "video" ? (
            <AdVideo key={slide.key} src={ad.videoUrl} poster={ad.imageUrl} loop={slides.length < 2} onEnded={() => (slides.length > 1 ? next() : undefined)} />
          ) : slide.kind === "image" ? (
            <SoftImage src={ad.imageUrl} alt="" className="ad-photo" />
          ) : (
            <div className="ad-blank" aria-hidden="true"><Icon name="megaphone" /></div>
          )}
          <p className="kicker ad-pill">{t((ad.category || "ad").replaceAll("_", " "))}</p>
        </div>
        <div className="ad-copy">
          <h2>{ad.title}</h2>
          {ad.body ? <p className="muted">{ad.body}</p> : null}
          {ad.ctaUrl ? (
            <a className="ad-action" href={ad.ctaUrl} target="_blank" rel="noreferrer" onClick={() => api(`/public/ads/${ad._id}/click`, { method: "POST" }).catch(() => undefined)}>
              {ad.ctaLabel || "Open"}
              <Icon name="right" />
            </a>
          ) : null}
          {slides.length > 1 ? (
            <div className="ad-dots">
              {slides.map((item, dot) => (
                <button key={item.key} type="button" className={dot === index ? "on" : ""} aria-label={item.ad.title} onClick={() => setIndex(dot)} />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }
  const frame = (
    <div className={`ad-reel${mode === "now" ? " now-stage" : ""}${docked && slide.kind === "video" ? " now-docked" : ""}`}>
      {slide.kind === "video" ? (
        <AdVideo key={slide.key} src={ad.videoUrl} poster={ad.imageUrl} loop={slides.length < 2} interactive={mode === "now"} onEnded={() => (slides.length > 1 ? next() : undefined)} />
      ) : slide.kind === "image" ? (
        <SoftImage src={ad.imageUrl} alt="" className={mode === "now" ? "ad-photo now-photo" : "ad-photo"} />
      ) : null}
      <div className="ad-copy">
        <p className="kicker">{t((ad.category || "ad").replaceAll("_", " "))}</p>
        <h2>{ad.title}</h2>
        {ad.body ? <p className="muted">{ad.body}</p> : null}
        {ad.ctaUrl ? (
          <a className="solid" href={ad.ctaUrl} target="_blank" rel="noreferrer" onClick={() => api(`/public/ads/${ad._id}/click`, { method: "POST" }).catch(() => undefined)}>
            {ad.ctaLabel || "Open"}
          </a>
        ) : null}
        {slides.length > 1 ? (
          <div className="ad-dots" aria-hidden="true">
            {slides.map((item, dot) => <i key={item.key} className={dot === index ? "on" : ""} />)}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (!cinema) return frame;
  return createPortal(
    <div className="now-cinema" role="dialog" aria-modal="true" aria-label={ad.title}>
      <button type="button" className="now-close" onClick={() => setDocked(true)}>{t("Close")}</button>
      {frame}
    </div>,
    document.body
  );
}

function WaveBand({ tint, extra = "" }) {
  const path = "M0,64 C160,104 320,24 480,64 C640,104 800,24 960,64 C1120,104 1280,24 1440,64 L1440,140 L0,140 Z";
  return (
    <div className={`wave-band ${extra}`}>
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill={tint} />
      </svg>
      <svg viewBox="0 0 1440 140" preserveAspectRatio="none" aria-hidden="true">
        <path d={path} fill={tint} />
      </svg>
    </div>
  );
}

function SeaBackdrop() {
  return (
    <div className="sea-bg" aria-hidden="true">
      <WaveBand tint="rgba(79,195,247,0.55)" extra="far" />
      <WaveBand tint="rgba(21,101,192,0.28)" extra="mid" />
      <WaveBand tint="rgba(255,255,255,0.82)" extra="near" />
    </div>
  );
}

function CrestGraphic() {
  return (
    <svg className="crest" viewBox="0 0 440 240" role="img" aria-label={t("Parents follow marks and discipline by phone message")}>
      <defs>
        <linearGradient id="crestSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3f2fd" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <linearGradient id="crestRoof" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#4FC3F7" />
          <stop offset="100%" stopColor="#0D47A1" />
        </linearGradient>
        <filter id="crestLift" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#0D47A1" floodOpacity="0.16" />
        </filter>
      </defs>
      <rect x="4" y="4" width="432" height="232" rx="34" fill="url(#crestSky)" />
      <circle cx="392" cy="36" r="28" fill="#ffffff" opacity="0.72" />
      <ellipse cx="168" cy="46" rx="22" ry="9" fill="#ffffff" />
      <ellipse cx="186" cy="44" rx="14" ry="8" fill="#ffffff" />
      <path d="M18 196 C70 168 150 176 210 198 C150 214 60 220 18 208 Z" fill="#d7e8f8" />
      <ellipse cx="28" cy="186" rx="14" ry="7" fill="#b7d7f2" />
      <path d="M30 118 L74 72 L118 118 Z" fill="url(#crestRoof)" />
      <rect x="73" y="56" width="2.4" height="18" fill="#1565C0" />
      <path d="M75.4 56 h14 l-4 4.5 4 4.5 h-14 Z" fill="#4FC3F7" />
      <rect x="40" y="118" width="68" height="64" rx="6" fill="#ffffff" filter="url(#crestLift)" />
      <circle cx="74" cy="104" r="9" fill="#ffffff" />
      <circle cx="74" cy="104" r="6" fill="#0D47A1" />
      <path d="M74 104 V100.5 M74 104 L77.2 106" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="50" y="132" width="16" height="13" rx="2" fill="#e3f2fd" />
      <rect x="82" y="132" width="16" height="13" rx="2" fill="#e3f2fd" />
      <path d="M58 132 v13 M50 138.5 h16 M90 132 v13 M82 138.5 h16" stroke="#ffffff" strokeWidth="1.4" />
      <rect x="64" y="154" width="18" height="28" rx="3" fill="#1565C0" />
      <circle cx="78" cy="169" r="1.5" fill="#ffffff" />
      <path className="crest-signal" d="M120 96 C168 46 214 40 268 72" fill="none" stroke="#1565C0" strokeWidth="2.2" strokeLinecap="round" />
      <circle r="5.5" fill="#ffffff" stroke="#0D47A1" strokeWidth="2">
        <animateMotion dur="3.2s" repeatCount="indefinite" path="M120 96 C168 46 214 40 268 72" />
      </circle>
      <rect x="136" y="168" width="12" height="16" rx="3" fill="#0D47A1" />
      <circle cx="162" cy="150" r="14" fill="#e0ac7a" />
      <path d="M148 146 C150 128 174 128 176 146 C170 136 154 136 148 146" fill="#3a2415" />
      <circle cx="157" cy="150" r="1.7" fill="#3a2415" />
      <circle cx="167" cy="150" r="1.7" fill="#3a2415" />
      <path d="M156 157 Q162 161 168 157" fill="none" stroke="#a86b45" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="148" y="164" width="28" height="30" rx="10" fill="#4FC3F7" />
      <rect x="154" y="192" width="6" height="14" rx="2" fill="#0D47A1" />
      <rect x="166" y="192" width="6" height="14" rx="2" fill="#0D47A1" />
      <circle cx="210" cy="118" r="17" fill="#d7a574" />
      <path d="M193 114 C196 92 224 92 227 114 C220 100 200 100 193 114" fill="#3a2415" />
      <circle cx="204" cy="118" r="1.8" fill="#3a2415" />
      <circle cx="216" cy="118" r="1.8" fill="#3a2415" />
      <path d="M203 126 Q210 131 217 126" fill="none" stroke="#a86b45" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="188" y="136" width="44" height="54" rx="16" fill="#1565C0" />
      <path d="M204 142 L210 154 L216 142" fill="#4FC3F7" />
      <path d="M228 150 Q248 162 266 168" fill="none" stroke="#d7a574" strokeWidth="7" strokeLinecap="round" />
      <circle cx="268" cy="168" r="5" fill="#e0ac7a" />
      <rect x="198" y="186" width="9" height="22" rx="3" fill="#0D47A1" />
      <rect x="216" y="186" width="9" height="22" rx="3" fill="#0D47A1" />
      <g filter="url(#crestLift)">
        <rect x="274" y="18" width="148" height="204" rx="26" fill="#0D47A1" />
        <rect x="282" y="30" width="132" height="180" rx="18" fill="#f7fbff" />
        <rect x="322" y="24" width="44" height="6" rx="3" fill="#4FC3F7" />
        <rect x="330" y="196" width="36" height="5" rx="2.5" fill="#d7e8f8" />
      </g>
      <g className="crest-msg">
        <rect x="294" y="48" width="108" height="72" rx="16" fill="#1565C0" />
        <text x="348" y="68" textAnchor="middle" fill="#d7f1fd" fontSize="11" fontWeight="700" letterSpacing="0.08em" fontFamily="Instrument Sans, sans-serif">{t("MARKS")}</text>
        <text x="348" y="98" textAnchor="middle" fill="#ffffff" fontSize="22" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94/100</text>
      </g>
      <g className="crest-msg late">
        <rect x="294" y="130" width="108" height="54" rx="16" fill="#ffffff" />
        <circle cx="318" cy="157" r="12" fill="#e3f2fd" />
        <path d="M313 157 l3.2 3.2 6.4-7" fill="none" stroke="#0D47A1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <text x="336" y="154" fill="#0D47A1" fontSize="12" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Discipline")}</text>
        <text x="336" y="170" fill="#1565C0" fontSize="11" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </g>
      <g className="crest-dot">
        <circle cx="406" cy="40" r="11" fill="#4FC3F7" />
        <circle cx="406" cy="40" r="4.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

function SchoolMark({ school }) {
  const [failed, setFailed] = useState(false);
  if (!school.logoUrl || failed) return school.name.slice(0, 1);
  return <SoftImage src={school.logoUrl} alt="" onError={() => setFailed(true)} />;
}

function SoftImage({ src, alt = "", className = "", onError }) {
  const imgRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const img = imgRef.current;
    if (!src || !img) return;
    if (img.complete) {
      const ok = img.naturalWidth > 0;
      setReady(ok);
      setFailed(!ok);
      if (!ok) onError?.();
      return;
    }
    setReady(false);
    setFailed(false);
  }, [src]);
  if (!src || failed) return <span className={`soft-ph soft-idle ${className}`.trim()} aria-hidden="true" />;
  return (
    <span className={`soft-frame ${className}${ready ? " is-ready" : ""}`.trim()}>
      <span className="soft-ph" aria-hidden="true" />
      <img
        ref={imgRef}
        alt={alt}
        src={src}
        onLoad={() => { setFailed(false); setReady(true); }}
        onError={() => { setFailed(true); onError?.(); }}
      />
    </span>
  );
}

function Home() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [schools, setSchools] = useState([]);
  const [ads, setAds] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (type) params.set("type", type);
    Promise.all([api(`/public/schools?${params}`), api("/public/ads")])
      .then(([schoolData, adData]) => {
        setSchools(schoolData.items || []);
        setAds(adData.items || []);
        setError("");
        setLoaded(true);
      })
      .catch((err) => {
        setError(err.message);
        setLoaded(true);
      });
  }, [q, type]);

  return (
    <div className="page home-page">
      <SeaBackdrop />
      <header className="page-head">
        <div>
          <h1>{t("The quiet atlas of Rwanda’s classrooms.")}</h1>
        </div>
        <CrestGraphic />
      </header>
      {error ? <p className="banner">{error}. Start the API on port 4000, then search again.</p> : null}
      <div className="toolbar">
        <form className="search" onSubmit={(event) => event.preventDefault()}>
          <input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t("Search a school, district or motto")} />
        </form>
        <div className="chips">
          {[
          ["", "All"],
          ["primary", "Primary"],
          ["secondary", "Secondary"],
          ["tvet", "TVET"],
          ["university", "University"],
        ].map(([item, label]) => (
            <button key={item || "all"} className={type === item ? "on" : ""} onClick={() => setType(item)}>
              {t(label)}
            </button>
          ))}
        </div>
      </div>
      {!loaded && !error ? (
        <div className="layout" aria-hidden="true">
          <div className="school-grid">
            {[0, 1, 2, 3].map((item) => (
              <div className="school skel-card" key={item}>
                <div className="cover skel" />
                <div className="school-body">
                  <span className="logo skel" />
                  <span className="skel-copy"><i className="skel" /><i className="skel short" /></span>
                </div>
              </div>
            ))}
          </div>
          <aside className="ad side-note skel-card">
            <div className="skel skel-media" />
            <i className="skel" />
            <i className="skel short" />
          </aside>
        </div>
      ) : (
        <div className={ads.length ? "layout" : ""}>
          <div className="school-grid">
            {schools.map((school) => (
              <button key={school._id} className="school" onClick={() => go(`#/school/${school.slug || school._id}`)}>
                <div className="cover">
                  {school.coverUrl ? <SoftImage src={school.coverUrl} alt="" /> : null}
                  {school.nationalRank ? <b>#{school.nationalRank}</b> : null}
                </div>
                <div className="school-body">
                  <span className="logo"><SchoolMark school={school} /></span>
                  <span>
                    <strong>{school.name}</strong>
                    <em>{school.tagline || school.motto || [school.location?.district, school.location?.province].filter(Boolean).join(", ") || "Rwanda"}</em>
                  </span>
                </div>
              </button>
            ))}
          </div>
          {ads.length ? (
            <aside className="ad side-note">
              <AdStage ads={ads} mode="home" />
            </aside>
          ) : null}
        </div>
      )}
      {loaded && schools.length === 0 && !error ? <p className="muted"><strong>{t("No schools yet")}</strong><br />{t("Approved schools appear here after IshuriApp review.")}</p> : null}
    </div>
  );
}

function Now() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api("/public/ads").then((data) => setItems(data.items || [])).catch((err) => setError(err.message)).finally(() => setLoaded(true));
  }, []);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t("Now")}</h1>
          <p className="lede">{t("The same ads as Discover. The image is shown first, then the video.")}</p>
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {!loaded && !error ? <div className="ad panel skel-card" aria-hidden="true"><div className="skel skel-stage" /><i className="skel" /><i className="skel short" /></div> : null}
      {items.length ? (
        <article className="ad panel">
          <AdStage ads={items} mode="now" />
        </article>
      ) : null}
      {loaded && items.length === 0 && !error ? <p className="muted">{t("No opportunities right now")}</p> : null}
    </div>
  );
}

const EVENT_LOOK = {
  parents_meeting: { label: "Parents meeting", icon: "people" },
  sport: { label: "Sport", icon: "sport" },
  competition: { label: "Competition", icon: "award" },
  debate: { label: "Debate", icon: "message" },
  ceremony: { label: "Ceremony", icon: "landmark" },
  visiting_day: { label: "Visiting day", icon: "pin" },
  graduation: { label: "Graduation", icon: "graduate" },
  scholarship: { label: "Scholarship", icon: "book" },
  other: { label: "Event", icon: "calendar" },
};

function eventLook(category) {
  return EVENT_LOOK[category] || { label: String(category || "event").replaceAll("_", " "), icon: "calendar" };
}

function calendarDots() {
  const dots = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      dots.push(
        <rect
          key={`${col}-${row}`}
          x={48 + col * 24}
          y={86 + row * 22}
          width="14"
          height="14"
          rx="4"
          fill={col === 2 && row === 1 ? "#1565C0" : "#e3f2fd"}
        />
      );
    }
  }
  return dots;
}

function EventsGraphic() {
  return (
    <svg className="events-crest" viewBox="0 0 320 200" role="img" aria-label={t("Calendar of school events")}>
      <defs>
        <linearGradient id="eventSky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e3f2fd" />
          <stop offset="1" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect x="8" y="18" width="304" height="164" rx="28" fill="url(#eventSky)" />
      <rect x="28" y="38" width="148" height="128" rx="18" fill="#ffffff" />
      <path d="M28 56a18 18 0 0 1 18-18h112a18 18 0 0 1 18 18v16H28V56z" fill="#1565C0" />
      <circle cx="56" cy="50" r="5" fill="#4FC3F7" />
      <circle cx="148" cy="50" r="5" fill="#4FC3F7" />
      {calendarDots()}
      <g className="events-float">
        <circle cx="232" cy="64" r="28" fill="#ffffff" />
        <path d="M224 52h16v5a8 8 0 0 1-16 0v-5zM224 55h-4a4 4 0 0 0 4 5M240 55h4a4 4 0 0 1-4 5M232 65v4M226 76h12" fill="none" stroke="#0D47A1" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </g>
      <g className="events-float late">
        <circle cx="268" cy="124" r="26" fill="#ffffff" />
        <path d="M256 118l12-8 12 8v4h-24v-4zM260 122h16v8h-16z" fill="none" stroke="#0D47A1" strokeWidth="1.8" strokeLinejoin="round" />
      </g>
      <g className="events-float later">
        <circle cx="196" cy="132" r="22" fill="#ffffff" />
        <circle cx="196" cy="126" r="4" fill="none" stroke="#0D47A1" strokeWidth="1.7" />
        <path d="M188 140c1-4 3.4-6 8-6s7 2 8 6" fill="none" stroke="#1565C0" strokeWidth="1.7" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function EventCard({ event, showSchool = true, onOpen }) {
  const look = eventLook(event.category);
  const when = event.startsAt ? new Date(event.startsAt) : null;
  const day = when ? when.toLocaleDateString("en-GB", { day: "2-digit" }) : "—";
  const month = when ? when.toLocaleDateString("en-GB", { month: "short" }) : "";
  const year = when ? String(when.getFullYear()) : "";
  const clock = when
    ? when.toLocaleString("en-GB", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Date to be set";
  return (
    <article className="event-card" onClick={onOpen} style={{ cursor: onOpen ? "pointer" : "default" }}>
      <div className="event-art">
        <span className="event-mark"><Icon name={look.icon} /></span>
        <time dateTime={event.startsAt || undefined}>
          <strong>{day}</strong>
          <span>{month}</span>
          <em>{year}</em>
        </time>
      </div>
      <div className="event-copy">
        <p className="kicker"><Icon name={look.icon} />{t(look.label)}</p>
        <h2>{event.title}</h2>
        <ul className="event-facts">
          {showSchool && event.school?.name ? <li><Icon name="school" />{event.school.name}</li> : null}
          <li><Icon name="clock" />{clock}</li>
          {event.venue ? <li><Icon name="pin" />{event.venue}</li> : null}
        </ul>
        {event.description ? <p>{event.description}</p> : null}
      </div>
    </article>
  );
}

function Events() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    api("/public/events").then((data) => setItems(data.items || [])).catch((err) => setError(err.message)).finally(() => setLoaded(true));
  }, []);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t("School events")}</h1>
          <p className="lede">{t("Meetings, sports, debates, visiting days, graduations and scholarships.")}</p>
        </div>
        <EventsGraphic />
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {!loaded && !error ? (
        <div className="event-board" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <article className="event-card" key={item}>
              <div className="event-art"><i className="skel skel-stage" /></div>
              <div className="event-copy"><i className="skel short" /><i className="skel" /><i className="skel" /></div>
            </article>
          ))}
        </div>
      ) : null}
      <div className="event-board">
        {items.map((event) => (
          <EventCard
            key={event._id}
            event={event}
            onOpen={event.school ? () => go(`#/school/${event.school.slug || event.school._id}`) : undefined}
          />
        ))}
      </div>
      {loaded && items.length === 0 && !error ? <p className="muted">{t("No public events")}</p> : null}
    </div>
  );
}

function Rankings() {
  const [type, setType] = useState("secondary");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    setLoaded(false);
    api(`/public/rankings?type=${type}`).then((data) => setItems(data.items || [])).catch((err) => setError(err.message)).finally(() => setLoaded(true));
  }, [type]);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t("National rankings")}</h1>
          <p className="lede">{t("Performance snapshots published by each approved school, with national rank.")}</p>
        </div>
        <div className="chips">
          {["primary", "secondary", "tvet", "university"].map((item) => (
            <button key={item} className={type === item ? "on" : ""} onClick={() => setType(item)}>{item}</button>
          ))}
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {!loaded && !error ? <div className="skel-rows" aria-hidden="true">{[0, 1, 2, 3, 4].map((item) => <i className="skel" key={item} />)}</div> : null}
      {loaded && items.length === 0 && !error ? <p className="muted">{t("No ranked schools in this category")}</p> : null}
      {items.length > 0 ? (
        <table className="board rank-list">
          <thead>
            <tr><th>{t("Place")}</th><th>{t("School")}</th><th>{t("District")}</th><th>{t("Type")}</th></tr>
          </thead>
          <tbody>
            {items.map((school) => (
              <tr key={school._id} onClick={() => go(`#/school/${school.slug || school._id}`)}>
                <td className="place">{school.nationalRank}</td>
                <td><strong>{school.name}</strong></td>
                <td>{school.location?.district || "—"} · {school.performanceSummary || t("Performance profile available")}</td>
                <td>{t(school.type)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

const SITE_TABS = ["Home", "About", "Staff", "Events", "Gallery", "Contact"];
const SITE_ICON = { Home: "home", About: "info", Staff: "people", Events: "calendar", Gallery: "image", Contact: "phone" };

function CampusHeading({ icon, children }) {
  return <h2 className="campus-heading"><Icon name={icon} />{children}</h2>;
}

function textBlocks(value) {
  return String(value || "").split(/\n+/).map((part) => part.trim()).filter(Boolean);
}

function CampusPhoto({ item, name, onOpen }) {
  return (
    <button type="button" className="gallery-open" onClick={onOpen}>
      <figure>
        <SoftImage alt={item.caption || name} src={item.imageUrl} />
        {item.caption || item.album ? (
          <figcaption>
            {item.album ? <em>{item.album}</em> : null}
            {item.caption ? <span>{item.caption}</span> : null}
          </figcaption>
        ) : null}
      </figure>
    </button>
  );
}

function GalleryStage({ photos, start, schoolName, onClose }) {
  const [index, setIndex] = useState(start);
  const [failed, setFailed] = useState(false);
  const photo = photos[index];
  const several = photos.length > 1;

  useEffect(() => { setFailed(false); }, [photo?._id]);
  useEffect(() => {
    function onKey(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowRight" && several) setIndex((current) => (current + 1) % photos.length);
      if (event.key === "ArrowLeft" && several) setIndex((current) => (current - 1 + photos.length) % photos.length);
    }
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, photos.length, several]);

  function step(event, direction) {
    event.stopPropagation();
    setIndex((current) => (current + direction + photos.length) % photos.length);
  }

  const added = photo?.createdAt
    ? new Date(photo.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
    : "";

  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={photo?.caption || schoolName} onClick={onClose}>
      <button className="lightbox-close" type="button" onClick={onClose}>
        <Icon name="close" />
        Close
      </button>
      <button className="lightbox-step prev" type="button" onClick={(event) => step(event, -1)} disabled={!several}>
        <Icon name="left" />
        Previous
      </button>
      <figure className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
        {failed || !photo?.imageUrl ? (
          <div className="photo-fallback" role="img" aria-label={photo?.caption || schoolName} />
        ) : (
          <img alt={photo.caption || schoolName} src={photo.imageUrl} onError={() => setFailed(true)} />
        )}
        <figcaption className="lightbox-copy">
          <p className="kicker">{photo?.album || "Campus"} · {index + 1} of {photos.length}</p>
          <h2>{photo?.caption || schoolName}</h2>
          <p>{schoolName}{added ? ` · Added ${added}` : ""}</p>
        </figcaption>
      </figure>
      <button className="lightbox-step next" type="button" onClick={(event) => step(event, 1)} disabled={!several}>
        Next
        <Icon name="right" />
      </button>
    </div>,
    document.body
  );
}

function SchoolPage({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Home");
  const [logoFailed, setLogoFailed] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(null);
  useEffect(() => {
    setTab("Home");
    setLogoFailed(false);
    setOpenPhoto(null);
    api(`/public/schools/${id}`).then(setData).catch((err) => setError(err.message));
  }, [id]);
  useEffect(() => {
    if (!data?.school?.name) return;
    const about = (data.school.motto || data.school.about || "").replace(/\s+/g, " ").trim();
    document.title = `${data.school.name} — IshuriApp`;
    const description = document.querySelector('meta[name="description"]');
    if (description) {
      const line = about ? `${data.school.name}. ${about}` : `${data.school.name} on IshuriApp, Rwanda’s school atlas.`;
      description.setAttribute("content", line.slice(0, 160));
    }
  }, [data]);
  if (error) return <div className="page"><p className="banner">{error}</p></div>;
  if (!data) {
    return (
      <article className="campus" aria-hidden="true">
        <header className="campus-hero skel" />
        <div className="campus-sheet">
          <div className="skel-copy">
            <i className="skel short" />
            <i className="skel" />
            <i className="skel" />
          </div>
        </div>
      </article>
    );
  }
  const school = data.school;
  const place = [school.location?.sector, school.location?.district, school.location?.province].filter(Boolean).join(", ");
  const nextEvent = data.events?.[0];
  return (
    <article className="campus">
      <header className="campus-hero">
        {school.coverUrl ? <SoftImage src={school.coverUrl} alt="" /> : null}
      </header>
      <div className="campus-sheet">
        <div className="campus-identity">
          <div className="campus-mark">
            {school.logoUrl && !logoFailed ? <SoftImage src={school.logoUrl} alt="" onError={() => setLogoFailed(true)} /> : <span>{(school.name || "I").slice(0, 1)}</span>}
          </div>
          <div className="campus-title">
            <p className="kicker"><Icon name="shield" />{school.verified ? t("Admin verified") : t("Unverified")} · {t(school.type)}</p>
            <h1>{school.name}</h1>
            <p className="motto">{school.motto || school.tagline}</p>
            <p className="place-line">
              <Icon name="pin" />
              {place}
              {school.nationalRank ? <span className="rank-flag"><Icon name="award" />National rank #{school.nationalRank}</span> : null}
            </p>
          </div>
          <section className="campus-stats" aria-label={t("School figures")}>
            <article><span className="stat-ico"><Icon name="graduate" /></span><strong>{school.studentCount || "—"}</strong><span>{t("Students")}</span></article>
            <article><span className="stat-ico"><Icon name="people" /></span><strong>{school.teacherCount || "—"}</strong><span>{t("Teachers")}</span></article>
            <article><span className="stat-ico"><Icon name="calendar" /></span><strong>{school.establishedYear || "—"}</strong><span>{t("Founded")}</span></article>
          </section>
        </div>
        <nav className="campus-nav" aria-label={t("School website")}>
        {SITE_TABS.map((item) => (
          <button key={item} type="button" className={tab === item ? "on" : ""} onClick={() => setTab(item)}>
            <Icon name={SITE_ICON[item]} />
            {t(item)}
          </button>
        ))}
        </nav>
      </div>
      <div className="campus-body">
        {tab === "Home" ? (
          <div className="welcome-grid">
            {textBlocks(school.about).length ? (
              <section className="welcome-card welcome-lead">
                <span className="welcome-mark"><Icon name="school" /></span>
                <div className="welcome-copy">
                  <p className="kicker"><Icon name="home" />{t("Home")}</p>
                  <h2>{t("Welcome")}</h2>
                  {textBlocks(school.about).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ) : null}
            {school.tagline && school.tagline !== school.motto ? (
              <section className="welcome-card">
                <span className="welcome-mark"><Icon name="info" /></span>
                <div className="welcome-copy">
                  <p className="kicker">{t("In short")}</p>
                  <p>{school.tagline}</p>
                </div>
              </section>
            ) : null}
            {school.performanceSummary ? (
              <section className="welcome-card">
                <span className="welcome-mark"><Icon name="chart" /></span>
                <div className="welcome-copy">
                  <p className="kicker"><Icon name="chart" />{t("Performance")}</p>
                  {textBlocks(school.performanceSummary).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                </div>
              </section>
            ) : null}
            {nextEvent ? (
              <section className="welcome-card">
                <span className="welcome-mark"><Icon name="calendar" /></span>
                <div className="welcome-copy">
                  <p className="kicker"><Icon name="calendar" />{t("Next event")}</p>
                  <h2>{nextEvent.title}</h2>
                  <p className="muted">{new Date(nextEvent.startsAt).toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}{nextEvent.venue ? ` · ${nextEvent.venue}` : ""}</p>
                </div>
              </section>
            ) : null}
          </div>
        ) : null}
        {tab === "About" ? (
          <div className="campus-about">
            {school.history ? <section className="campus-card"><CampusHeading icon="landmark">{t("History")}</CampusHeading><p>{school.history}</p></section> : null}
            {school.vision ? <section className="campus-card"><CampusHeading icon="eye">{t("Vision")}</CampusHeading><p>{school.vision}</p></section> : null}
            {school.mission ? <section className="campus-card"><CampusHeading icon="target">{t("Mission")}</CampusHeading><p>{school.mission}</p></section> : null}
            {school.programs?.length ? (
              <section className="campus-card">
                <CampusHeading icon="book">{t("Programs")}</CampusHeading>
                <div className="campus-pills">{school.programs.map((item) => <span key={item}>{item}</span>)}</div>
              </section>
            ) : null}
            {school.facilities?.length ? (
              <section className="campus-card">
                <CampusHeading icon="building">{t("Facilities")}</CampusHeading>
                <div className="campus-pills">{school.facilities.map((item) => <span key={item}>{item}</span>)}</div>
              </section>
            ) : null}
            {(school.examResults || []).length ? (
              <section className="campus-card campus-results">
                <CampusHeading icon="award">{t("Exam results")}</CampusHeading>
                {(school.examResults || []).map((result) => (
                  <p key={`${result.year}-${result.exam}`}>
                    <strong>{result.year} {result.exam}</strong>
                    <span>{result.passRate}% pass{result.distinctionRate ? `, ${result.distinctionRate}% distinction` : ""} {result.notes || ""}</span>
                  </p>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
        {tab === "Staff" ? (
          (data.staff || []).length === 0 ? <p className="muted campus-empty">{t("No public staff yet")}</p> : (
            <div className="campus-people">
              {data.staff.map((member) => {
                const managed = member.managedClasses || [];
                const saved = (member.classes || []).filter((room) => !managed.some((item) => item.name === room.name && item.academicYear === room.academicYear));
                const classNames = [...managed, ...saved].map((room) => (room.academicYear ? `${room.name} (${room.academicYear})` : room.name)).filter(Boolean);
                const subjectNames = (member.subjects || []).map((subject) => subject.name).filter(Boolean);
                const teaching = (member.teaching || []).map((row) => `${row.subject} · ${row.className}`);
                const category = t({ teacher: "Teacher", discipline: "Discipline officer", leadership: "Leadership", support: "Support", admin: "Director" }[member.category] || member.category || "Staff");
                return (
                  <article key={member._id} className="campus-card person">
                    <div className="person-id">
                      <span className="person-photo" aria-hidden="true"><Icon name="person" /></span>
                      <div>
                        <p className="person-role">{category}</p>
                        <h2>{member.fullName}</h2>
                        <p className="muted">{member.roleTitle || category}</p>
                      </div>
                    </div>
                    <dl className="person-facts">
                      <div><dt>{t("Role title")}</dt><dd>{member.roleTitle || t("Not given")}</dd></div>
                      <div><dt>{t("Category")}</dt><dd>{category}</dd></div>
                      <div className="wide"><dt>{t("Qualifications")}</dt><dd>{member.qualifications || t("Not given")}</dd></div>
                      {member.department ? <div className="wide"><dt>{t("Department")}</dt><dd>{member.department}</dd></div> : null}
                      {member.bio ? <div className="wide"><dt>{t("About")}</dt><dd>{member.bio}</dd></div> : null}
                      <div className="wide"><dt>{t("Email")}</dt><dd>{member.email || t("Not given")}</dd></div>
                      <div><dt>{t("Phone / WhatsApp")}</dt><dd>{member.phone || member.whatsapp || t("Not given")}</dd></div>
                      {member.whatsapp && member.whatsapp !== member.phone ? <div><dt>{t("WhatsApp")}</dt><dd>{member.whatsapp}</dd></div> : null}
                      <div><dt>{t("Class")}</dt><dd>{classNames.length ? classNames.join(", ") : t("No class yet")}</dd></div>
                      <div className="wide"><dt>{t("Subjects")}</dt><dd>{subjectNames.length ? subjectNames.join(", ") : t("None selected")}</dd></div>
                      {teaching.length ? <div className="wide"><dt>{t("Teaching")}</dt><dd>{teaching.join("; ")}</dd></div> : null}
                    </dl>
                    <div className="person-links">
                      {member.phone ? <a href={`tel:${member.phone}`}><Icon name="phone" />{t("Call")}</a> : null}
                      {member.whatsapp ? <a href={`https://wa.me/${String(member.whatsapp).replace(/\D/g, "")}`}><Icon name="chat" />{t("WhatsApp")}</a> : null}
                      {member.email ? <a href={`mailto:${member.email}`}><Icon name="mail" />{t("Email")}</a> : null}
                      {member.socials?.facebook ? <a href={member.socials.facebook}><Icon name="link" />{t("Facebook")}</a> : null}
                      {member.socials?.linkedin ? <a href={member.socials.linkedin}><Icon name="link" />{t("LinkedIn")}</a> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          )
        ) : null}
        {tab === "Events" ? (
          (data.events || []).length === 0 ? <p className="muted campus-empty">{t("No events posted")}</p> : (
            <div className="event-board campus-events">
              {data.events.map((event) => (
                <EventCard key={event._id} event={event} showSchool={false} />
              ))}
            </div>
          )
        ) : null}
        {tab === "Gallery" ? (
          (data.gallery || []).length === 0 ? <p className="muted campus-empty">{t("No photos yet")}</p> : (
            <div className="campus-gallery">
              {data.gallery.map((item, index) => (
                <CampusPhoto key={item._id} item={item} name={school.name} onOpen={() => setOpenPhoto(index)} />
              ))}
            </div>
          )
        ) : null}
        {tab === "Contact" ? (
          <section className="campus-card contact-sheet">
            <div>
              <CampusHeading icon="pin">{t("Address")}</CampusHeading>
              <p>{school.location?.address || place}</p>
              {school.visitingHours ? <><CampusHeading icon="clock">{t("Visiting hours")}</CampusHeading><p>{school.visitingHours}</p></> : null}
            </div>
            <div className="contact-actions">
              {school.phone ? <a className="ghost" href={`tel:${school.phone}`}><Icon name="phone" />Call {school.phone}</a> : null}
              {school.whatsapp ? <a className="ghost" href={`https://wa.me/${String(school.whatsapp).replace(/\D/g, "")}`}><Icon name="chat" />{t("WhatsApp the school")}</a> : null}
              {school.email ? <a className="ghost" href={`mailto:${school.email}`}><Icon name="mail" />{school.email}</a> : null}
              {school.location?.latitude && school.location?.longitude ? <a className="solid" href={`https://www.google.com/maps?q=${school.location.latitude},${school.location.longitude}`} target="_blank" rel="noreferrer"><Icon name="map" />{t("Open map")}</a> : <button className="ghost" type="button" onClick={() => notify("Location", place)}><Icon name="pin" />{t("Location listed on profile")}</button>}
            </div>
          </section>
        ) : null}
      </div>
      {openPhoto != null && (data.gallery || []).length ? (
        <GalleryStage photos={data.gallery} start={openPhoto} schoolName={school.name} onClose={() => setOpenPhoto(null)} />
      ) : null}
    </article>
  );
}

function PhotoAvatar({ id, cx, cy, r, src }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 4} fill="#ffffff" />
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <image href={src} x={cx - r} y={cy - r} width={r * 2} height={r * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${id})`} />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#ffffff" strokeWidth="3" />
    </g>
  );
}

function GateSignals() {
  const marksPath = "M156 348 C118 300, 132 250, 168 214";
  const disciplinePath = "M244 348 C282 300, 268 250, 232 214";
  return (
    <svg className="gate-photo" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid meet" role="img" aria-label={t("Signals carry marks and a discipline notice from the teachers' computers to the parents' phones")}>
      <defs>
        <marker id="gateArrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 Z" fill="#0D47A1" />
        </marker>
        <marker id="gateArrowSky" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
          <path d="M0 0 L10 5 L0 10 Z" fill="#0277BD" />
        </marker>
      </defs>
      <rect width="400" height="520" fill="#e7f4fc" />
      <rect x="16" y="48" width="368" height="196" rx="32" fill="#ffffff" />
      <text x="96" y="78" textAnchor="middle" fill="#0D47A1" fontSize="12" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Parent")}</text>
      <text x="304" y="78" textAnchor="middle" fill="#0D47A1" fontSize="12" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Parent")}</text>
      <PhotoAvatar id="mom" cx={96} cy={138} r={40} src="/avatar-mother.jpg?v=1" />
      <PhotoAvatar id="dad" cx={304} cy={138} r={40} src="/avatar-father.jpg?v=1" />
      <rect x="146" y="108" width="52" height="72" rx="8" fill="#0D47A1" />
      <rect x="150" y="114" width="44" height="58" rx="4" fill="#ffffff" />
      <text x="172" y="140" textAnchor="middle" fill="#0D47A1" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94/100</text>
      <text x="172" y="156" textAnchor="middle" fill="#1565C0" fontSize="9" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Marks")}</text>
      <g className="gate-wave">
        <path d="M202 128 q8 -7 0 -14" fill="none" stroke="#0D47A1" strokeWidth="2" strokeLinecap="round" />
        <path d="M210 132 q14 -11 0 -22" fill="none" stroke="#4FC3F7" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="202" y="108" width="52" height="72" rx="8" fill="#0277BD" />
      <rect x="206" y="114" width="44" height="58" rx="4" fill="#ffffff" />
      <text x="228" y="140" textAnchor="middle" fill="#0277BD" fontSize="9" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("Discipline")}</text>
      <text x="228" y="156" textAnchor="middle" fill="#1565C0" fontSize="9" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      <g className="gate-wave late">
        <path d="M198 128 q-8 -7 0 -14" fill="none" stroke="#0277BD" strokeWidth="2" strokeLinecap="round" />
        <path d="M190 132 q-14 -11 0 -22" fill="none" stroke="#4FC3F7" strokeWidth="2" strokeLinecap="round" />
      </g>
      <rect x="36" y="430" width="140" height="14" rx="6" fill="#d7c4a3" />
      <rect x="224" y="430" width="140" height="14" rx="6" fill="#d7c4a3" />
      <rect x="112" y="352" width="88" height="72" rx="10" fill="#0D47A1" />
      <rect x="120" y="360" width="72" height="48" rx="6" fill="#ffffff" />
      <text x="156" y="380" textAnchor="middle" fill="#0D47A1" fontSize="13" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94/100</text>
      <text x="156" y="396" textAnchor="middle" fill="#1565C0" fontSize="9" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Marks")}</text>
      <rect x="136" y="412" width="40" height="7" rx="2" fill="#90CAF9" />
      <rect x="200" y="352" width="88" height="72" rx="10" fill="#0277BD" />
      <rect x="208" y="360" width="72" height="48" rx="6" fill="#ffffff" />
      <text x="244" y="388" textAnchor="middle" fill="#0277BD" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">{t("Discipline")}</text>
      <rect x="224" y="412" width="40" height="7" rx="2" fill="#90CAF9" />
      <PhotoAvatar id="teacher" cx={64} cy={392} r={42} src="/avatar-teacher.jpg?v=1" />
      <PhotoAvatar id="officer" cx={336} cy={392} r={42} src="/avatar-officer.jpg?v=1" />
      <text x="64" y="470" textAnchor="middle" fill="#0D47A1" fontSize="12" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Teacher")}</text>
      <text x="318" y="470" textAnchor="middle" fill="#0277BD" fontSize="11" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Discipline officer")}</text>
      <path d={marksPath} fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
      <path className="gate-signal" d={marksPath} fill="none" stroke="#0D47A1" strokeWidth="3.5" strokeLinecap="round" markerEnd="url(#gateArrow)" />
      <circle r="7" fill="#0D47A1" stroke="#ffffff" strokeWidth="2">
        <animateMotion dur="2.2s" repeatCount="indefinite" path={marksPath} />
      </circle>
      <path d={disciplinePath} fill="none" stroke="#ffffff" strokeWidth="10" strokeLinecap="round" />
      <path className="gate-signal late" d={disciplinePath} fill="none" stroke="#0277BD" strokeWidth="3.5" strokeLinecap="round" markerEnd="url(#gateArrowSky)" />
      <circle r="7" fill="#0277BD" stroke="#ffffff" strokeWidth="2">
        <animateMotion dur="2.2s" begin="0.6s" repeatCount="indefinite" path={disciplinePath} />
      </circle>
    </svg>
  );
}

function Gate({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    try {
      const data = await api("/auth/login", { method: "POST", body: { email, password } });
      onSignIn({ token: data.token, user: data.user, school: data.school });
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <section className="gate">
      <div className="gate-brand">
        <GateSignals />
      </div>
      <form onSubmit={submit}>
        <div className="gate-copy">
          <h1>{t("School team sign in")}</h1>
          <p className="lede">{t("Students and parents browse freely. This login is for directors, teachers and IshuriApp staff.")}</p>
        </div>
        <label className="field">Email
          <span className="gate-input">
            <Icon name="mail" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder={t("you@school.rw")} />
          </span>
        </label>
        <label className="field">Password
          <span className="secret-field gate-input">
            <Icon name="lock" />
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={t("Your password")} />
            <button className="secret-toggle" type="button" aria-pressed={showPassword} aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>{showPassword ? "Hide" : "Show"}</button>
          </span>
        </label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="solid" type="submit">{t("Sign in")}</button>
      </form>
    </section>
  );
}

