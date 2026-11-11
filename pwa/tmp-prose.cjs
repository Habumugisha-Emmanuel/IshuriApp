const fs = require("fs");

const files = [
  "src/App.jsx",
  "src/workspace.jsx",
  "src/liveChat.jsx",
  "src/messageAnalytics.jsx",
  "src/messageWallet.jsx",
  "src/earningsDashboard.jsx",
  "src/officialReport.jsx",
];

function isProse(text) {
  if (!/[A-Za-zÀ-ÿ]/.test(text)) return false;
  if (!/\s/.test(text)) return false;
  if (text.startsWith("http") || text.startsWith("/") || text.startsWith("#") || text.startsWith("tw:") || text.startsWith("M") && /\d/.test(text)) return false;
  if (text.includes("${") || text.includes("=>") || text.includes("className") || text.includes("onClick")) return false;
  const digits = (text.match(/\d/g) || []).length;
  if (digits > text.length * 0.35) return false;
  return true;
}

function quote(text) {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function wrapFile(source) {
  let out = "";
  const stack = [];
  let pendingFn = false;
  let i = 0;
  while (i < source.length) {
    const rest = source.slice(i);
    if (rest.startsWith("//")) {
      const end = source.indexOf("\n", i);
      const stop = end === -1 ? source.length : end + 1;
      out += source.slice(i, stop);
      i = stop;
      pendingFn = false;
      continue;
    }
    if (rest.startsWith("/*")) {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop);
      i = stop;
      continue;
    }
    if (rest.startsWith("=>")) {
      pendingFn = true;
      out += "=>";
      i += 2;
      continue;
    }
    if (/^function\b/.test(rest)) {
      pendingFn = true;
      out += "function";
      i += 8;
      continue;
    }
    const ch = source[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const q = ch;
      let j = i + 1;
      let body = "";
      while (j < source.length) {
        if (source[j] === "\\") {
          body += source.slice(j, j + 2);
          j += 2;
          continue;
        }
        if (source[j] === q) break;
        body += source[j];
        j += 1;
      }
      const literal = source.slice(i, j + 1);
      const inFn = stack.includes("fn");
      const already = out.endsWith("t(");
      const tail = out.slice(-48);
      const compared = /===?\s*$/.test(tail) || /!==?\s*$/.test(tail) || /\bcase\s*$/.test(tail);
      const probed = /\.(startsWith|endsWith|includes|indexOf|match|replaceAll?)\(\s*$/.test(tail);
      if (q === '"' && inFn && !already && !compared && !probed && isProse(body.replace(/\\"/g, '"').replace(/\\\\/g, "\\"))) {
        const plain = body.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
        out += `t("${quote(plain)}")`;
      } else {
        out += literal;
      }
      i = j + 1;
      continue;
    }
    if (ch === "{") {
      stack.push(pendingFn ? "fn" : "block");
      pendingFn = false;
      out += ch;
      i += 1;
      continue;
    }
    if (ch === "}") {
      stack.pop();
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

for (const file of files) {
  const before = fs.readFileSync(file, "utf8");
  const after = wrapFile(before);
  fs.writeFileSync(file, after);
  const added = (after.match(/t\("/g) || []).length - (before.match(/t\("/g) || []).length;
  console.log(file, "added", added);
}
process.exit(0);
