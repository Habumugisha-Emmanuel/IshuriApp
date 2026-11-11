import { useEffect, useState } from "react";
import { phrases } from "./phrases.js";

export const LANGS = [
  { id: "rw", label: "Kinyarwanda" },
  { id: "sw", label: "Kiswahili" },
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

const KEY = "ishuri.lang";

function storedLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (LANGS.some((item) => item.id === saved)) return saved;
  } catch {
    /* The page can still render in English. */
  }
  return "en";
}

let lang = storedLang();
const listeners = new Set();

function applyDocumentLang(next) {
  if (typeof document !== "undefined") document.documentElement.lang = next;
}

applyDocumentLang(lang);

export function getLang() {
  return lang;
}

export function setLanguage(next) {
  lang = LANGS.some((item) => item.id === next) ? next : "en";
  try { localStorage.setItem(KEY, lang); } catch { /* ignore */ }
  applyDocumentLang(lang);
  listeners.forEach((fn) => fn(lang));
}

export function useLanguage() {
  const [current, setCurrent] = useState(lang);
  useEffect(() => {
    listeners.add(setCurrent);
    return () => listeners.delete(setCurrent);
  }, []);
  return current;
}

function fill(text, vars) {
  let out = text;
  if (vars) {
    Object.entries(vars).forEach(([key, value]) => {
      out = out.replaceAll(`{${key}}`, String(value ?? ""));
    });
  }
  return out;
}

function lookup(source, vars) {
  if (lang === "en") return fill(source, vars);
  const table = phrases[lang] || {};
  if (table[source]) return fill(table[source], vars);
  const patterned = pattern(source);
  if (patterned) return patterned;
  return fill(source, vars);
}

function pattern(source) {
  const table = phrases[lang] || {};
  const use = (key, vars) => (table[key] ? fill(table[key], vars) : null);
  let match = source.match(/^Sent to (\d+) parents?\.$/);
  if (match) return use(Number(match[1]) === 1 ? "Sent to {count} parent." : "Sent to {count} parents.", { count: match[1] });
  match = source.match(/^Message Wallet: (\d+) messages? left\.$/);
  if (match) return use(Number(match[1]) === 1 ? "Message Wallet: {count} message left." : "Message Wallet: {count} messages left.", { count: match[1] });
  match = source.match(/^(.+) must begin with 250, for example 250788000000\.$/);
  if (match) return use("{label} must begin with 250, for example 250788000000.", { label: lookup(match[1]) });
  match = source.match(/^(.+) is not a subject of (.+)$/);
  if (match) return use("{subject} is not a subject of {class}.", { subject: match[1], class: match[2] });
  match = source.match(/^(\d+) online$/);
  if (match) return use("{count} online", { count: match[1] });
  match = source.match(/^Sent (\d+)\. Not sent: (.+)$/);
  if (match) return use("Sent {count}. Not sent: {details}", { count: match[1], details: match[2] });
  match = source.match(/^Category must be one of: (.+)$/);
  if (match) return use("Category must be one of: {list}", { list: match[1] });
  return null;
}

export function t(text, vars) {
  if (text == null || text === "") return "";
  return lookup(String(text), vars);
}
