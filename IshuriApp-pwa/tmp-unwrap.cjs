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

function unquote(text) {
  return text.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

for (const file of files) {
  const full = path.join(__dirname, file);
  let source = fs.readFileSync(full, "utf8");
  source = source.replace(/^import \{ t \} from "\.\/i18n\.js";\r?\n/, "");
  source = source.replace(/(\w[\w-]*)=\{t\("((?:\\.|[^"\\])*)"\)\}/g, (_, name, text) => `${name}="${unquote(text)}"`);
  source = source.replace(/\{t\("((?:\\.|[^"\\])*)"\)\}/g, (_, text) => unquote(text));
  fs.writeFileSync(full, source);
  console.log("restored", file);
}
