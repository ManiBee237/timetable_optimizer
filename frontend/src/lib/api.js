// frontend/src/lib/api.js

export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api';

function joinUrl(base, p) {
  let b = String(base || '').replace(/\/+$/, '');
  let s = String(p || '').replace(/^\/+/, '');
  if (b.endsWith('/api') && s.startsWith('api/')) s = s.slice(4);
  return `${b}/${s}`;
}

async function handleResponse(res) {
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch {}
  if (!res.ok) {
    const msg = data?.detail || data?.message || text.slice(0,200);
    throw new Error(`HTTP ${res.status} – ${msg}`);
  }
  return data ?? {};
}

export async function jget(path) {
  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, { credentials: 'include' });
  return handleResponse(res);
}

export async function jpost(path, body = null, method = 'POST') {
  const url = joinUrl(API_BASE, path);
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body === null ? null : JSON.stringify(body),
  });
  return handleResponse(res);
}
