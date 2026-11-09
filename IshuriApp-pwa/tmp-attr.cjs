const fs = require("fs");
const files = [
  "src/App.jsx",
  "src/workspace.jsx",
  "src/messageAnalytics.jsx",
  "src/liveChat.jsx",
  "src/messageWallet.jsx",
  "src/earningsDashboard.jsx",
  "src/officialReport.jsx",
];
const restore = ["className", "fontFamily", "preserveAspectRatio", "viewBox", "d", "fill", "stroke", "style", "role", "type", "method", "autoComplete", "href", "src"];
const keep = ["data-label", "kicker", "label"];
for (const file of files) {
  let source = fs.readFileSync(file, "utf8");
  source = source.replace(/([\w:-]+)=t\("((?:\\.|[^"\\])*)"\)/g, (full, name, text) => {
    const plain = text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (keep.includes(name)) return `${name}={t("${text}")}`;
    return `${name}="${plain}"`;
  });
  fs.writeFileSync(file, source);
  console.log("fixed attrs", file);
}
process.exit(0);
