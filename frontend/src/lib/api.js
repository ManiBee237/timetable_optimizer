export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:4000'
export const api = (p) => `${API_BASE}${p.startsWith('/')? '' : '/'}${p}`

async function parseJsonOrThrow(res){
  const text = await res.text()
  try { return JSON.parse(text) } catch {
    throw new Error(`HTTP ${res.status} – Non-JSON response: ${text.slice(0,200)}...`)
  }
}

export async function jget(path){ const res = await fetch(api(path)); return parseJsonOrThrow(res) }
export async function jpost(path, body=null, method='POST'){
  const res = await fetch(api(path), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body===null ? null : JSON.stringify(body)
  })
  return parseJsonOrThrow(res)
}
