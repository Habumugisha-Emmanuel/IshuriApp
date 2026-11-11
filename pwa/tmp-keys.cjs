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
const keys = new Set();
const left = [];
for (const file of files) {
  const source = fs.readFileSync(file, "utf8");
  const keyRe = /t\("((?:\\.|[^"\\])*)"\)/g;
  let match;
  while ((match = keyRe.exec(source))) keys.add(match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\"));
  const lines = source.split(/\n/);
  lines.forEach((line, index) => {
    const re = /(?<!t\()"([^"\\\n]*[A-Za-zÀ-ÿ][^"\\\n]*)"/g;
    let item;
    while ((item = re.exec(line))) {
      const text = item[1];
      if (text.startsWith("./") || text.startsWith("/") || text.startsWith("#") || text.startsWith("http") || text.startsWith("tw:")) continue;
      if (/^[a-z0-9_.:/#-]+$/.test(text)) continue;
      if (/className|import |from |===|!==|method:|icon:|d=|fill=|stroke/.test(line) && !/>/.test(line.slice(item.index))) {
        if (!/\?|\bt\(/.test(line) && !line.includes("placeholder") && !line.includes("confirm") && !line.includes("notify") && !line.includes("act(")) continue;
      }
      if (text.length > 180) continue;
      left.push(`${file}:${index + 1}: ${text}`);
    }
  });
}
fs.writeFileSync("tmp-keys.txt", [...keys].sort().join("\n"));
fs.writeFileSync("tmp-left.txt", left.join("\n"));
console.log("keys", keys.size, "left", left.length);
process.exit(0);
