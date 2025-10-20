import express from 'express'
import { Models as M } from '../db/mongo.js'

const r = express.Router()
const ok = (res, data)=> res.json(data)
const bad = (res, e)=> res.status(500).json({ error: e.message })

const ENT = {
  classes: M.Class,
  subjects: M.Subject,
  teachers: M.Teacher,
  rooms: M.Room,
  teacher_subjects: M.TeacherSubject,
  class_subjects: M.ClassSubject,
  availability_teacher: M.AvTeacher,
  availability_room: M.AvRoom,
  demand_forecast: M.Demand,
  penalties: M.Penalties,
}

const pick = (obj, keys)=> Object.fromEntries(Object.entries(obj).filter(([k])=>keys.includes(k)))

const FIELDS = {
  classes: ['code','section','size'],
  subjects: ['code','name','is_lab'],
  teachers: ['name','max_periods_per_day','max_periods_per_week'],
  rooms: ['code','capacity','is_lab'],
  teacher_subjects: ['teacher_id','subject_id'],
  class_subjects: ['class_id','subject_id'],
  availability_teacher: ['teacher_id','day','period','available'],
  availability_room: ['room_id','day','period','available'],
  demand_forecast: ['week_start','class_id','subject_id','periods_required','source'],
  penalties: ['teacher_gap','uneven_subject','room_mismatch','early_or_late'],
}

const TENANT = 'demo' // simple single-tenant; replace with auth/tenant if needed

r.get('/:entity', async (req,res)=>{
  try{
    const Model = ENT[req.params.entity]; if(!Model) return res.status(404).json({error:'unknown entity'})
    const { limit=100, offset=0, q, week_start } = req.query
    const filter = { tenant_slug: TENANT }
    if (Model === M.Demand && week_start) filter.week_start = String(week_start)
    if (q && Model.schema.paths.name) filter.name = { $regex: q, $options: 'i' }
    const rows = await Model.find(filter).limit(Number(limit)).skip(Number(offset)).lean()
    ok(res, { rows })
  } catch(e){ bad(res,e) }
})

r.get('/:entity/:id', async (req,res)=>{
  try{
    const Model = ENT[req.params.entity]; if(!Model) return res.status(404).json({error:'unknown entity'})
    const row = await Model.findOne({ _id:req.params.id, tenant_slug:TENANT }).lean()
    if (!row) return res.status(404).json({ error:'not found' })
    ok(res, { row })
  } catch(e){ bad(res,e) }
})

r.post('/:entity', async (req,res)=>{
  try{
    const Model = ENT[req.params.entity]; if(!Model) return res.status(404).json({error:'unknown entity'})
    const body = pick(req.body, FIELDS[req.params.entity] || [])
    const row = await Model.create({ tenant_slug: TENANT, ...body })
    ok(res, { ok:true, id: row._id, row })
  } catch(e){ bad(res,e) }
})

r.put('/:entity/:id', async (req,res)=>{
  try{
    const Model = ENT[req.params.entity]; if(!Model) return res.status(404).json({error:'unknown entity'})
    const body = pick(req.body, FIELDS[req.params.entity] || [])
    const row = await Model.findOneAndUpdate({ _id:req.params.id, tenant_slug:TENANT }, body, { new:true }).lean()
    ok(res, { ok:true, row })
  } catch(e){ bad(res,e) }
})

r.delete('/:entity/:id', async (req,res)=>{
  try{
    const Model = ENT[req.params.entity]; if(!Model) return res.status(404).json({error:'unknown entity'})
    await Model.deleteOne({ _id:req.params.id, tenant_slug:TENANT })
    ok(res, { ok:true })
  } catch(e){ bad(res,e) }
})

export default r
