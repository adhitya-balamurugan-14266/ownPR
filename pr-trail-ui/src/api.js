import { addDefaultAppHeaders } from '@zcatalyst/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/server/pr_trail_api/execute';

const REQUEST_TIMEOUT_MS = 20000;

function readCookie(name) {
  for (const part of document.cookie.split(';')) {
    const idx = part.indexOf('=');
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return '';
}

// The API is called on Slate's own domain (/server/...). Slate forwards it to the
// function when the Catalyst app headers are present, and the login cookie goes
// along with it, so no cross-domain token (generateAuthToken) is needed.
function authHeaders() {
  const headers = addDefaultAppHeaders({ 'Content-Type': 'application/json' });
  // Never send an empty CSRF value: Catalyst rejects "zd_csrparam=" with PATTERN_NOT_MATCHED
  const csrf = readCookie('ZD_CSRF_TOKEN');
  if (csrf) headers['X-ZCSRF-TOKEN'] = `zd_csrparam=${csrf}`;
  return headers;
}

async function apiFetch(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: authHeaders(),
      credentials: 'include',
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('The server took too long to respond. Please try again.');
    throw new Error(`Couldn't reach the server (${err.message}).`);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) throw new Error('Session expired: tap Log out and sign in again.');
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export function signOut() {
  window.catalyst?.auth?.signOut(window.location.origin);
}

export async function createLog(log_date, body_part, preworkout_taken, preworkout_qty) {
  return apiFetch('/log', {
    method: 'POST',
    body: JSON.stringify({ log_date, body_part, preworkout_taken, preworkout_qty })
  });
}

export async function addEntry(log_id, exercise_name, set_number, reps, weight) {
  return apiFetch('/entry', {
    method: 'POST',
    body: JSON.stringify({ log_id, exercise_name, set_number, reps, weight })
  });
}

export async function fetchLogs() {
  return apiFetch('/logs');
}

export async function fetchEntries(logId) {
  return apiFetch(`/log/${logId}/entries`);
}

export async function closeLog(logId, bcaa_taken, bcaa_qty) {
  return apiFetch(`/log/${logId}/close`, {
    method: 'PUT',
    body: JSON.stringify({ bcaa_taken, bcaa_qty })
  });
}

export async function deleteLog(logId) {
  return apiFetch(`/log/${logId}`, { method: 'DELETE' });
}

export async function updateEntry(entryId, exercise_name, set_number, reps, weight) {
  return apiFetch(`/entry/${entryId}`, {
    method: 'PUT',
    body: JSON.stringify({ exercise_name, set_number, reps, weight })
  });
}

export async function deleteEntry(entryId) {
  return apiFetch(`/entry/${entryId}`, { method: 'DELETE' });
}

export async function fetchExercises() {
  return apiFetch('/exercises');
}

export async function fetchPRs() {
  return apiFetch('/prs');
}

export async function backfillPRs() {
  return apiFetch('/backfill-prs', { method: 'POST' });
}

export async function fetchCurrentPRs() {
  return apiFetch('/current-prs');
}

export async function exportAllData() {
  return apiFetch('/export');
}
