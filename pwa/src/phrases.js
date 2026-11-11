import { rowsA } from "./phraseA.js";
import { rowsB } from "./phraseB.js";
import { rowsC } from "./phraseC.js";

function table(index) {
  const out = {};
  for (const row of [...rowsA, ...rowsB, ...rowsC]) out[row[0]] = row[index];
  return out;
}

export const phrases = {
  rw: table(1),
  sw: table(2),
  fr: table(3),
};
