import { rowsA } from "./src/phraseA.js";
import { rowsB } from "./src/phraseB.js";
import { rowsC } from "./src/phraseC.js";
import fs from "fs";
import path from "path";

const have = new Set([...rowsA, ...rowsB, ...rowsC].map((row) => row[0]));
const files = fs.readdirSync("src").filter((name) => /\.jsx?$/.test(name) && !name.startsWith("phrase"));
const missing = [];
for (const name of files) {
  const source = fs.readFileSync(path.join("src", name), "utf8");
  const re = /(?<![\w])t\("((?:\\.|[^"\\])*)"\)/g;
  let match;
  while ((match = re.exec(source))) {
    const key = match[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\");
    if (!key || key === "/" || key === "-" || key === ",") continue;
    if (!have.has(key)) missing.push(`${name}: ${JSON.stringify(key)}`);
  }
}
console.log("real missing", missing.length);
missing.slice(0, 40).forEach((line) => console.log(line));
process.exit(0);
