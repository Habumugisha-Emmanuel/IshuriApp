import fs from "fs";
import path from "path";
const files = ["App.jsx","workspace.jsx","liveChat.jsx","messageAnalytics.jsx","messageWallet.jsx","earningsDashboard.jsx","officialReport.jsx"].map((name) => path.join("src", name));
for (const file of files) {
  const lines = fs.readFileSync(file, "utf8").split(/\n/);
  lines.forEach((line, index) => {
    const re = />([^<>{}]*[A-Za-zÀ-ÿ][^<>{}]*)</g;
    let match;
    while ((match = re.exec(line))) {
      const text = match[1].trim();
      if (!text || text.includes("t(")) continue;
      if (/^[0-9/%.\-–—×+]+$/.test(text)) continue;
      console.log(`${file}:${index + 1}: ${text}`);
    }
  });
}
process.exit(0);
