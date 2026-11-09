function schoolBrief(school) {
  const location = school?.location || {};
  return {
    name: school?.name || "",
    motto: school?.motto || "",
    email: school?.email || "",
    phone: school?.phone || "",
    logoUrl: school?.logoUrl || "",
    type: school?.type || "",
    address: location.address || [location.sector, location.district, location.province].filter(Boolean).join(", "),
  };
}

function termAliases(value) {
  const lower = String(value || "").trim().toLowerCase();
  const groups = {
    "1": ["1", "term 1"],
    "term 1": ["1", "term 1"],
    "2": ["2", "term 2"],
    "term 2": ["2", "term 2"],
    "3": ["3", "term 3"],
    "term 3": ["3", "term 3"],
    annual: ["annual", "year"],
    year: ["annual", "year"],
  };
  return groups[lower] || [lower];
}

function yearsIn(value) {
  return [...String(value || "").matchAll(/\d{4}/g)].map((match) => match[0]);
}

function kigaliYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Kigali", year: "numeric" }).format(date);
}

module.exports = { schoolBrief, termAliases, yearsIn, kigaliYear };
