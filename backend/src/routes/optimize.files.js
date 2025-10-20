import express from 'express'
import axios from 'axios'
import { getState, upsert } from '../store/fileStore.js'

const router = express.Router()
const ML_URL = process.env.ML_URL || 'http://127.0.0.1:5000'
const TENANT = 'demo'
const DAYS = 5, PERIODS = 8

function ensureDemandForWeek(week_start) {
  const st = getState()
  const classes  = st.classes.filter(x => (x.tenant_slug||'demo')===TENANT)
  const subjects = st.subjects.filter(x => (x.tenant_slug||'demo')===TENANT)
  const cs = st.class_subjects.filter(x => x.tenant_slug===TENANT)
  const have = new Set(
    st.demand_forecast.filter(x => x.tenant_slug===TENANT && x.week_start===week_start)
      .map(r => `${r.class_id}:${r.subject_id}`)
  )

  const byClass = new Map()
  for (const r of cs) {
    const arr = byClass.get(r.class_id) || []
    arr.push(r.subject_id)
    byClass.set(r.class_id, arr)
  }

  const inserts = []
  for (const c of classes) {
    const subjIds = byClass.get(c.id) || subjects.map(s => s.id)
    for (const sid of subjIds) {
      const key = `${c.id}:${sid}`; if (have.has(key)) continue
      const s = subjects.find(x => x.id === sid)
      inserts.push(upsert('demand_forecast',
        { tenant_slug:TENANT, week_start, class_id:c.id, subject_id:sid },
        { periods_required: s?.is_lab ? 2 : 5, source: 'manual' }
      ))
    }
  }
  return Promise.all(inserts)
}

router.get('/demand/forecast', async (req,res)=>{
  const { week_start } = req.query
  if (!week_start) return res.status(400).json({ error:'week_start required' })
  await ensureDemandForWeek(String(week_start))
  const st = getState()
  const items = st.demand_forecast.filter(x => x.tenant_slug===TENANT && x.week_start===String(week_start))
  res.json({ week_start, items })
})

router.post('/demand/forecast', async (req,res)=>{
  const { week_start } = req.body
  if (!week_start) return res.status(400).json({ error:'week_start required' })
  const { data } = await axios.post(`${ML_URL}/demand/forecast`, { tenant:TENANT, week_start }).catch(()=>({data:{items:[]}}))
  const items = data?.items || []
  for (const x of items) {
    await upsert('demand_forecast',
      { tenant_slug:TENANT, week_start, class_id:x.class_id, subject_id:x.subject_id },
      { periods_required:x.periods_required, source:'ml' }
    )
  }
  await ensureDemandForWeek(String(week_start))
  const st = getState()
  const ensured = st.demand_forecast.filter(x => x.tenant_slug===TENANT && x.week_start===String(week_start))
  res.json({ ok:true, week_start, count: ensured.length })
})

router.post('/optimize/solve', async (req,res)=>{
  const { week_start, strict=true } = req.body
  if (!week_start) return res.status(400).json({ error:'week_start required' })
  const st = getState()

  // Build dense integer maps
  const classes  = st.classes.filter(x => x.tenant_slug===TENANT)
  const subjects = st.subjects.filter(x => x.tenant_slug===TENANT)
  const teachers = st.teachers.filter(x => x.tenant_slug===TENANT)
  const rooms    = st.rooms.filter(x => x.tenant_slug===TENANT)

  const idx = arr => {
    const map = new Map(), rev = new Map()
    let i=1; for (const r of arr){ map.set(String(r.id), i); rev.set(i, r.id); i++ }
    return { map, rev }
  }
  const CM = idx(classes), SM = idx(subjects), TM = idx(teachers), RM = idx(rooms)

  const nClasses  = classes.map(c => ({ id: CM.map.get(String(c.id)), code:c.code, section:c.section, size:c.size }))
  const nSubjects = subjects.map(s => ({ id: SM.map.get(String(s.id)), code:s.code, name:s.name, is_lab: s.is_lab?1:0 }))
  const nTeachers = teachers.map(t => ({ id: TM.map.get(String(t.id)), name:t.name, max_periods_per_day:t.max_periods_per_day||5, max_periods_per_week:t.max_periods_per_week||28 }))
  const nRooms    = rooms.map(r => ({ id: RM.map.get(String(r.id)), code:r.code, capacity:r.capacity, is_lab: r.is_lab?1:0 }))

  const nTS = st.teacher_subjects.filter(x=>x.tenant_slug===TENANT).map(x => ({
    teacher_id: TM.map.get(String(x.teacher_id)),
    subject_id: SM.map.get(String(x.subject_id))
  }))
  const nCS = st.class_subjects.filter(x=>x.tenant_slug===TENANT).map(x => ({
    class_id: CM.map.get(String(x.class_id)),
    subject_id: SM.map.get(String(x.subject_id))
  }))
  const nTA = st.availability_teacher.filter(x=>x.tenant_slug===TENANT).map(x => ({
    teacher_id: TM.map.get(String(x.teacher_id)),
    day:x.day, period:x.period, available:x.available?1:0
  }))
  const nRA = st.availability_room.filter(x=>x.tenant_slug===TENANT).map(x => ({
    room_id: RM.map.get(String(x.room_id)),
    day:x.day, period:x.period, available:x.available?1:0
  }))
  const demand = st.demand_forecast.filter(x => x.tenant_slug===TENANT && x.week_start===String(week_start))
  const nDemand = demand.map(x => ({
    class_id: CM.map.get(String(x.class_id)),
    subject_id: SM.map.get(String(x.subject_id)),
    periods_required: x.periods_required
  }))
  const locks = st.hard_locks.filter(x => x.tenant_slug===TENANT && x.week_start===String(week_start))
  const nLocks = locks.map(x => ({
    class_id: CM.map.get(String(x.class_id)),
    subject_id: SM.map.get(String(x.subject_id)),
    teacher_id: TM.map.get(String(x.teacher_id)),
    room_id: RM.map.get(String(x.room_id)),
    day:x.day, period:x.period
  }))
  const penalties = (st.penalties.find(x => x.tenant_slug===TENANT) || {})

  // Validate missing mappings
  const missing = []
  const chk = (val, label)=> { if (!Number.isInteger(val)) missing.push(label) }
  nTS.forEach(x=>{ chk(x.teacher_id,'ts.teacher'); chk(x.subject_id,'ts.subject') })
  nCS.forEach(x=>{ chk(x.class_id,'cs.class'); chk(x.subject_id,'cs.subject') })
  nTA.forEach(x=>{ chk(x.teacher_id,'ta.teacher') })
  nRA.forEach(x=>{ chk(x.room_id,'ra.room') })
  nDemand.forEach(x=>{ chk(x.class_id,'demand.class'); chk(x.subject_id,'demand.subject') })
  nLocks.forEach(x=>{ chk(x.class_id,'locks.class'); chk(x.subject_id,'locks.subject'); chk(x.teacher_id,'locks.teacher'); chk(x.room_id,'locks.room') })
  if (missing.length) return res.status(400).json({ error: 'Unmapped references', details: Array.from(new Set(missing)) })

  // Call ML
  const payload = {
    tenant:TENANT, week_start:String(week_start), strict,
    classes:nClasses, subjects:nSubjects, teachers:nTeachers, rooms:nRooms,
    teacher_subjects:nTS, class_subjects:nCS,
    availability_teacher:nTA, availability_room:nRA,
    demand:nDemand, locks:nLocks, penalties
  }

  let data
  try{
    const resp = await axios.post(`${ML_URL}/optimize/solve`, payload, { timeout: 120000 })
    data = resp.data
  }catch(e){
    const msg = e?.response?.data ? (typeof e.response.data === 'string' ? e.response.data : JSON.stringify(e.response.data)) : e.message
    return res.status(500).json({ error:`ML call failed: ${msg}` })
  }

  const sid = data.solution_id
  if (!sid) return res.json({ ok:false, solution_id:null, message:'No feasible solution' })

  // persist timetable (replace previous for same sid)
  const st2 = getState()
  st2.timetable = st2.timetable.filter(x => !(x.tenant_slug===TENANT && x.week_start===String(week_start) && x.solution_id===sid))
  if (Array.isArray(data.assignments)) {
    for (const a of data.assignments) {
      st2.timetable.push({
        tenant_slug:TENANT, solution_id:sid, week_start:String(week_start),
        class_id: CM.rev.get(a.class_id),
        subject_id: SM.rev.get(a.subject_id),
        teacher_id: TM.rev.get(a.teacher_id),
        room_id: RM.rev.get(a.room_id),
        day:a.day, period:a.period, hard_lock: a.hard_lock ? 1 : 0
      })
    }
  }
  return res.json({ ok:true, week_start:String(week_start), solution_id:sid, objective:data.objective })
})

router.get('/optimize/solution/:id', (req,res)=>{
  const { id } = req.params
  const st = getState()
  const rows = st.timetable
    .filter(x => x.tenant_slug===TENANT && x.solution_id===id)
    .sort((a,b)=> a.day-b.day || a.period-b.period)

  const byId = (arr) => new Map(arr.filter(x=>x.tenant_slug===TENANT).map(x => [String(x.id), x]))
  const classMap = byId(st.classes), subjMap = byId(st.subjects), teachMap = byId(st.teachers), roomMap = byId(st.rooms)

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
      is_lab: !!subj?.is_lab,
      room_is_lab: !!room?.is_lab,
      why
    }
  })
  res.json({ rows: enriched })
})

router.post('/optimize/lock', async (req,res)=>{
  const { week_start, class_id, subject_id, teacher_id, room_id, day, period } = req.body
  await upsert('hard_locks',
    { tenant_slug:TENANT, week_start:String(week_start), class_id, subject_id, teacher_id, room_id, day, period },
    {}
  )
  res.json({ ok:true })
})

export default router
