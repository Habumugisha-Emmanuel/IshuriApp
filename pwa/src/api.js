const API = import.meta.env.VITE_API_URL || "https://ishuriapp.onrender.com/api";

export async function api(path, { token, method = "GET", body, form } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else {
    headers["Content-Type"] = "application/json";
    if (body !== undefined) payload = JSON.stringify(body);
  }
  const response = await fetch(`${API}${path}`, { method, headers, body: payload });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const extra = Array.isArray(data.details) ? data.details.filter(Boolean).join(". ") : "";
    throw new Error(extra ? `${data.message || "The request did not complete"}. ${extra}` : data.message || "The request did not complete");
  }
  return data;
}

export async function uploadFile(token, folder, file) {
  const form = new FormData();
  form.append("file", file);
  return api(`/uploads?folder=${encodeURIComponent(folder)}`, { token, method: "POST", form });
}

export function media(url) {
  if (!url) return "";
  if (url.startsWith("http")) return url;
  return `https://ishuriapp.onrender.com${url}`;
}
