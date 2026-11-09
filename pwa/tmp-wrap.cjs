const fs = require("fs");
const path = require("path");

const files = [
  "src/App.jsx",
  "src/workspace.jsx",
  "src/liveChat.jsx",
  "src/messageAnalytics.jsx",
  "src/messageWallet.jsx",
  "src/earningsDashboard.jsx",
  "src/officialReport.jsx",
];

function quote(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wrapText(source) {
  return source.replace(/([A-Za-z0-9"'/}])>([ \t]*)([^<>{}\n]+)</g, (full, before, lead, text) => {
    const clean = text.trim();
    if (!/[A-Za-zÀ-ÿ]/.test(clean)) return full;
    if (/[;=`{}()]/.test(clean)) return full;
    if (clean.includes("t(")) return full;
    const tail = text.match(/[ \t]*$/)[0];
    const inner = text.trim();
    return `${before}>${lead}{t("${quote(inner)}")}${tail}<`;
  });
}

function wrapAttr(source, name) {
  const re = new RegExp(`\\b${name}="([^"\\n{]+)"`, "g");
  return source.replace(re, (full, text) => {
    const clean = text.trim();
    if (!/[A-Za-zÀ-ÿ]/.test(clean)) return full;
    if (clean.startsWith("http") || clean.startsWith("/") || clean.startsWith("#") || clean.includes(" ")) {
      if (clean.startsWith("http") || clean.startsWith("/") || clean.startsWith("#")) return full;
    }
    if (!/[A-Za-zÀ-ÿ]/.test(clean)) return full;
    return `${name}={t("${quote(clean)}")}`;
  });
}

for (const file of files) {
  const full = path.join(__dirname, file);
  let source = fs.readFileSync(full, "utf8");
  source = wrapText(source);
  for (const name of ["placeholder", "aria-label", "alt", "title"]) source = wrapAttr(source, name);
  if (!source.includes('from "./i18n.js"')) {
    source = `import { t } from "./i18n.js";\n${source}`;
  }
  fs.writeFileSync(full, source);
  console.log("wrapped", file);
}
