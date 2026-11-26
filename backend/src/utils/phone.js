function digitsOf(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function localPhone(raw) {
  const digits = digitsOf(raw);
  if (/^07\d{8}$/.test(digits)) return digits;
  if (/^2507\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return null;
}

function toRwandaMsisdn(raw) {
  const local = localPhone(raw);
  if (!local) return null;
  const msisdn = `250${local.slice(1)}`;
  return /^2507\d{8}$/.test(msisdn) ? msisdn : null;
}

function optionalMsisdn(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return "";
  return localPhone(raw);
}

function fitSms(value, limit = 160) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  return text.slice(0, limit).trimEnd();
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

module.exports = { digitsOf, localPhone, toRwandaMsisdn, optionalMsisdn, countSmsParts, fitSms };
