import { promises as fs } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '../../data')
const PERSIST = (process.env.PERSIST ?? '1') !== '0' // set PERSIST=0 for pure in-memory

const DEFAULT_DATA = {
  tenants: [{ slug: 'demo', name: 'Demo School' }],
  classes: [],
  subjects: [],
  teachers: [],
  rooms: [],
  teacher_subjects: [],
  class_subjects: [],
  availability_teacher: [],
  availability_room: [],
  demand_forecast: [],
  penalties: [{ tenant_slug: 'demo', teacher_gap: 3, uneven_subject: 2, room_mismatch: 4, early_or_late: 1 }],
  hard_locks: [],
  timetable: []
}

const files = Object.fromEntries(Object.keys(DEFAULT_DATA).map(k => [k, `${k}.json`]))
let mem = null

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true })
}

async function loadAll() {
  await ensureDir()
  const state = {}
  for (const [key, fname] of Object.entries(files)) {
    const fpath = path.join(DATA_DIR, fname)
    try {
      const s = await fs.readFile(fpath, 'utf8')
      state[key] = JSON.parse(s)
    } catch {
      state[key] = structuredClone(DEFAULT_DATA[key])
      if (PERSIST) await fs.writeFile(fpath, JSON.stringify(state[key], null, 2))
    }
  }
  mem = state
}

async function save(key) {
  if (!PERSIST) return
  const fpath = path.join(DATA_DIR, files[key])
  await fs.writeFile(fpath, JSON.stringify(mem[key], null, 2))
}

function id() {
  // simple string id; works fine for frontend/ML after normalization
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export async function initStore() {
  if (!mem) await loadAll()
  return mem
}

export function getState() {
  if (!mem) throw new Error('Store not initialized. Call initStore() first.')
  return mem
}

export async function insert(key, row) {
  const st = getState()
  const withId = { id: row.id || id(), ...row }
  st[key].push(withId)
  await save(key)
  return withId
}

export async function upsert(key, where, patch = {}) {
  const st = getState()
  const idx = st[key].findIndex(r => Object.entries(where).every(([k, v]) => String(r[k]) === String(v)))
  if (idx === -1) {
    const newRow = { id: id(), ...where, ...patch }
    st[key].push(newRow)
    await save(key)
    return newRow
  } else {
    st[key][idx] = { ...st[key][idx], ...patch }
    await save(key)
    return st[key][idx]
  }
}

export async function update(key, where, patch) {
  const st = getState()
  let count = 0
  st[key] = st[key].map(r => {
    if (Object.entries(where).every(([k, v]) => String(r[k]) === String(v))) {
      count++; return { ...r, ...patch }
    }
    return r
  })
  await save(key)
  return count
}

export async function remove(key, where) {
  const st = getState()
  const before = st[key].length
  st[key] = st[key].filter(r => !Object.entries(where).every(([k, v]) => String(r[k]) === String(v)))
  await save(key)
  return before - st[key].length
}
