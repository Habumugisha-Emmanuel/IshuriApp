const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "src");
const files = fs.readdirSync(dir).filter((file) => /\.(jsx|js)$/.test(file) && file !== "icons.jsx");
const found = new Set();

function add(text) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length < 2) return;
  if (!/[A-Za-z]/.test(clean)) return;
  if (clean.startsWith("http") || clean.startsWith("/") || clean.startsWith("#")) return;
  if (clean.includes("className") || clean.includes("tw:")) return;
  found.add(clean);
}

for (const file of files) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  const textNodes = source.matchAll(/>([^<>{}\n][^<>{}]*)<\//g);
  for (const match of textNodes) add(match[1]);
  const attrs = source.matchAll(/\b(?:placeholder|aria-label|title|alt)=["']([^"']+)["']/g);
  for (const match of attrs) add(match[1]);
  const notices = source.matchAll(/\b(?:notify|confirm)\(\s*["']([^"']+)["']/g);
  for (const match of notices) add(match[1]);
  const confirms = source.matchAll(/window\.confirm\(\s*`([^`]+)`/g);
  for (const match of confirms) add(match[1]);
}

const list = [...found].sort((a, b) => a.localeCompare(b));
fs.writeFileSync(path.join(__dirname, "tmp-ui.txt"), list.join("\n"), "utf8");
console.log(list.length);
