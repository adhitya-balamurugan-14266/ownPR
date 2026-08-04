import { addDefaultAppHeaders } from '@zcatalyst/auth-client';

const API_BASE = import.meta.env.VITE_API_BASE || '/server/pr_trail_api/execute';

async function authHeaders() {
  return addDefaultAppHeaders({ 'Content-Type': 'application/json' });
}

async function apiFetch(path, options = {}) {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
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
