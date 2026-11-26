export function takePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

export function localPhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (/^07\d{8}$/.test(digits)) return digits;
  if (/^2507\d{8}$/.test(digits)) return `0${digits.slice(3)}`;
  return "";
}
