// What a till remembers between visits — a slab's open/shut state, the cards
// or Records recently opened on it.
//
// Per TILL, not per employee: this is the machine at the counter, the same way
// the till rail's own open/shut state is (E-05 d30). A shop that works with a
// slab open should not have to fight it every time someone walks up.
//
// Every read and write is guarded: in a private window, or with site data
// blocked, the accessor itself throws. Forgetting is an acceptable outcome
// here — the slab just opens at its default — so nothing surfaces the failure.

export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    /* private window, or site data blocked — the slab just forgets */
    return fallback;
  }
}

export function writeStored(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do — forgetting is an acceptable outcome here */
  }
}
