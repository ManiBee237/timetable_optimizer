import express from 'express'
import { knex } from '../db/knex.js'
import { auth } from '../middleware/auth.js'
import { tenant } from '../middleware/tenant.js'

const r = express.Router()
const safe = (fn) => async (req,res,next)=>{ try{ await fn(req,res,next) }catch(e){ next(e) } }

// --- helpers ---
function pick(obj, keys){ const o = {}; keys.forEach(k=>{ if(obj[k]!==undefined) o[k]=obj[k] }); return o }
function ok(res, data){ res.json({ ok:true, ...data }) }

const TABLES = {
  classes:        { table:'classes',        fields:['code','section','size'] },
  subjects:       { table:'subjects',       fields:['code','name','is_lab'] },
  teachers:       { table:'teachers',       fields:['name','max_periods_per_day','max_periods_per_week'] },
  rooms:          { table:'rooms',          fields:['code','capacity','is_lab'] },
  teacher_subjects:{ table:'teacher_subjects', fields:['teacher_id','subject_id'] },
  class_subjects: { table:'class_subjects', fields:['class_id','subject_id'] },
  penalties:      { table:'penalties',      fields:['teacher_gap','uneven_subject','room_mismatch','early_or_late'] },

  // special (has week_start)
  demand_forecast:{ table:'demand_forecast', fields:['week_start','class_id','subject_id','periods_required','source'] },
  availability_teacher:{ table:'availability_teacher', fields:['teacher_id','day','period','available'] },
  availability_room:{ table:'availability_room', fields:['room_id','day','period','available'] },
}

// generic list
r.get('/:entity', auth, tenant, safe(async (req,res)=>{
  const cfg = TABLES[req.params.entity]
  if(!cfg) return res.status(404).json({ error:'unknown entity' })
  const { q, limit=100, offset=0, week_start } = req.query
  let qy = knex(cfg.table).where({ tenant_id:req.tenant.id })
  if (cfg.table==='demand_forecast' && week_start) qy = qy.andWhere({ week_start })
  if (q && cfg.fields.includes('name')) qy = qy.andWhere('name','like',`%${q}%`)
  const rows = await qy.limit(+limit).offset(+offset)
  ok(res, { rows })
}))

// read one
r.get('/:entity/:id', auth, tenant, safe(async (req,res)=>{
  const cfg = TABLES[req.params.entity]
  if(!cfg) return res.status(404).json({ error:'unknown entity' })
  const row = await knex(cfg.table).where({ tenant_id:req.tenant.id, id: req.params.id }).first()
  if(!row) return res.status(404).json({ error:'not found' })
  ok(res, { row })
}))

// create
r.post('/:entity', auth, tenant, safe(async (req,res)=>{
  const cfg = TABLES[req.params.entity]
  if(!cfg) return res.status(404).json({ error:'unknown entity' })
  const body = pick(req.body, cfg.fields)
  body.tenant_id = req.tenant.id
  const [id] = await knex(cfg.table).insert(body)
  const row = await knex(cfg.table).where({ id }).first()
  ok(res, { id, row })
}))

// update
r.put('/:entity/:id', auth, tenant, safe(async (req,res)=>{
  const cfg = TABLES[req.params.entity]
  if(!cfg) return res.status(404).json({ error:'unknown entity' })
  const body = pick(req.body, cfg.fields)
  await knex(cfg.table).where({ tenant_id:req.tenant.id, id: req.params.id }).update(body)
  const row = await knex(cfg.table).where({ id: req.params.id }).first()
  ok(res, { row })
}))

// delete
r.delete('/:entity/:id', auth, tenant, safe(async (req,res)=>{
  const cfg = TABLES[req.params.entity]
  if(!cfg) return res.status(404).json({ error:'unknown entity' })
  await knex(cfg.table).where({ tenant_id:req.tenant.id, id: req.params.id }).del()
  ok(res, {})
}))

export default r
