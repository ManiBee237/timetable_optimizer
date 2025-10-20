import express from 'express'
import axios from 'axios'
import { knex } from '../db/knex.js'
import { auth } from '../middleware/auth.js'
import { tenant } from '../middleware/tenant.js'
import { weekStartMonday } from '../utils/date.js' // if you added earlier; otherwise replace with a no-op passthrough

const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5000'
const router = express.Router()
const safe = (fn) => async (req,res,next)=>{ try { await fn(req,res,next) } catch (e) { next(e) } }

// --- helpers ---
async function ensureDemandForWeek(tenantId, week_start) {
  // what already exists for this week
  const existing = await knex('demand_forecast').where({ tenant_id: tenantId, week_start })
  const have = new Set(existing.map(r => `${r.class_id}:${r.subject_id}`))

  // curriculum pairs (class, subject, is_lab) — if none for a class, fall back to core subjects
  const coreSubs = await knex('subjects').where({ tenant_id: tenantId }).whereIn('code', ['MATH','SCI','ENG','SOC','LANG','COMP'])
  const coreById = new Map(coreSubs.map(s => [s.id, s]))
  const classes = await knex('classes').where({ tenant_id: tenantId })

  // get existing class->subject map
  const csRows = await knex('class_subjects as cs')
    .join('subjects as s', function() {
      this.on('cs.subject_id','=','s.id').andOn('cs.tenant_id','=','s.tenant_id')
    })
    .where('cs.tenant_id', tenantId)
    .select('cs.class_id','cs.subject_id','s.is_lab')

  const byClass = new Map()
  for (const r of csRows) {
    if (!byClass.has(r.class_id)) byClass.set(r.class_id, [])
    byClass.get(r.class_id).push({ subject_id: r.subject_id, is_lab: r.is_lab })
  }

  // build the to-insert list
  const todo = []
  for (const c of classes) {
    const list = byClass.get(c.id) ?? coreSubs.map(s => ({ subject_id: s.id, is_lab: s.is_lab }))
    for (const {subject_id, is_lab} of list) {
      const key = `${c.id}:${subject_id}`
      if (have.has(key)) continue
      todo.push({
        tenant_id: tenantId,
        week_start,
        class_id: c.id,
        subject_id,
        periods_required: is_lab ? 2 : 5,
        source: 'manual'
      })
    }
  }

  if (todo.length) await knex.batchInsert('demand_forecast', todo)
  return knex('demand_forecast').where({ tenant_id: tenantId, week_start })
}



function labelClass(c){ return c ? `${c.code}-${c.section}` : `Class ${c?.id ?? ''}` }

// --- routes ---
router.get('/demand/forecast', auth, tenant, safe(async (req,res)=>{
  const inputDate = req.query.week_start
  if (!inputDate) throw new Error('week_start is required')
  const week_start = weekStartMonday ? weekStartMonday(inputDate) : inputDate
  const items = await ensureDemandForWeek(req.tenant.id, week_start)
  res.json({ week_start, items })
}))

router.post('/demand/forecast', auth, tenant, safe(async (req,res)=>{
  const inputDate = req.body.week_start
  if (!inputDate) throw new Error('week_start is required')
  const week_start = weekStartMonday ? weekStartMonday(inputDate) : inputDate
  const { data } = await axios.post(`${ML_URL}/demand/forecast`, { tenant: req.tenant.slug, week_start }).catch(()=>({ data:{items:[]} }))
  const items = data?.items || []
  for (const x of items) {
    const [ex] = await knex('demand_forecast').where({ tenant_id:req.tenant.id, week_start, class_id:x.class_id, subject_id:x.subject_id })
    if (ex) await knex('demand_forecast').where({ id: ex.id }).update({ periods_required: x.periods_required, source:'ml' })
    else await knex('demand_forecast').insert({ tenant_id:req.tenant.id, week_start, class_id:x.class_id, subject_id:x.subject_id, periods_required:x.periods_required, source:'ml' })
  }
  const ensured = await ensureDemandForWeek(req.tenant.id, week_start)
  res.json({ ok:true, week_start, count: ensured.length, items: ensured })
}))

router.post('/optimize/solve', auth, tenant, safe(async (req,res)=>{
  const inputDate = req.body.week_start
  if (!inputDate) throw new Error('week_start is required')
  const week_start = weekStartMonday ? weekStartMonday(inputDate) : inputDate
  const strict = req.body.strict ?? true

  const demand = await ensureDemandForWeek(req.tenant.id, week_start)
  const [classes, subjects, teachers, rooms, ts, cs, tAvail, rAvail, locks, penalties] = await Promise.all([
    knex('classes').where({tenant_id:req.tenant.id}),
    knex('subjects').where({tenant_id:req.tenant.id}),
    knex('teachers').where({tenant_id:req.tenant.id}),
    knex('rooms').where({tenant_id:req.tenant.id}),
    knex('teacher_subjects').where({tenant_id:req.tenant.id}),
    knex('class_subjects').where({tenant_id:req.tenant.id}),
    knex('availability_teacher').where({tenant_id:req.tenant.id}),
    knex('availability_room').where({tenant_id:req.tenant.id}),
    knex('hard_locks').where({tenant_id:req.tenant.id, week_start}),
    knex('penalties').where({tenant_id:req.tenant.id}).first()
  ])

  const { data } = await axios.post(`${ML_URL}/optimize/solve`, {
    tenant: req.tenant.slug, week_start, strict,
    classes, subjects, teachers, rooms,
    teacher_subjects: ts, class_subjects: cs,
    availability_teacher: tAvail, availability_room: rAvail,
    demand, locks, penalties: penalties || {}
  }, { timeout: 120000 })

  const sid = data.solution_id
  if(!sid) return res.json({ ok:false, message:'No feasible solution', solution_id:null })

  await knex('timetable').where({ tenant_id:req.tenant.id, week_start, solution_id: sid }).del()
  if(data.assignments?.length){
    const rows = data.assignments.map(a => ({
      tenant_id: req.tenant.id, solution_id: sid, week_start,
      class_id: a.class_id, subject_id: a.subject_id, teacher_id: a.teacher_id,
      room_id: a.room_id, day: a.day, period: a.period, hard_lock: a.hard_lock?1:0
    }))
    await knex.batchInsert('timetable', rows)
  }
  res.json({ ok:true, week_start, solution_id: sid, objective: data.objective })
}))

// ✨ Enriched solution: names + “why” explanation
router.get('/optimize/solution/:id', auth, tenant, safe(async (req,res)=>{
  const rows = await knex('timetable')
    .where({ tenant_id:req.tenant.id, solution_id: req.params.id })
    .orderBy([{column:'day'},{column:'period'},{column:'class_id'}])

  if (!rows.length) return res.json({ rows: [] })

  // load maps for labels
  const [classes, subjects, teachers, rooms] = await Promise.all([
    knex('classes').where({tenant_id:req.tenant.id}),
    knex('subjects').where({tenant_id:req.tenant.id}),
    knex('teachers').where({tenant_id:req.tenant.id}),
    knex('rooms').where({tenant_id:req.tenant.id})
  ])
  const classMap = new Map(classes.map(c => [c.id, c]))
  const subjMap  = new Map(subjects.map(s => [s.id, s]))
  const teachMap = new Map(teachers.map(t => [t.id, t]))
  const roomMap  = new Map(rooms.map(r => [r.id, r]))

  // quick helper to explain choices (thought process)
  function explain(r){
    const notes = []
    const subj = subjMap.get(r.subject_id)
    const room = roomMap.get(r.room_id)
    if (r.hard_lock) notes.push('Locked by user; solver kept this slot.')
    if (subj?.is_lab){
      if (room?.is_lab) notes.push('Lab subject scheduled in a lab room (preferred).')
      else notes.push('Lab subject placed in non-lab room (penalized but allowed).')
    }
    notes.push('Teacher/room/class conflicts avoided at this slot.')
    notes.push('Solver minimized soft penalties (teacher gaps, lab mismatches).')
    return notes
  }

  const enriched = rows.map(r => ({
    ...r,
    class_label: labelClass(classMap.get(r.class_id)),
    subject_label: subjMap.get(r.subject_id)?.name || `Subject ${r.subject_id}`,
    teacher_name: teachMap.get(r.teacher_id)?.name || `Teacher ${r.teacher_id}`,
    room_label: roomMap.get(r.room_id)?.code || `Room ${r.room_id}`,
    is_lab: !!subjMap.get(r.subject_id)?.is_lab,
    room_is_lab: !!roomMap.get(r.room_id)?.is_lab,
    why: explain(r)
  }))

  res.json({ rows: enriched })
}))

router.post('/optimize/lock', auth, tenant, safe(async (req,res)=>{
  const inputDate = req.body.week_start
  if (!inputDate) throw new Error('week_start is required')
  const week_start = weekStartMonday ? weekStartMonday(inputDate) : inputDate
  const { class_id, subject_id, teacher_id, room_id, day, period } = req.body
  if (![class_id,subject_id,teacher_id,room_id].every(Boolean))
    throw new Error('lock fields required')
  await knex('hard_locks').insert({ tenant_id:req.tenant.id, week_start, class_id, subject_id, teacher_id, room_id, day, period })
  res.json({ ok:true })
}))

export default router
