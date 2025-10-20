import express from 'express'
import { getState, insert, upsert, update, remove } from '../store/fileStore.js'

const router = express.Router()
const TENANT = 'demo'

const ENTITIES = [
  'classes','subjects','teachers','rooms',
  'teacher_subjects','class_subjects',
  'availability_teacher','availability_room',
  'demand_forecast','penalties'
]

router.get('/:entity', (req,res)=>{
  const { entity } = req.params
  if (!ENTITIES.includes(entity)) return res.status(404).json({ error:'unknown entity' })
  const st = getState()
  const { limit=1000, offset=0, q, week_start } = req.query
  let rows = st[entity].filter(x => (x.tenant_slug || 'demo') === TENANT)
  if (week_start && entity === 'demand_forecast') rows = rows.filter(x => x.week_start === String(week_start))
  if (q && rows.length && 'name' in rows[0]) rows = rows.filter(x => String(x.name||'').toLowerCase().includes(String(q).toLowerCase()))
  res.json({ rows: rows.slice(Number(offset), Number(offset)+Number(limit)) })
})

router.get('/:entity/:id', (req,res)=>{
  const { entity, id } = req.params
  const st = getState()
  const row = (st[entity]||[]).find(r => String(r.id) === String(id))
  if (!row) return res.status(404).json({ error:'not found' })
  res.json({ row })
})

router.post('/:entity', async (req,res)=>{
  const { entity } = req.params
  const body = { tenant_slug: TENANT, ...req.body }
  const row = await insert(entity, body)
  res.json({ ok:true, id: row.id, row })
})

router.put('/:entity/:id', async (req,res)=>{
  const { entity, id } = req.params
  const st = getState()
  const row = st[entity].find(r => String(r.id) === String(id))
  if (!row) return res.status(404).json({ error:'not found' })
  await update(entity, { id }, req.body)
  const updated = st[entity].find(r => String(r.id) === String(id))
  res.json({ ok:true, row: updated })
})

router.delete('/:entity/:id', async (req,res)=>{
  const { entity, id } = req.params
  await remove(entity, { id })
  res.json({ ok:true })
})

export default router
