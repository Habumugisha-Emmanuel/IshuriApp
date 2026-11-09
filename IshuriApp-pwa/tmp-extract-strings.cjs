const fs = require("fs");
const path = require("path");
const dir = path.join(__dirname, "src");
const files = fs.readdirSync(dir).filter((file) => /\.(jsx|js)$/.test(file));
const set = new Set();
const re = /(["'`])((?:\\.|(?!\1).){3,})\1/g;
for (const file of files) {
  const source = fs.readFileSync(path.join(dir, file), "utf8");
  let match;
  while ((match = re.exec(source))) {
    const text = match[2];
    if (!/[A-Za-z]{3,}/.test(text)) continue;
    if (text.includes("http") || text.startsWith("/") || text.startsWith("#")) continue;
    if (text.includes("function") || text.includes("=>") || text.includes("${")) continue;
    if (/^[a-z0-9_./:-]+$/i.test(text) && !text.includes(" ")) continue;
    if (text.length > 220) continue;
    set.add(text.replace(/\\n/g, " "));
  }
}
const list = [...set].sort();
fs.writeFileSync(path.join(__dirname, "tmp-strings.txt"), list.join("\n"), "utf8");
console.log(list.length);
