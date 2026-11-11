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
const seen = new Set();
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const re = /(?<!t\()"([^"\\\n]*[A-Za-z][^"\\\n]*)"/g;
  let match;
  while ((match = re.exec(source))) {
    const text = match[1];
    if (text.startsWith("./") || text.startsWith("/") || text.startsWith("#") || text.startsWith("http") || text.startsWith("tw:")) continue;
    if (!text.includes(" ") && !/[.?!]/.test(text) && text.length < 18 && text === text.toLowerCase()) continue;
    if (!text.includes(" ") && /^[a-z0-9_-]+$/.test(text)) continue;
    const line = source.slice(0, match.index).split("\n").length;
    const key = text;
    if (!seen.has(key)) {
      seen.add(key);
      console.log(`${file}:${line}: ${text}`);
    }
  }
}
process.exit(0);
