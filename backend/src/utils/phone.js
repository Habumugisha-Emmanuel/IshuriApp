function toRwandaMsisdn(raw) {
  if (!raw) return null;
  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("2500") && digits.length === 13) digits = `250${digits.slice(4)}`;
  let national = "";
  if (digits.startsWith("250") && digits.length === 12) national = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 10) national = digits.slice(1);
  else if (digits.length === 9) national = digits;
  else return null;
  if (!/^\d{9}$/.test(national)) return null;
  const msisdn = `250${national}`;
  return /^250\d{9}$/.test(msisdn) ? msisdn : null;
}

function optionalMsisdn(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  return toRwandaMsisdn(raw);
}

function countSmsParts(message) {
  const text = String(message || "");
  const gsm7 =
    /^[\x00-\x7F\u00A0-\u00FF€£¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&'()*+,\-./0-9:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà\n\r]*$/.test(
      text
    );
  if (gsm7) {
    if (text.length <= 160) return 1;
    return Math.ceil(text.length / 153);
  }
  if (text.length <= 70) return 1;
  return Math.ceil(text.length / 67);
}

module.exports = { toRwandaMsisdn, optionalMsisdn, countSmsParts };
