import { t } from "./i18n.js";

const listeners = new Set();
let busyCount = 0;

function emit(item) {
  listeners.forEach((listener) => listener(item));
}

export function notify(title, body, tone = "ok") {
  emit({ kind: "note", id: Date.now() + Math.random(), title: t(title), body: body ? t(body) : body, tone });
}

export function track(promise) {
  busyCount += 1;
  emit({ kind: "busy", busy: true });
  return Promise.resolve(promise).finally(() => {
    busyCount = Math.max(0, busyCount - 1);
    emit({ kind: "busy", busy: busyCount > 0 });
  });
}

export function subscribeNotice(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function act(task, title, body) {
  try {
    const value = await track(Promise.resolve().then(task));
    if (title) notify(title, body || "Done.");
    return value === undefined ? true : value;
  } catch (err) {
    notify("Not completed", err instanceof Error ? err.message : "Something went wrong", "bad");
    return null;
  }
}
