import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { api } from "./api.js";
import { notify, subscribeNotice } from "./notice.js";
import { Workspace } from "./workspace.jsx";
import { Icon, NAV_ICON } from "./icons.jsx";
import { LANGS, getLang, setLanguage, t, useLanguage } from "./i18n.js";

const SITE_ORIGIN = "https://www.ishuriapp.com";
const SITE_LOGO = `${SITE_ORIGIN}/logo-512.png`;
const SITE_NOTE = "Visit https://www.ishuriapp.com/. Developed by Emmanuel HABUMUGISHA, The CEO & Founder of EMMYLEX Ltd.";
const SESSION_KEY = "ishuri.pwa.session";

function setMeta(attr, key, content) {
  let node = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!node) {
    node = document.createElement("meta");
    node.setAttribute(attr, key);
    document.head.appendChild(node);
  }
  node.setAttribute("content", content);
}

function showBrand(title, description, indexable) {
  const note = t(SITE_NOTE);
  const text = description ? `${note} ${description}` : note;
  document.title = title;
  setMeta("name", "description", text);
  setMeta("name", "author", "Emmanuel HABUMUGISHA, CEO & Founder of EMMYLEX Ltd");
  setMeta("name", "robots", indexable ? "index, follow, max-image-preview:large" : "noindex, nofollow");
  setMeta("property", "og:title", title);
  setMeta("property", "og:description", text);
  setMeta("property", "og:url", `${SITE_ORIGIN}/`);
  setMeta("property", "og:image", SITE_LOGO);
  setMeta("property", "og:image:alt", "IshuriApp");
  setMeta("name", "twitter:title", title);
  setMeta("name", "twitter:description", text);
  setMeta("name", "twitter:image", SITE_LOGO);
  setMeta("name", "twitter:image:alt", "IshuriApp");
}
const VISITOR_KEY = "ishuri.visitor";

function visitorId() {
  try {
    const current = localStorage.getItem(VISITOR_KEY);
    if (current && /^[a-zA-Z0-9-]{16,64}$/.test(current)) return current;
    const next = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, next);
    return next;
  } catch {
    return "ishuri-visitor-local";
  }
}

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

function scrollToId(id) {
  const node = document.getElementById(id);
  if (!node) return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  node.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
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
    if (route.name !== "school") {
      const description = t("IshuriApp is Rwanda’s school atlas. Search approved schools, open a school website, and compare national rankings, events and notices. Students and parents browse freely.");
      showBrand(titles[route.name] || titles.home, description, route.name !== "desk" && route.name !== "gate");
    }
  }, [route.name, lang]);

  if (!ready) return null;

  const workspace = route.name === "gate" || route.name === "desk";

  return (
    <div className="app">
      <a className="skip" href="#content">{t("Skip to content")}</a>
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
            <button key={item.id} className={route.name === item.id ? "active" : ""} aria-current={route.name === item.id ? "page" : undefined} onClick={() => go(item.path)}>
              <Icon name={NAV_ICON[item.id]} />
              {t(item.label)}
            </button>
          ))}
        </nav>
        <label className="lang-switch">
          <span className="lang-word">{t("Language")}</span>
          <span className="lang-mark" aria-hidden="true"><Icon name="globe" /></span>
          <select value={lang} aria-label={t("Language")} onChange={(event) => setLanguage(event.target.value)}>
            {LANGS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        </label>
        <button className={`workspace-link${workspace ? " active" : ""}`} onClick={() => go(session ? "#/desk" : "#/gate")}>
          <Icon name={session ? "briefcase" : "key"} />
          <span>{session ? t("Workspace") : t("Staff sign in")}</span>
        </button>
      </header>
      <main id="content" key={hash} className="stage">
        {route.name === "home" && <Home />}
        {route.name === "events" && <Events />}
        {route.name === "rankings" && <Rankings />}
        {route.name === "now" && <Now />}
        {route.name === "school" && <SchoolPage id={route.id} />}
        {route.name === "gate" && <Gate onSignIn={signIn} />}
        {route.name === "desk" && <Workspace session={session} section={route.section} onSignOut={signOut} onSession={setSession} />}
      </main>
      {workspace ? (
        <footer className="site-foot">
          <span>{t("IshuriApp · Rwanda’s school atlas")}</span>
          <span>{t("Students and parents browse freely. Staff sign in for the desk.")}</span>
          <p className="foot-credit">
            <a href="https://www.ishuriapp.com/">{t("Visit")} https://www.ishuriapp.com/</a>
            <span>{t("Developed by Emmanuel HABUMUGISHA, The CEO & Founder of EMMYLEX Ltd.")}</span>
          </p>
        </footer>
      ) : (
        <footer className="site-foot atlas-foot">
          <div className="foot-brand">
            <img src="/logo-512.png" alt="" width="44" height="44" />
            <div>
              <strong>IshuriApp</strong>
              <p>{t("IshuriApp lists every approved school and carries marks and discipline from the classroom to a parent phone.")}</p>
            </div>
          </div>
          <nav aria-label={t("Explore")}>
            <p className="kicker">{t("Explore")}</p>
            {NAV.map((item) => (
              <button key={item.id} type="button" onClick={() => go(item.path)}>
                <Icon name={NAV_ICON[item.id]} />
                {t(item.label)}
              </button>
            ))}
          </nav>
          <div>
            <p className="kicker">{t("For families")}</p>
            <p>{t("Students and parents browse freely. Staff sign in for the desk.")}</p>
            <button type="button" className="ghost" onClick={() => go(session ? "#/desk" : "#/gate")}>
              <Icon name={session ? "briefcase" : "key"} />
              {session ? t("Workspace") : t("For school staff")}
            </button>
          </div>
          <p className="foot-end">{t("IshuriApp · Rwanda’s school atlas")}</p>
          <p className="foot-credit">
            <a href="https://www.ishuriapp.com/">{t("Visit")} https://www.ishuriapp.com/</a>
            <span>{t("Developed by Emmanuel HABUMUGISHA, The CEO & Founder of EMMYLEX Ltd.")}</span>
          </p>
        </footer>
      )}
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

function uniquePlaces(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
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
  if (!school.logoUrl || failed) return <Icon name="school" />;
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

const CAST = [
  { src: "/avatar-father.jpg?v=1", title: "Director" },
  { src: "/avatar-teacher.jpg?v=1", title: "Teachers" },
  { src: "/avatar-officer.jpg?v=1", title: "Discipline officer" },
  { src: "/avatar-mother.jpg?v=1", title: "Parents and students" },
];

function FamilyGraphic() {
  return (
    <svg className="family-board" viewBox="0 0 360 240" role="img" aria-label={t("Parents and children discover schools on IshuriApp by phone.")}>
      <defs>
        <linearGradient id="familySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e3f2fd" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="352" height="232" rx="34" fill="url(#familySky)" />
      <ellipse cx="180" cy="214" rx="140" ry="12" fill="#d7e8f8" />
      <g className="family-signal" fill="none" stroke="#1565C0" strokeWidth="2.6" strokeLinecap="round">
        <path d="M154 22 a32 32 0 0 1 52 0" />
        <path d="M166 34 a18 18 0 0 1 28 0" />
      </g>
      <circle className="family-dot" cx="180" cy="46" r="3.4" fill="#1565C0" />
      <g className="family-phone">
        <circle cx="62" cy="108" r="28" fill="#e0ac7a" />
        <path d="M38 100 C42 70 84 70 88 100 C78 84 48 84 38 100" fill="#3a2415" />
        <circle cx="52" cy="106" r="2.6" fill="#3a2415" />
        <circle cx="72" cy="106" r="2.6" fill="#3a2415" />
        <path d="M50 118 Q62 128 74 118" fill="none" stroke="#a86b45" strokeWidth="2.4" strokeLinecap="round" />
        <rect x="40" y="136" width="46" height="48" rx="16" fill="#1565C0" />
        <path d="M84 150 Q104 142 112 124" fill="none" stroke="#e0ac7a" strokeWidth="9" strokeLinecap="round" />
        <rect x="104" y="58" width="78" height="118" rx="14" fill="#0D47A1" />
        <rect x="111" y="70" width="64" height="92" rx="8" fill="#f7fbff" />
        <text x="143" y="88" textAnchor="middle" fill="#0D47A1" fontSize="11" fontWeight="800" fontFamily="Instrument Sans, sans-serif">IshuriApp</text>
        <rect x="120" y="98" width="46" height="16" rx="8" fill="#e3f2fd" />
        <circle cx="128" cy="106" r="3.2" fill="none" stroke="#0D47A1" strokeWidth="1.6" />
        <path d="M130.4 108.4 l3.2 3.2" stroke="#0D47A1" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M122 126 h18 v16 h-18 z" fill="#1565C0" />
        <path d="M126 126 v-6 h6 l5 6" fill="#4FC3F7" />
        <path d="M144 130 h24 M144 138 h24 M144 146 h16" stroke="#9bb4c9" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      <g className="family-phone late">
        <circle cx="268" cy="124" r="22" fill="#d7a574" />
        <path d="M250 118 C254 96 284 96 288 118 C280 106 258 106 250 118" fill="#3a2415" />
        <circle cx="260" cy="122" r="2.2" fill="#3a2415" />
        <circle cx="276" cy="122" r="2.2" fill="#3a2415" />
        <path d="M258 132 Q268 140 278 132" fill="none" stroke="#a86b45" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="252" y="146" width="34" height="36" rx="12" fill="#4FC3F7" />
        <path d="M286 156 Q300 148 306 136" fill="none" stroke="#d7a574" strokeWidth="8" strokeLinecap="round" />
        <rect x="300" y="86" width="46" height="84" rx="12" fill="#0D47A1" />
        <rect x="305" y="96" width="36" height="64" rx="6" fill="#f7fbff" />
        <rect x="310" y="106" width="26" height="10" rx="5" fill="#e3f2fd" />
        <circle cx="315" cy="111" r="2.2" fill="none" stroke="#0D47A1" strokeWidth="1.3" />
        <path d="M312 126 h14 v12 h-14 z" fill="#1565C0" />
        <path d="M315 126 v-4 h5 l4 4" fill="#4FC3F7" />
        <path d="M312 144 h22 M312 150 h16" stroke="#9bb4c9" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function StepScene({ scene }) {
  if (scene === "profile") {
    return (
      <svg className="step-scene" viewBox="0 0 220 120" aria-hidden="true">
        <rect width="220" height="120" rx="16" fill="#f4f8fc" />
        <rect x="16" y="18" width="86" height="84" rx="10" fill="#ffffff" stroke="#d5dee8" />
        <path d="M28 36 h62 M28 50 h62 M28 64 h40" stroke="#c5d4e4" strokeWidth="4" strokeLinecap="round" />
        <path d="M118 60 H156" stroke="#0d47a1" strokeWidth="2" />
        <path d="M148 54 l10 6 -10 6" fill="none" stroke="#0d47a1" strokeWidth="2" strokeLinejoin="round" />
        <path d="M168 34 L190 34 L208 52 V96 H168 Z" fill="#ffffff" stroke="#0d47a1" />
        <path d="M190 34 V52 H208" fill="#e3f2fd" stroke="#0d47a1" />
      </svg>
    );
  }
  if (scene === "review") {
    return (
      <svg className="step-scene" viewBox="0 0 220 120" aria-hidden="true">
        <rect width="220" height="120" rx="16" fill="#f4f8fc" />
        <rect x="18" y="28" width="64" height="64" rx="10" fill="#ffffff" stroke="#d5dee8" />
        <path d="M30 48 h40 M30 62 h40 M30 76 h24" stroke="#c5d4e4" strokeWidth="4" strokeLinecap="round" />
        <path d="M96 60 H128" stroke="#0d47a1" strokeWidth="2" />
        <path d="M120 54 l10 6 -10 6" fill="none" stroke="#0d47a1" strokeWidth="2" />
        <circle cx="164" cy="60" r="26" fill="#0d47a1" />
        <path d="M152 60 l8 8 16-18" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (scene === "marks") {
    return (
      <svg className="step-scene" viewBox="0 0 220 120" aria-hidden="true">
        <rect width="220" height="120" rx="16" fill="#f4f8fc" />
        <rect x="16" y="22" width="78" height="76" rx="10" fill="#ffffff" stroke="#d5dee8" />
        <text x="55" y="52" textAnchor="middle" fill="#5c7690" fontSize="11" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("MARKS")}</text>
        <text x="55" y="76" textAnchor="middle" fill="#0d47a1" fontSize="16" fontWeight="800" fontFamily="Instrument Sans, sans-serif">94/100</text>
        <path d="M106 60 H140" stroke="#0d47a1" strokeWidth="2" />
        <path d="M132 54 l10 6 -10 6" fill="none" stroke="#0d47a1" strokeWidth="2" />
        <rect x="150" y="24" width="52" height="76" rx="10" fill="#0d47a1" />
        <rect x="156" y="32" width="40" height="52" rx="6" fill="#f7fbff" />
        <text x="176" y="54" textAnchor="middle" fill="#0d47a1" fontSize="10" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
        <text x="176" y="70" textAnchor="middle" fill="#1565C0" fontSize="9" fontFamily="Instrument Sans, sans-serif">94/100</text>
      </svg>
    );
  }
  if (scene === "conduct") {
    return (
      <svg className="step-scene" viewBox="0 0 220 120" aria-hidden="true">
        <rect width="220" height="120" rx="16" fill="#f4f8fc" />
        <rect x="16" y="22" width="78" height="76" rx="10" fill="#ffffff" stroke="#d5dee8" />
        <circle cx="40" cy="48" r="10" fill="#e3f2fd" />
        <path d="M35 48 l3 3 7-8" fill="none" stroke="#0d47a1" strokeWidth="2" strokeLinecap="round" />
        <text x="64" y="52" fill="#0d47a1" fontSize="11" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Discipline")}</text>
        <path d="M28 70 h52 M28 82 h36" stroke="#c5d4e4" strokeWidth="4" strokeLinecap="round" />
        <path d="M106 60 H140" stroke="#0d47a1" strokeWidth="2" />
        <path d="M132 54 l10 6 -10 6" fill="none" stroke="#0d47a1" strokeWidth="2" />
        <rect x="150" y="24" width="52" height="76" rx="10" fill="#0d47a1" />
        <rect x="156" y="32" width="40" height="52" rx="6" fill="#f7fbff" />
        <text x="176" y="62" textAnchor="middle" fill="#0d47a1" fontSize="11" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      </svg>
    );
  }
  return (
    <svg className="step-scene" viewBox="0 0 220 120" aria-hidden="true">
      <rect width="220" height="120" rx="16" fill="#f4f8fc" />
      <rect x="28" y="16" width="164" height="88" rx="12" fill="#ffffff" stroke="#d5dee8" />
      <text x="44" y="42" fill="#0d47a1" fontSize="13" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Staff")}</text>
      <text x="44" y="66" fill="#0d47a1" fontSize="13" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Events")}</text>
      <text x="44" y="90" fill="#0d47a1" fontSize="13" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("Gallery")}</text>
    </svg>
  );
}

function HeroCast() {
  return (
    <div className="hero-cast" aria-label={t("Who it supports")}>
      {CAST.map((person, index) => (
        <div className="cast-link" key={person.title}>
          {index ? <span className="cast-line" aria-hidden="true" /> : null}
          <article>
            <SoftImage src={person.src} alt="" />
            <strong>{t(person.title)}</strong>
          </article>
        </div>
      ))}
    </div>
  );
}

const FAQ = [
  ["What is IshuriApp?", "IshuriApp lists every approved school and carries marks and discipline from the classroom to a parent phone."],
  ["Do students and parents need an account?", "Students and parents browse freely. Staff sign in for the desk."],
  ["Who can sign in?", "Directors, teachers, discipline officers and IshuriApp staff sign in. Students and parents do not."],
  ["How does a school become public?", "The director signs in and submits the school profile. IshuriApp reviews it. An approved school is listed on Discover, and its website opens. Until approval, the school is not public."],
  ["Can I register a school from this page?", "This page has no school registration. IshuriApp opens the director account. The director signs in and submits the school profile."],
  ["What does a school website show?", "The profile the director published: the place, the motto, the staff, the events and the gallery. Families open it with no account."],
  ["How do stars and likes work?", "Give 1 to 5 stars, or like the school. Each browser has one vote, and you can change it. The card shows the public average and the number of likes."],
  ["How does a parent receive marks?", "A teacher records assessments for a class and saves the marks. The parent phone receives the SMS."],
  ["How does a parent receive a discipline notice?", "A discipline officer records the case. The parent phone receives the SMS."],
  ["Which phone number receives the SMS?", "The one parent phone saved on the student. It is 12 digits beginning with 250, for example 250788000000."],
  ["Why is a school missing from Discover?", "Discover lists approved schools only. A school still in review, or one IshuriApp has deactivated, does not appear."],
  ["How do I search and move between pages?", "Search a school, a district or a motto. Filter by primary, secondary, TVET or university, then by province, district, sector and address. The numbers under the list open the next page."],
  ["What do Rankings, Events and Now show?", "Rankings show the performance snapshots each approved school publishes, with its national rank. Events are the public events a school publishes. Now shows programmes, trainings and notices that schools and partners choose to publish."],
  ["Which languages can I use?", "Choose Kinyarwanda, Kiswahili, French or English in the language menu. School names stay as the school wrote them. The name IshuriApp does not change."],
  ["Can I follow a school?", "Following schools is not available. Browse public school profiles without an account."],
  ["When does a staff member appear on the school website?", "A staff member appears on the school website after the director approves that person for the public page."],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="faq" id="faq">
      <header className="life-lead">
        <p className="kicker"><Icon name="info" />IshuriApp</p>
        <h2>{t("Questions")}</h2>
        <p>{t("Answers for families and for school staff.")}</p>
      </header>
      <div className="faq-list">
        {FAQ.map(([question, answer], index) => {
          const on = open === index;
          return (
            <article key={question} className={on ? "on" : ""}>
              <h3>
                <button type="button" aria-expanded={on} onClick={() => setOpen(on ? -1 : index)}>
                  <span>{t(question)}</span>
                  <Icon name="right" />
                </button>
              </h3>
              {on ? <p>{t(answer)}</p> : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DiscoverStory() {
  const people = [
    { src: "/avatar-mother.jpg?v=1", title: "Parents and students", body: "They browse schools, events and results without an account. Parents receive marks and discipline by SMS." },
    { src: "/avatar-teacher.jpg?v=1", title: "Teachers", body: "They record assessments for any class and the parent phone receives the mark." },
    { src: "/avatar-officer.jpg?v=1", title: "Discipline officer", body: "They record conduct and the parent phone receives the notice." },
    { src: "/avatar-father.jpg?v=1", title: "Director", body: "They publish the school website, staff, events and the messages parents receive." },
  ];
  const steps = [
    { role: "Director", src: "/avatar-father.jpg?v=1", scene: "profile", text: "The director submits the school profile.", detail: "The director signs in and submits the school profile: name, place, motto, staff, events and gallery. The school stays private until IshuriApp reviews it." },
    { role: "IshuriApp", src: "/logo-512.png", scene: "review", text: "IshuriApp reviews it and the school becomes public.", detail: "IshuriApp reviews the profile. An approved school is listed on Discover, and families can open its website." },
    { role: "Teachers", src: "/avatar-teacher.jpg?v=1", scene: "marks", text: "A teacher saves marks. The parent receives the SMS.", detail: "A teacher records assessments for a class and saves the marks. The parent phone receives the SMS." },
    { role: "Discipline officer", src: "/avatar-officer.jpg?v=1", scene: "conduct", text: "A discipline officer records a case. The parent receives the SMS.", detail: "A discipline officer records the case. The parent phone receives the SMS." },
    { role: "Parents and students", src: "/avatar-mother.jpg?v=1", scene: "site", text: "Families open the school website for staff, events and the gallery.", detail: "Parents and students open the school website with no account. They read the staff, the events and the gallery, and they can rate and like the school." },
  ];
  return (
    <section className="lifecycle" id="how">
      <header className="life-lead">
        <p className="kicker"><Icon name="school" />IshuriApp</p>
        <h2>{t("How it works")}</h2>
        <p>{t("IshuriApp lists every approved school and carries marks and discipline from the classroom to a parent phone.")}</p>
      </header>
      <div className="life-scenes">
        {[
          ["/scene-family.jpg", "Parents and students"],
          ["/scene-class.jpg", "Who it supports"],
          ["/scene-teacher.jpg", "Teachers"],
        ].map(([src, title]) => (
          <figure key={title}>
            <SoftImage src={src} alt="" />
            <figcaption>{t(title)}</figcaption>
          </figure>
        ))}
      </div>
      <ol className="life-chain">
        {steps.map((step, index) => (
          <li className="life-step" key={step.text}>
            <div className="life-who">
              <b>{String(index + 1).padStart(2, "0")}</b>
              <SoftImage src={step.src} alt="" />
            </div>
            <StepScene scene={step.scene} />
            <div className="life-copy">
              <strong>{t(step.role)}</strong>
              <p className="life-line">{t(step.text)}</p>
              <p>{t(step.detail)}</p>
            </div>
          </li>
        ))}
      </ol>
      <h2 className="life-kicker">{t("Who it supports")}</h2>
      <div className="story-people">
        {people.map((person) => (
          <article key={person.title}>
            <SoftImage src={person.src} alt="" />
            <div>
              <strong>{t(person.title)}</strong>
              <p>{t(person.body)}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function markMatch(text, needle) {
  const value = String(text || "");
  const query = needle.trim();
  const at = value.toLowerCase().indexOf(query.toLowerCase());
  if (!query || at < 0) return value;
  return (
    <>
      {value.slice(0, at)}
      <mark>{value.slice(at, at + query.length)}</mark>
      {value.slice(at + query.length)}
    </>
  );
}

function schoolPlace(school) {
  const location = school.location || {};
  return location.address || [location.sector, location.district, location.province].filter(Boolean).join(", ");
}

function SchoolRate({ school, onChange }) {
  const average = Number(school.ratingAverage) || 0;
  const count = Number(school.ratingCount) || 0;
  const likes = Number(school.likeCount) || 0;
  const mine = Number(school.myStars) || 0;
  return (
    <div className="school-rate">
      <div className="stars" role="group" aria-label={count ? t("{count} stars", { count: average }) : t("Rate")}>
        {[1, 2, 3, 4, 5].map((n) => {
          const portion = Math.max(0, Math.min(1, average - (n - 1)));
          return (
            <button key={n} type="button" className={mine === n ? "mine" : ""} aria-label={t("{count} stars", { count: n })} aria-pressed={mine === n} onClick={() => onChange({ stars: n })}>
              <span className="star-bg"><Icon name="star" /></span>
              <span className="star-fg" style={{ width: `${portion * 100}%` }}><Icon name="star" /></span>
            </button>
          );
        })}
      </div>
      <span className="rate-num">{count ? average.toFixed(1) : t("Rate")}</span>
      <button type="button" className={school.myLike ? "like-school on" : "like-school"} aria-pressed={Boolean(school.myLike)} aria-label={t("Like")} onClick={() => onChange({ liked: !school.myLike })}>
        <Icon name="heart" />
        <span>{likes}</span>
      </button>
    </div>
  );
}

function ResultPager({ page, pages, onPage }) {
  const size = 10;
  const start = Math.floor((page - 1) / size) * size + 1;
  const end = Math.min(pages, start + size - 1);
  const nums = [];
  for (let n = start; n <= end; n += 1) nums.push(n);
  return (
    <nav className="result-pages" aria-label={t("Page")}>
      {page > 1 ? <button type="button" className="step" onClick={() => onPage(page - 1)}><Icon name="left" />{t("Previous")}</button> : null}
      {nums.map((n) => (
        <button key={n} type="button" className={n === page ? "on" : ""} aria-current={n === page ? "page" : undefined} onClick={() => onPage(n)}>{n}</button>
      ))}
      {page < pages ? <button type="button" className="step" onClick={() => onPage(page + 1)}>{t("Next")}<Icon name="right" /></button> : null}
    </nav>
  );
}

function afterPaint(started, floor = 360) {
  const wait = floor - (performance.now() - started);
  if (wait <= 16) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, wait));
}

function Bone({ className = "" }) {
  return <i className={`skel ${className}`.trim()} />;
}

function HeroGlobe() {
  return (
    <svg className="hero-globe" viewBox="0 0 240 240" aria-hidden="true">
      <defs>
        <clipPath id="heroGlobeClip">
          <circle cx="120" cy="120" r="92" />
        </clipPath>
      </defs>
      <circle cx="120" cy="120" r="92" fill="#f3f8fc" stroke="#9ebbd4" strokeWidth="1.6" />
      <g clipPath="url(#heroGlobeClip)" fill="none" stroke="#9ebbd4" strokeWidth="1.15">
        <ellipse cx="120" cy="120" rx="92" ry="34" />
        <ellipse cx="120" cy="120" rx="92" ry="62" />
        <path d="M28 120h184" />
        <path d="M36 86h168" stroke="#b7cde0" />
        <path d="M36 154h168" stroke="#b7cde0" />
        <ellipse cx="120" cy="120" rx="34" ry="92" />
        <ellipse cx="120" cy="120" rx="62" ry="92" />
      </g>
    </svg>
  );
}

function HeroSkeleton() {
  return (
    <header className="page-head hero-stage" aria-hidden="true">
      <div className="hero-copy">
        <Bone className="short" />
        <Bone className="skel-title" />
        <Bone className="skel-title thin" />
        <Bone />
        <Bone className="short" />
        <div className="hero-actions">
          <Bone className="skel-btn" />
          <Bone className="skel-btn ghost" />
        </div>
        <div className="hero-cast">
          {[0, 1, 2, 3].map((item) => (
            <div className="cast-link" key={item}>
              <article>
                <Bone className="skel-avatar" />
                <Bone className="short" />
              </article>
            </div>
          ))}
        </div>
      </div>
      <div className="hero-art">
        <HeroGlobe />
        <Bone className="skel-board" />
        <Bone className="skel-board crest" />
      </div>
    </header>
  );
}

function SchoolSkeletons() {
  return (
    <div className="school-grid" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((item) => (
        <div className="school skel-card" key={item}>
          <div className="cover skel" />
          <div className="school-body">
            <span className="logo skel" />
            <span className="skel-copy"><Bone /><Bone className="short" /></span>
          </div>
          <div className="skel-facts">
            <Bone className="short" />
            <Bone />
            <span className="skel-pills"><Bone className="pill" /><Bone className="pill" /></span>
          </div>
        </div>
      ))}
    </div>
  );
}

function StorySkeleton() {
  return (
    <section className="lifecycle" aria-hidden="true">
      <header className="life-lead">
        <Bone className="short" />
        <Bone className="skel-title" />
        <Bone />
      </header>
      <div className="life-scenes" aria-hidden="true">
        {[0, 1, 2].map((item) => <Bone className="scene-skel" key={item} />)}
      </div>
      <div className="life-chain">
        {[0, 1, 2, 3, 4].map((item) => (
          <article className="life-step" key={item}>
            <div className="life-who"><Bone className="skel-avatar" /></div>
            <Bone className="step-skel" />
            <div className="life-copy"><Bone className="short" /><Bone /><Bone /></div>
          </article>
        ))}
      </div>
      <div className="story-people">
        {[0, 1, 2, 3].map((item) => (
          <article key={item}>
            <Bone className="skel-avatar" />
            <div className="skel-copy"><Bone className="short" /><Bone /><Bone /></div>
          </article>
        ))}
      </div>
    </section>
  );
}

function FaqSkeleton() {
  return (
    <section className="faq" aria-hidden="true">
      <header className="life-lead">
        <Bone className="short" />
        <Bone className="skel-title" />
        <Bone />
      </header>
      <div className="faq-list">
        {[0, 1, 2, 3, 4, 5].map((item) => <Bone className="faq-skel" key={item} />)}
      </div>
    </section>
  );
}

function Home() {
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [province, setProvince] = useState("");
  const [district, setDistrict] = useState("");
  const [sector, setSector] = useState("");
  const [address, setAddress] = useState("");
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [places, setPlaces] = useState([]);
  const [schools, setSchools] = useState([]);
  const [ads, setAds] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [suggestAt, setSuggestAt] = useState(0);
  const [query, setQuery] = useState("");
  const rating = useRef(new Set());
  const suggestRef = useRef(null);

  useEffect(() => {
    api("/public/districts").then((data) => setPlaces(data.items || [])).catch(() => setPlaces([]));
    api("/public/schools?limit=50").then((data) => setCatalog(data.items || [])).catch(() => setCatalog([]));
  }, []);

  useEffect(() => {
    function close(event) {
      if (!suggestRef.current?.contains(event.target)) setSuggestOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(q.trim()), q.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [q]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (type) params.set("type", type);
    if (province) params.set("province", province);
    if (district) params.set("district", district);
    if (sector) params.set("sector", sector);
    if (address) params.set("address", address);
    params.set("page", String(page));
    params.set("limit", "50");
    params.set("visitor", visitorId());
    let cancel = false;
    const started = performance.now();
    setPending(true);
    Promise.all([api(`/public/schools?${params}`), api("/public/ads")])
      .then(async ([schoolData, adData]) => {
        await afterPaint(started);
        if (cancel) return;
        const last = schoolData.meta?.pages || 1;
        if (page > last) {
          setPage(last);
          return;
        }
        setSchools(schoolData.items || []);
        setPages(last);
        setTotal(schoolData.meta?.total ?? (schoolData.items || []).length);
        setAds(adData.items || []);
        setError("");
        setLoaded(true);
        setPending(false);
      })
      .catch(async (err) => {
        await afterPaint(started);
        if (cancel) return;
        setError(err.message);
        setLoaded(true);
        setPending(false);
      });
    return () => { cancel = true; };
  }, [query, type, province, district, sector, address, page]);

  const rows = places.map((item) => item._id || {}).filter((item) => item.province || item.district || item.sector || item.address);
  const provinces = uniquePlaces(rows.map((item) => item.province));
  const districts = uniquePlaces(rows.filter((item) => !province || item.province === province).map((item) => item.district));
  const sectors = uniquePlaces(rows.filter((item) => (!province || item.province === province) && (!district || item.district === district)).map((item) => item.sector));
  const addresses = uniquePlaces(rows.filter((item) => (!province || item.province === province) && (!district || item.district === district) && (!sector || item.sector === sector)).map((item) => item.address));
  const addressOn = Boolean(province || district || sector || address);

  function chooseProvince(value) {
    setProvince(value);
    setDistrict("");
    setSector("");
    setAddress("");
    setPage(1);
  }
  function chooseDistrict(value) {
    setDistrict(value);
    setSector("");
    setAddress("");
    setPage(1);
  }
  function chooseSector(value) {
    setSector(value);
    setAddress("");
    setPage(1);
  }
  function turnPage(next) {
    if (next === page || next < 1 || next > pages) return;
    setPage(next);
    scrollToId("directory");
  }

  const needle = q.trim().toLowerCase();
  const suggestions = needle
    ? catalog.filter((school) => {
      const location = school.location || {};
      const blob = [school.name, school.motto, school.tagline, location.province, location.district, location.sector, location.address].filter(Boolean).join(" ").toLowerCase();
      return blob.includes(needle);
    }).slice(0, 6)
    : [];
  const suggestIndex = suggestions.length ? Math.min(suggestAt, suggestions.length - 1) : 0;

  function pickSuggestion(school) {
    setQ(school.name);
    setPage(1);
    setSuggestOpen(false);
    setSuggestAt(0);
  }

  function onSearchKey(event) {
    if (event.key === "Escape") {
      setSuggestOpen(false);
      return;
    }
    if (!suggestions.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSuggestOpen(true);
      setSuggestAt((index) => (index + 1) % suggestions.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSuggestOpen(true);
      setSuggestAt((index) => (index - 1 + suggestions.length) % suggestions.length);
    } else if (event.key === "Enter" && suggestOpen) {
      event.preventDefault();
      pickSuggestion(suggestions[suggestIndex]);
    }
  }

  async function rateSchool(school, patch) {
    if (rating.current.has(school._id)) return;
    rating.current.add(school._id);
    try {
      const data = await api(`/public/schools/${school._id}/reaction`, { method: "POST", body: { visitor: visitorId(), ...patch } });
      setSchools((list) => list.map((item) => (item._id === school._id ? { ...item, ...data.score } : item)));
    } catch (err) {
      notify("Not completed", err.message, "bad");
    } finally {
      rating.current.delete(school._id);
    }
  }

  const filters = (
    <aside className="filter-rail">
      <p className="kicker"><Icon name="filter" />{t("Filters")}</p>
      <form className={`search school-suggest${suggestOpen && suggestions.length ? " open" : ""}`} ref={suggestRef} onSubmit={(event) => event.preventDefault()} role="combobox" aria-expanded={suggestOpen && suggestions.length > 0} aria-haspopup="listbox">
        <div className="suggest-field">
          <Icon name="search" />
          <input
            value={q}
            onChange={(event) => { setQ(event.target.value); setPage(1); setSuggestOpen(true); setSuggestAt(0); }}
            onFocus={() => setSuggestOpen(true)}
            onKeyDown={onSearchKey}
            placeholder={t("Search a school, district or motto")}
            aria-label={t("Search a school, district or motto")}
            aria-autocomplete="list"
            aria-controls="school-suggest"
          />
        </div>
        {suggestOpen && suggestions.length ? (
          <ul className="suggest-list" id="school-suggest" role="listbox">
            {suggestions.map((school, index) => (
              <li key={school._id}>
                <button type="button" role="option" aria-selected={index === suggestIndex} className={index === suggestIndex ? "on" : ""} onMouseEnter={() => setSuggestAt(index)} onClick={() => pickSuggestion(school)}>
                  <Icon name="school" />
                  <span>
                    <strong>{markMatch(school.name, q)}</strong>
                    <em>{[t(school.type), schoolPlace(school)].filter(Boolean).join(" · ")}</em>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </form>
      <div className="filter-types">
        {[
          ["", "All"],
          ["primary", "Primary"],
          ["secondary", "Secondary"],
          ["tvet", "TVET"],
          ["university", "University"],
        ].map(([item, label]) => (
          <button key={item || "all"} type="button" className={type === item ? "on" : ""} onClick={() => { setType(item); setPage(1); }}>
            <Icon name={item === "university" ? "landmark" : item ? "school" : "compass"} />
            {t(label)}
          </button>
        ))}
      </div>
      <div className="filter-address">
        <p className="kicker"><Icon name="pin" />{t("School address")}</p>
        <label className="field">{t("Province")}
          <select value={province} onChange={(event) => chooseProvince(event.target.value)} aria-label={t("Province")}>
            <option value="">{t("All provinces")}</option>
            {provinces.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="field">{t("District")}
          <select value={district} onChange={(event) => chooseDistrict(event.target.value)} aria-label={t("District")}>
            <option value="">{t("All districts")}</option>
            {districts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        {sectors.length ? (
          <label className="field">{t("Sector")}
            <select value={sector} onChange={(event) => chooseSector(event.target.value)} aria-label={t("Sector")}>
              <option value="">{t("All sectors")}</option>
              {sectors.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        ) : null}
        {addresses.length ? (
          <label className="field">{t("Address")}
            <select value={address} onChange={(event) => { setAddress(event.target.value); setPage(1); }} aria-label={t("Address")}>
              <option value="">{t("All addresses")}</option>
              {addresses.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        ) : null}
        {addressOn ? <button type="button" className="ghost filter-clear" onClick={() => chooseProvince("")}>{t("Clear address")}</button> : null}
      </div>
    </aside>
  );

  const showAds = ads.length > 0;
  return (
    <div className="page home-page">
      {!loaded ? <HeroSkeleton /> : (
      <header className="page-head hero-stage">
        <div className="hero-copy">
          <p className="kicker">{t("Rwanda’s school atlas")}</p>
          <h1>{t("The quiet atlas of Rwanda’s classrooms.")}</h1>
          <p className="lede">{t("IshuriApp lists every approved school and carries marks and discipline from the classroom to a parent phone.")}</p>
          <div className="hero-actions">
            <button className="solid" type="button" onClick={() => scrollToId("directory")}>
              {t("Browse schools")}
              <Icon name="right" />
            </button>
            <button className="ghost" type="button" onClick={() => scrollToId("how")}>{t("How it works")}</button>
          </div>
          {pending ? <p className="hero-count"><Bone className="short" /></p> : <p className="hero-count"><Icon name="school" />{t(total === 1 ? "{count} approved school" : "{count} approved schools", { count: total })}</p>}
          <HeroCast />
        </div>
        <div className="hero-art">
          <HeroGlobe />
          <FamilyGraphic />
          <CrestGraphic />
        </div>
      </header>
      )}
      {error ? <p className="banner">{error}. Start the API on port 4000, then search again.</p> : null}
      <div className={`directory-wrap${showAds || pending ? " has-ads" : ""}`} id="directory">
        {loaded ? filters : (
          <aside className="filter-rail skel-card" aria-hidden="true">
            <Bone className="short" />
            <Bone className="field-skel" />
            {[0, 1, 2, 3, 4].map((item) => <Bone className="field-skel" key={item} />)}
          </aside>
        )}
        <div className="directory-main">
        <div className={`discover${showAds || pending ? " has-ads" : ""}`}>
        <div className="discover-main">
          {pending && !error ? <SchoolSkeletons /> : (
            <div className="school-grid">
              {schools.map((school) => {
                const location = school.location || {};
                const place = location.address || [location.sector, location.district, location.province].filter(Boolean).join(", ") || "Rwanda";
                return (
                  <article key={school._id} className="school">
                    <button type="button" className="school-open" onClick={() => go(`#/school/${school.slug || school._id}`)}>
                      <div className="cover">
                        {school.coverUrl ? <SoftImage src={school.coverUrl} alt="" /> : null}
                        {school.nationalRank ? <b>{t("Rating")} #{school.nationalRank}</b> : null}
                      </div>
                      <div className="school-body">
                        <span className="logo"><SchoolMark school={school} /></span>
                        <span>
                          <strong>{school.name}</strong>
                          <em>{school.tagline || school.motto || place}</em>
                        </span>
                      </div>
                    </button>
                    <div className="school-facts">
                      <span><Icon name="school" />{t(school.type)}</span>
                      <span><Icon name="pin" />{place}</span>
                      {school.studentCount ? <span><Icon name="graduate" />{school.studentCount} {t("Students")}</span> : null}
                      {school.teacherCount ? <span><Icon name="people" />{school.teacherCount} {t("Teachers")}</span> : null}
                      {school.establishedYear ? <span><Icon name="calendar" />{school.establishedYear}</span> : null}
                    </div>
                    <SchoolRate school={school} onChange={(patch) => rateSchool(school, patch)} />
                    <div className="school-foot">
                      <span className="listing-pill"><Icon name="check" />{t("Listing")}</span>
                      <button type="button" className="visit-site" onClick={() => go(`#/school/${school.slug || school._id}`)}>
                        {t("Visit site")}
                        <Icon name="right" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!pending && schools.length === 0 && !error ? <p className="muted"><strong>{t("No schools yet")}</strong><br />{t("Approved schools appear here after IshuriApp review.")}</p> : null}
          {!pending && total > 0 ? <ResultPager page={page} pages={pages} onPage={turnPage} /> : null}
        </div>
        {pending && !error ? (
          <aside className="ad side-note skel-card" aria-hidden="true">
            <div className="skel skel-media" />
            <i className="skel" />
            <i className="skel short" />
          </aside>
        ) : ads.length ? (
          <aside className="ad side-note">
            <AdStage ads={ads} mode="home" />
          </aside>
        ) : null}
        </div>
        </div>
      </div>
      {loaded ? <DiscoverStory /> : <StorySkeleton />}
      {loaded ? <Faq /> : <FaqSkeleton />}
    </div>
  );
}

function NowGraphic() {
  return (
    <svg className="now-crest" viewBox="0 0 320 200" role="img" aria-label={t("Notices schools choose to publish")}>
      <rect x="8" y="18" width="304" height="164" rx="28" fill="#e3f2fd" />
      <rect x="28" y="40" width="150" height="124" rx="16" fill="#ffffff" />
      <rect x="44" y="56" width="72" height="10" rx="5" fill="#1565C0" />
      <rect x="44" y="76" width="118" height="8" rx="4" fill="#d7e8f8" />
      <rect x="44" y="92" width="100" height="8" rx="4" fill="#d7e8f8" />
      <rect x="44" y="118" width="86" height="26" rx="13" fill="#0D47A1" />
      <path d="M62 131h50" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" />
      <rect x="196" y="48" width="92" height="128" rx="16" fill="#0D47A1" />
      <rect x="204" y="58" width="76" height="100" rx="10" fill="#f7fbff" />
      <rect x="214" y="72" width="56" height="28" rx="8" fill="#1565C0" />
      <text x="242" y="90" textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight="700" fontFamily="Instrument Sans, sans-serif">{t("SMS")}</text>
      <rect x="214" y="110" width="56" height="8" rx="4" fill="#d7e8f8" />
      <rect x="214" y="126" width="40" height="8" rx="4" fill="#d7e8f8" />
    </svg>
  );
}

function Now() {
  const [items, setItems] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let cancel = false;
    const started = performance.now();
    Promise.all([api("/public/ads"), api("/public/gallery")])
      .then(async ([ads, gallery]) => {
        await afterPaint(started);
        if (cancel) return;
        setItems(ads.items || []);
        setPhotos(gallery.items || []);
        setLoaded(true);
      })
      .catch(async (err) => {
        await afterPaint(started);
        if (cancel) return;
        setError(err.message);
        setLoaded(true);
      });
    return () => { cancel = true; };
  }, []);
  return (
    <div className="page now-page">
      <header className="page-head">
        {!loaded && !error ? (
          <>
            <div className="skel-copy">
              <Bone className="short" />
              <Bone className="skel-title" />
              <Bone />
            </div>
            <Bone className="skel-graphic" />
          </>
        ) : (
          <>
            <div>
              <p className="kicker"><Icon name="bolt" />{t("Now")}</p>
              <h1>{t("Now")}</h1>
              <p className="lede">{t("Programmes, trainings and internships that schools and partners choose to publish.")}</p>
            </div>
            <NowGraphic />
          </>
        )}
      </header>
      {error ? <p className="banner">{error}</p> : null}
      <section className="now-feature" aria-label={t("Now")}>
        {!loaded && !error ? <div className="ad panel skel-card" aria-hidden="true"><div className="skel skel-stage" /><i className="skel" /><i className="skel short" /></div> : null}
        {loaded && items.length ? (
          <article className="ad panel">
            <AdStage ads={items} mode="now" />
          </article>
        ) : null}
        {loaded && items.length === 0 && !error ? <p className="muted">{t("No opportunities right now")}</p> : null}
      </section>
      <section className="now-gallery" aria-label={t("Gallery")}>
        {!loaded && !error ? (
          <header>
            <Bone className="skel-title" />
            <Bone />
          </header>
        ) : (
          <header>
            <h2><Icon name="image" />{t("Gallery")}</h2>
            <p>{t("Photographs published on school websites.")}</p>
          </header>
        )}
        {!loaded && !error ? (
          <div className="now-grid" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div className="now-photo-card skel-card" key={item}>
                <div className="skel now-photo-skel" />
                <span className="skel-copy"><Bone className="short" /><Bone /></span>
              </div>
            ))}
          </div>
        ) : null}
        {loaded && photos.length ? (
          <div className="now-grid">
            {photos.map((photo, index) => (
              <button key={photo._id} type="button" className="now-photo-card" onClick={() => setOpen(index)}>
                <SoftImage src={photo.imageUrl} alt={photo.caption || photo.school?.name || ""} />
                <span className="now-photo-copy">
                  {photo.school?.name ? <em><Icon name="school" />{photo.school.name}</em> : null}
                  <strong>{photo.caption || t(photo.album || "Campus")}</strong>
                </span>
              </button>
            ))}
          </div>
        ) : null}
        {loaded && photos.length === 0 && !error ? <p className="muted"><Icon name="image" />{t("No photos yet")}</p> : null}
      </section>
      {open != null && photos.length ? (
        <GalleryStage photos={photos} start={open} schoolName={photos[open]?.school?.name || t("IshuriApp")} onClose={() => setOpen(null)} />
      ) : null}
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
  const locale = { rw: "rw-RW", sw: "sw", fr: "fr", en: "en-GB" }[getLang()] || "en-GB";
  const when = event.startsAt ? new Date(event.startsAt) : null;
  const day = when ? when.toLocaleDateString(locale, { day: "2-digit" }) : "—";
  const month = when ? when.toLocaleDateString(locale, { month: "short" }) : "";
  const year = when ? String(when.getFullYear()) : "";
  const clock = when
    ? when.toLocaleString(locale, { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    : t("Date to be set");
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
    let cancel = false;
    const started = performance.now();
    api("/public/events")
      .then(async (data) => {
        await afterPaint(started);
        if (cancel) return;
        setItems(data.items || []);
        setLoaded(true);
      })
      .catch(async (err) => {
        await afterPaint(started);
        if (cancel) return;
        setError(err.message);
        setLoaded(true);
      });
    return () => { cancel = true; };
  }, []);
  return (
    <div className="page">
      <header className="page-head">
        {!loaded && !error ? (
          <>
            <div className="skel-copy">
              <Bone className="skel-title" />
              <Bone />
              <Bone className="short" />
            </div>
            <Bone className="skel-graphic" />
          </>
        ) : (
          <>
            <div>
              <h1>{t("School events")}</h1>
              <p className="lede">{t("Meetings, sports, debates, visiting days, graduations and scholarships.")}</p>
            </div>
            <EventsGraphic />
          </>
        )}
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
      ) : (
      <div className="event-board">
        {items.map((event) => (
          <EventCard
            key={event._id}
            event={event}
            onOpen={event.school ? () => go(`#/school/${event.school.slug || event.school._id}`) : undefined}
          />
        ))}
      </div>
      )}
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
    let cancel = false;
    const started = performance.now();
    setLoaded(false);
    api(`/public/rankings?type=${type}`)
      .then(async (data) => {
        await afterPaint(started);
        if (cancel) return;
        setItems(data.items || []);
        setError("");
        setLoaded(true);
      })
      .catch(async (err) => {
        await afterPaint(started);
        if (cancel) return;
        setError(err.message);
        setLoaded(true);
      });
    return () => { cancel = true; };
  }, [type]);
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{t("National rankings")}</h1>
          <p className="lede">{t("Performance snapshots published by each approved school, with national rank.")}</p>
        </div>
        <div className="chips" role="group" aria-label={t("Type")}>
          {[
            ["primary", "Primary"],
            ["secondary", "Secondary"],
            ["tvet", "TVET"],
            ["university", "University"],
          ].map(([item, label]) => (
            <button key={item} className={type === item ? "on" : ""} onClick={() => setType(item)}>{t(label)}</button>
          ))}
        </div>
      </header>
      {error ? <p className="banner">{error}</p> : null}
      {!loaded && !error ? (
        <div className="skel-rows" aria-hidden="true">
          {[0, 1, 2, 3, 4, 5].map((item) => (
            <div className="rank-skel" key={item}>
              <i className="skel skel-avatar" />
              <span className="skel-copy"><i className="skel" /><i className="skel short" /></span>
            </div>
          ))}
        </div>
      ) : null}
      {loaded && items.length === 0 && !error ? <p className="muted">{t("No ranked schools in this category")}</p> : null}
      {loaded && items.length > 0 ? (
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
            {item.album ? <em><Icon name="image" />{item.album}</em> : null}
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
        {t("Close")}
      </button>
      <button className="lightbox-step prev" type="button" onClick={(event) => step(event, -1)} disabled={!several}>
        <Icon name="left" />
        {t("Previous")}
      </button>
      <figure className="lightbox-frame" onClick={(event) => event.stopPropagation()}>
        {failed || !photo?.imageUrl ? (
          <div className="photo-fallback" role="img" aria-label={photo?.caption || schoolName} />
        ) : (
          <img alt={photo.caption || schoolName} src={photo.imageUrl} onError={() => setFailed(true)} />
        )}
        <figcaption className="lightbox-copy">
          <p className="kicker">{t(photo?.album || "Campus")} · {index + 1} {t("of")} {photos.length}</p>
          <h2>{photo?.caption || schoolName}</h2>
          <p>{schoolName}{added ? ` · ${t("Added")} ${added}` : ""}</p>
        </figcaption>
      </figure>
      <button className="lightbox-step next" type="button" onClick={(event) => step(event, 1)} disabled={!several}>
        {t("Next")}
        <Icon name="right" />
      </button>
    </div>,
    document.body
  );
}

function SchoolDossier({ school, announcements = [], nextEvent }) {
  const location = school.location || {};
  const socials = Object.entries(school.socials || {}).filter(([, value]) => String(value || "").trim());
  const facts = [
    ["Type", t(school.type)],
    ["Motto", school.motto],
    ["Tagline", school.tagline],
    ["Founded", school.establishedYear],
    ["Students", school.studentCount],
    ["Teachers", school.teacherCount],
    ["Rating", school.nationalRank ? `#${school.nationalRank}` : ""],
    ["Province", location.province],
    ["District", location.district],
    ["Sector", location.sector],
    ["Cell", location.cell],
    ["Village", location.village],
    ["Address", location.address],
    ["Landmark", location.landmark],
    ["Phone", school.phone],
    ["WhatsApp", school.whatsapp],
    ["Email", school.email],
    ["Website", school.website],
    ["Visiting hours", school.visitingHours],
    ["Fees", school.feesNote],
  ].filter(([, value]) => value != null && String(value).trim() !== "");
  const stories = [
    ["About", school.about],
    ["History", school.history],
    ["Vision", school.vision],
    ["Mission", school.mission],
    ["Performance summary", school.performanceSummary],
  ].filter(([, value]) => String(value || "").trim());
  const locale = { rw: "rw", sw: "sw", fr: "fr", en: "en-GB" }[getLang()] || "en-GB";
  const record = facts.length ? (
    <section className="campus-card">
      <CampusHeading icon="school">{t("School record")}</CampusHeading>
      <dl className="dossier-facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{t(label)}</dt>
            <dd>{label === "Website" ? <a href={value} target="_blank" rel="noreferrer">{value}</a> : value}</dd>
          </div>
        ))}
      </dl>
      {socials.length ? (
        <div className="person-links">
          {socials.map(([name, url]) => {
            const label = { facebook: "Facebook", twitter: "Twitter", instagram: "Instagram", youtube: "YouTube", linkedin: "LinkedIn" }[name] || name;
            return <a key={name} href={url} target="_blank" rel="noreferrer"><Icon name="link" />{t(label)}</a>;
          })}
        </div>
      ) : null}
    </section>
  ) : null;
  const narrative = (
    <>
      {stories.map(([label, value]) => (
        <section className="campus-card" key={label}>
          <CampusHeading icon={label === "Vision" ? "eye" : label === "Mission" ? "target" : label === "History" ? "landmark" : label === "Performance summary" ? "chart" : "info"}>{t(label)}</CampusHeading>
          {textBlocks(value).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        </section>
      ))}
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
        <section className="campus-card">
          <CampusHeading icon="award">{t("Exam results")}</CampusHeading>
          {(school.examResults || []).map((result) => (
            <p key={`${result.year}-${result.exam}`}>
              <strong>{result.year} {result.exam}</strong>
              <span>{result.passRate != null ? ` ${result.passRate}% ${t("Pass")}` : ""}{result.distinctionRate ? `, ${result.distinctionRate}% ${t("Distinction")}` : ""} {result.notes || ""}</span>
            </p>
          ))}
        </section>
      ) : null}
    </>
  );
  const notes = announcements.length ? (
    <section className="campus-card">
      <CampusHeading icon="megaphone">{t("Announcements")}</CampusHeading>
      {announcements.map((item) => (
        <article key={item._id}>
          <h3>{item.title}</h3>
          {item.body ? <p>{item.body}</p> : null}
        </article>
      ))}
    </section>
  ) : null;
  const upcoming = nextEvent ? (
    <section className="campus-card next-event accent">
      <CampusHeading icon="calendar">{t("Next event")}</CampusHeading>
      <h3>{nextEvent.title}</h3>
      <p className="muted">{nextEvent.startsAt ? new Date(nextEvent.startsAt).toLocaleDateString(locale, { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : t("Date to be set")}{nextEvent.venue ? ` · ${nextEvent.venue}` : ""}</p>
      {nextEvent.description ? <p>{nextEvent.description}</p> : null}
    </section>
  ) : null;
  const hasNarrative = stories.length || school.programs?.length || school.facilities?.length || (school.examResults || []).length;
  if (!hasNarrative) return <div className="dossier">{upcoming}{notes}{record}</div>;
  return (
    <div className="campus-home">
      <div className="dossier">{narrative}</div>
      <aside className="campus-side">{upcoming}{notes}{record}</aside>
    </div>
  );
}

function SchoolPage({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("Home");
  const [logoFailed, setLogoFailed] = useState(false);
  const [openPhoto, setOpenPhoto] = useState(null);
  useEffect(() => {
    let cancel = false;
    const started = performance.now();
    setTab("Home");
    setLogoFailed(false);
    setOpenPhoto(null);
    setData(null);
    setError("");
    api(`/public/schools/${id}`)
      .then(async (next) => {
        await afterPaint(started);
        if (!cancel) setData(next);
      })
      .catch(async (err) => {
        await afterPaint(started);
        if (!cancel) setError(err.message);
      });
    return () => { cancel = true; };
  }, [id]);
  useEffect(() => {
    if (!data?.school?.name) return;
    const about = (data.school.motto || data.school.about || "").replace(/\s+/g, " ").trim();
    const line = (about ? `${data.school.name}. ${about}` : `${data.school.name} on IshuriApp, Rwanda’s school atlas.`).slice(0, 160);
    showBrand(`${data.school.name} — IshuriApp`, line, true);
  }, [data]);
  if (error) return <div className="page"><p className="banner">{error}</p></div>;
  if (!data) {
    return (
      <article className="campus" aria-hidden="true">
        <header className="campus-hero skel" />
        <div className="campus-sheet">
          <div className="campus-identity">
            <i className="skel logo-skel" />
            <div className="skel-copy">
              <Bone className="short" />
              <Bone className="skel-title" />
              <Bone />
              <Bone className="short" />
            </div>
            <div className="campus-stats">
              {[0, 1, 2].map((item) => <i className="skel stat-skel" key={item} />)}
            </div>
          </div>
          <div className="campus-nav">
            {[0, 1, 2, 3, 4, 5].map((item) => <Bone className="skel-btn" key={item} />)}
          </div>
        </div>
        <div className="campus-body skel-rows">
          <i className="skel card-skel" />
          <i className="skel card-skel" />
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
            {school.logoUrl && !logoFailed ? <SoftImage src={school.logoUrl} alt="" onError={() => setLogoFailed(true)} /> : <span><Icon name="school" /></span>}
          </div>
          <div className="campus-title">
            <p className="kicker"><Icon name="shield" />{school.verified ? t("Admin verified") : t("Unverified")} · {t(school.type)}</p>
            <h1>{school.name}</h1>
            <p className="motto">{school.motto || school.tagline}</p>
            <p className="place-line">
              <Icon name="pin" />
              {place}
              {school.nationalRank ? <span className="rank-flag"><Icon name="award" />{t("National rank")} #{school.nationalRank}</span> : null}
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
        {tab === "Home" ? <SchoolDossier school={school} announcements={data.announcements || []} nextEvent={nextEvent} /> : null}
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
                    <span>{result.passRate != null ? `${result.passRate}% ${t("Pass")}` : ""}{result.distinctionRate ? `${result.passRate != null ? ", " : ""}${result.distinctionRate}% ${t("Distinction")}` : ""} {result.notes || ""}</span>
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
          (data.gallery || []).length === 0 ? <p className="muted campus-empty"><Icon name="image" />{t("No photos yet")}</p> : (
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
              <p>{[school.location?.address, school.location?.landmark, school.location?.village, school.location?.cell, place].filter(Boolean).join(" · ") || place}</p>
              {school.visitingHours ? <><CampusHeading icon="clock">{t("Visiting hours")}</CampusHeading><p>{school.visitingHours}</p></> : null}
            </div>
            <div className="contact-actions">
              {school.phone ? <a className="ghost" href={`tel:${school.phone}`}><Icon name="phone" />{t("Call")} {school.phone}</a> : null}
              {school.whatsapp ? <a className="ghost" href={`https://wa.me/${String(school.whatsapp).replace(/\D/g, "")}`}><Icon name="chat" />{t("WhatsApp the school")}</a> : null}
              {school.email ? <a className="ghost" href={`mailto:${school.email}`}><Icon name="mail" />{school.email}</a> : null}
              {school.website ? <a className="ghost" href={school.website} target="_blank" rel="noreferrer"><Icon name="link" />{t("Website")}</a> : null}
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

const GATE_PHOTOS = ["/avatar-mother.jpg?v=1", "/avatar-father.jpg?v=1", "/avatar-teacher.jpg?v=1", "/avatar-officer.jpg?v=1"];

function GateSkeleton() {
  return (
    <section className="gate gate-skel" aria-hidden="true">
      <div className="gate-brand"><i className="skel gate-photo-skel" /></div>
      <div className="gate-form-skel">
        <Bone className="skel-title" />
        <Bone />
        <Bone className="short" />
        <Bone className="field-skel" />
        <Bone className="field-skel" />
        <Bone className="skel-btn" />
      </div>
    </section>
  );
}

function Gate({ onSignIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const [entering, setEntering] = useState(false);

  useEffect(() => {
    let stop = false;
    const started = performance.now();
    Promise.all(GATE_PHOTOS.map((src) => new Promise((resolve) => {
      const photo = new Image();
      photo.onload = () => resolve(true);
      photo.onerror = () => resolve(false);
      photo.src = src;
    }))).then(async () => {
      await afterPaint(started, 420);
      if (!stop) setReady(true);
    });
    return () => { stop = true; };
  }, []);

  async function submit(event) {
    event.preventDefault();
    setEntering(true);
    try {
      const data = await api("/auth/login", { method: "POST", body: { email, password } });
      onSignIn({ token: data.token, user: data.user, school: data.school });
    } catch (err) {
      setEntering(false);
      setError(err.message);
    }
  }

  if (!ready || entering) return <GateSkeleton />;

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
        <label className="field">{t("Email")}
          <span className="gate-input">
            <Icon name="mail" />
            <input value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" placeholder={t("you@school.rw")} />
          </span>
        </label>
        <label className="field">{t("Password")}
          <span className="secret-field gate-input">
            <Icon name="lock" />
            <input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" placeholder={t("Your password")} />
            <button className="secret-toggle" type="button" aria-pressed={showPassword} aria-label={showPassword ? t("Hide password") : t("Show password")} onClick={() => setShowPassword((current) => !current)}>{showPassword ? t("Hide") : t("Show")}</button>
          </span>
        </label>
        {error ? <p className="banner">{error}</p> : null}
        <button className="solid" type="submit">{t("Sign in")}</button>
      </form>
    </section>
  );
}

