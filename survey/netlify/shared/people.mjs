// The people the admin has given a passcode to. Stored in Netlify Blobs; only the PBKDF2 hash is kept, never the passcode.
//   p/<id>  -> { id, name, salt, hash, iter, ver, created, updatedAt }
//   n/<key> -> id        (one entry per name, so a name can be looked up in two reads and cannot be used twice)
import { hashPasscode, randomId } from "./auth.mjs";

let override = null;
export const setStore = (s) => { override = s; };   // tests supply an in-memory store
async function store() {
  if (override) return override;
  const { getStore } = await import("@netlify/blobs");
  return getStore({ name: "people", consistency: "strong" });   // strong: the admin sees their own edits at once
}

export const MAX_PEOPLE = 500;
export const MAX_NAME = 40;
export const cleanName = (n) => String(n ?? "").normalize("NFKC").replace(/\s+/g, " ").trim();
export const validName = (n) => n.length >= 1 && n.length <= MAX_NAME && !/\p{Cc}/u.test(n);
const nameKey = (n) => `n/${btoa(String.fromCharCode(...new TextEncoder().encode(cleanName(n).toLowerCase()))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}`;

export const publicView = (r) => ({ id: r.id, name: r.name, created: r.created, updatedAt: r.updatedAt });   // never a hash or salt

export async function listPeople() {
  const s = await store();
  const { blobs } = await s.list({ prefix: "p/" });
  const items = await Promise.all(blobs.map((b) => s.get(b.key, { type: "json" })));
  return items.filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
export async function getPerson(id) {
  if (!/^[A-Za-z0-9_-]{6,40}$/.test(String(id))) return null;
  return (await (await store()).get(`p/${id}`, { type: "json" })) || null;
}
export async function findByName(name) {
  const s = await store();
  const id = await s.get(nameKey(name), { type: "text" });
  return id ? getPerson(id) : null;
}
// returns the new record, or { error } for a bad or repeated name
export async function createPerson(name, passcode) {
  name = cleanName(name);
  if (!validName(name)) return { error: "Enter a name of 1 to 40 characters." };
  const s = await store();
  if ((await s.list({ prefix: "p/" })).blobs.length >= MAX_PEOPLE) return { error: "That is as many people as this list holds." };
  const id = randomId(), now = new Date().toISOString(), key = nameKey(name);
  const rec = { id, name, ...(await hashPasscode(passcode)), ver: randomId(), created: now, updatedAt: now };
  // The record is written FIRST and the name claimed SECOND, and removal deletes the name FIRST and the record SECOND, so a name key
  // never points at a record that does not exist. That is what makes the claim safe under races: whoever loses the atomic claim
  // simply takes their own record back. (A crash between the two writes leaves a record nobody can sign in to; it shows in the list and can be removed.)
  await s.setJSON(`p/${id}`, rec);
  try {
    const claimed = await s.set(key, id, { onlyIfNew: true });   // atomic: two admins cannot both take one name
    if (claimed && claimed.modified === false) { await s.delete(`p/${id}`); return { error: "That name is already in the list." }; }
  } catch (e) { try { await s.delete(`p/${id}`); } catch { /* an unclaimed record cannot be signed in to */ } throw e; }
  return rec;
}
// a new passcode: the old one stops working and any session made with it ends
export async function resetPasscode(id, passcode) {
  const s = await store(), rec = await getPerson(id);
  if (!rec || (await s.get(nameKey(rec.name), { type: "text" })) !== id) return null;   // gone, or a leftover record: do not bring it back
  const next = { ...rec, ...(await hashPasscode(passcode)), ver: randomId(), updatedAt: new Date().toISOString() };
  await s.setJSON(`p/${id}`, next);
  return next;
}
export async function removePerson(id) {
  const s = await store(), rec = await getPerson(id);
  if (!rec) return false;
  // the name first, then the record: if the second step fails the person is left unable to sign in (and still listed, so it can be retried), never a name that is blocked
  if ((await s.get(nameKey(rec.name), { type: "text" })) === id) await s.delete(nameKey(rec.name));   // only our own name key, never another person's
  await s.delete(`p/${id}`);
  return true;
}
