import express from 'express'
import axios from 'axios'
import { Models as M } from '../db/mongo.js'

const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5000'
const TENANT = 'demo'
const router = express.Router()
const safe = (fn)=> async (req,res)=>{ try{ await fn(req,res) }catch(e){ console.error('[API ERROR]', e); res.status(500).json({ error: e.message }) } }

// ---------- Ensure weekly demand is complete ----------
async function ensureDemandForWeek(week_start){
  const classes  = await M.Class.find({ tenant_slug:TENANT }).lean()
  const subjects = await M.Subject.find({ tenant_slug:TENANT }).lean()
  const cur      = await M.Demand.find({ tenant_slug:TENANT, week_start }).lean()
  const have = new Set(cur.map(r=> `${r.class_id}:${r.subject_id}`))

  const cs = await M.ClassSubject.find({ tenant_slug:TENANT }).lean()
  const listByClass = new Map()
  for (const r of cs) {
    const k = String(r.class_id)
    const arr = listByClass.get(k) || []
    arr.push(String(r.subject_id))
    listByClass.set(k, arr)
  }

  const toInsert=[]
  for (const c of classes){
    const subjIds = listByClass.get(String(c._id)) || subjects.map(s=> String(s._id))
    for (const sid of subjIds){
      const key = `${c._id}:${sid}`; if (have.has(key)) continue
      const subj = subjects.find(s=> String(s._id)===sid)
      toInsert.push({
        tenant_slug: TENANT,
        week_start,
        class_id: c._id,
        subject_id: subj._id,
        periods_required: subj?.is_lab ? 2 : 5,
        source: 'manual'
      })
    }
  }
  if (toInsert.length) await M.Demand.insertMany(toInsert, { ordered:false })
  return M.Demand.find({ tenant_slug:TENANT, week_start }).lean()
}

// ---------- Routes ----------
router.get('/demand/forecast', safe(async (req,res)=>{
  const { week_start } = req.query
  if (!week_start) throw new Error('week_start required')
  const items = await ensureDemandForWeek(week_start)
  res.json({ week_start, items })
}))

router.post('/demand/forecast', safe(async (req,res)=>{
  const { week_start } = req.body
  if (!week_start) throw new Error('week_start required')
  const { data } = await axios.post(`${ML_URL}/demand/forecast`, { tenant: TENANT, week_start }).catch(()=>({data:{items:[]}}))
  const items = data?.items || []
  for (const x of items){
    await M.Demand.updateOne(
      { tenant_slug:TENANT, week_start, class_id:x.class_id, subject_id:x.subject_id },
      { $set: { periods_required:x.periods_required, source:'ml' } },
      { upsert: true }
    )
  }
  const ensured = await ensureDemandForWeek(week_start)
  res.json({ ok:true, week_start, count: ensured.length })
}))

// ---------- Normalized solve (ObjectId <-> dense ints) ----------
router.post('/optimize/solve', safe(async (req,res)=>{
  const { week_start, strict = true } = req.body
  if (!week_start) throw new Error('week_start required')

  const [
    classes, subjects, teachers, rooms, ts, cs, tAvail, rAvail, locks, penalties, demandPromise
  ] = await Promise.all([
    M.Class.find({ tenant_slug:TENANT }).lean(),
    M.Subject.find({ tenant_slug:TENANT }).lean(),
    M.Teacher.find({ tenant_slug:TENANT }).lean(),
    M.Room.find({ tenant_slug:TENANT }).lean(),
    M.TeacherSubject.find({ tenant_slug:TENANT }).lean(),
    M.ClassSubject.find({ tenant_slug:TENANT }).lean(),
    M.AvTeacher.find({ tenant_slug:TENANT }).lean(),
    M.AvRoom.find({ tenant_slug:TENANT }).lean(),
    M.Lock.find({ tenant_slug:TENANT, week_start }).lean(),
    (async ()=> (await M.Penalties.findOne({ tenant_slug:TENANT }).lean()) || {} )(),
    ensureDemandForWeek(week_start),
  ])

  function buildMap(docs){
    const toInt = new Map(), toObj = new Map(); let i=1
    for (const d of docs){ const k=String(d._id); toInt.set(k, i); toObj.set(i, d._id); i++ }
    return { toInt, toObj }
  }
  const CM = buildMap(classes)
  const SM = buildMap(subjects)
  const TM = buildMap(teachers)
  const RM = buildMap(rooms)

  const nClasses  = classes.map(c => ({ id: CM.toInt.get(String(c._id)), code:c.code, section:c.section, size:c.size }))
  const nSubjects = subjects.map(s => ({ id: SM.toInt.get(String(s._id)), code:s.code, name:s.name, is_lab: s.is_lab?1:0 }))
  const nTeachers = teachers.map(t => ({ id: TM.toInt.get(String(t._id)), name:t.name, max_periods_per_day:t.max_periods_per_day, max_periods_per_week:t.max_periods_per_week }))
  const nRooms    = rooms.map(r => ({ id: RM.toInt.get(String(r._id)), code:r.code, capacity:r.capacity, is_lab:r.is_lab?1:0 }))

  const nTS = ts.map(x => ({ teacher_id: TM.toInt.get(String(x.teacher_id)), subject_id: SM.toInt.get(String(x.subject_id)) }))
  const nCS = cs.map(x => ({ class_id: CM.toInt.get(String(x.class_id)),   subject_id: SM.toInt.get(String(x.subject_id)) }))
  const nTA = tAvail.map(x => ({ teacher_id: TM.toInt.get(String(x.teacher_id)), day:x.day, period:x.period, available: x.available?1:0 }))
  const nRA = rAvail.map(x => ({ room_id:    RM.toInt.get(String(x.room_id)),     day:x.day, period:x.period, available: x.available?1:0 }))
  const nLocks = locks.map(x => ({
    class_id: CM.toInt.get(String(x.class_id)),
    subject_id: SM.toInt.get(String(x.subject_id)),
    teacher_id: TM.toInt.get(String(x.teacher_id)),
    room_id: RM.toInt.get(String(x.room_id)),
    day:x.day, period:x.period
  }))
  const demand = await demandPromise
  const nDemand = demand.map(x => ({
    class_id: CM.toInt.get(String(x.class_id)),
    subject_id: SM.toInt.get(String(x.subject_id)),
    periods_required: x.periods_required
  }))

  const payload = {
    tenant: TENANT, week_start, strict,
    classes: nClasses, subjects: nSubjects, teachers: nTeachers, rooms: nRooms,
    teacher_subjects: nTS, class_subjects: nCS,
    availability_teacher: nTA, availability_room: nRA,
    demand: nDemand, locks: nLocks, penalties
  }

  const { data } = await axios.post(`${ML_URL}/optimize/solve`, payload, { timeout: 120000 })
  const sid = data.solution_id
  if (!sid) return res.json({ ok:false, message:'No feasible solution', solution_id:null })

  await M.Timetable.deleteMany({ tenant_slug:TENANT, week_start, solution_id: sid })
  if (Array.isArray(data.assignments) && data.assignments.length){
    const docs = data.assignments.map(a => ({
      tenant_slug:TENANT, solution_id:sid, week_start,
      class_id:   CM.toObj.get(a.class_id),
      subject_id: SM.toObj.get(a.subject_id),
      teacher_id: TM.toObj.get(a.teacher_id),
      room_id:    RM.toObj.get(a.room_id),
      day:a.day, period:a.period, hard_lock: a.hard_lock?1:0
    }))
    await M.Timetable.insertMany(docs, { ordered:false })
  }

  res.json({ ok:true, week_start, solution_id: sid, objective: data.objective })
}))

router.get('/optimize/solution/:id', safe(async (req,res)=>{
  const rows = await M.Timetable.find({ tenant_slug:TENANT, solution_id:req.params.id }).sort({ day:1, period:1 }).lean()
  if (!rows.length) return res.json({ rows: [] })
  const [classes, subjects, teachers, rooms] = await Promise.all([
    M.Class.find({ tenant_slug:TENANT }).lean(),
    M.Subject.find({ tenant_slug:TENANT }).lean(),
    M.Teacher.find({ tenant_slug:TENANT }).lean(),
    M.Room.find({ tenant_slug:TENANT }).lean(),
  ])
  const classMap = new Map(classes.map(c=>[String(c._id), c]))
  const subjMap  = new Map(subjects.map(s=>[String(s._id), s]))
  const teachMap = new Map(teachers.map(t=>[String(t._id), t]))
  const roomMap  = new Map(rooms.map(r=>[String(r._id), r]))

  const enriched = rows.map(r=>{
    const subj=subjMap.get(String(r.subject_id)), room=roomMap.get(String(r.room_id))
    const c = classMap.get(String(r.class_id))
    const why = []
    if (r.hard_lock) why.push('Locked by user; solver kept this slot.')
    if (subj?.is_lab) why.push(room?.is_lab ? 'Lab subject scheduled in lab room (preferred).' : 'Lab subject in non-lab room (penalized).')
    why.push('No teacher/room/class conflicts at this slot.')
    why.push('Soft penalties minimized (gaps, lab mismatch).')
    return {
      ...r,
      class_label: `${c?.code}-${c?.section}`,
      subject_label: subj?.name || `Subject`,
      teacher_name: teachMap.get(String(r.teacher_id))?.name || `Teacher`,
      room_label: room?.code || `Room`,
      is_lab: !!subj?.is_lab, room_is_lab: !!room?.is_lab, why
    }
  })
  res.json({ rows: enriched })
}))

router.post('/optimize/lock', safe(async (req,res)=>{
  const { week_start, class_id, subject_id, teacher_id, room_id, day, period } = req.body
  await M.Lock.create({ tenant_slug:TENANT, week_start, class_id, subject_id, teacher_id, room_id, day, period })
  res.json({ ok:true })
}))

export default router
