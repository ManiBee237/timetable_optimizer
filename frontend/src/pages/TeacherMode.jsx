import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import Empty from '../components/Empty'
import { jget, jpost } from '../lib/api'
import { toast } from '../components/Toast'

const DAYS = ['Mon','Tue','Wed','Thu','Fri']
// default periods; will auto-grow if availability/solution shows more
const DEFAULT_PERIODS = 8

export default function TeacherMode({ weekStart }){
  const [loading, setLoading] = useState(false)
  const [teachers, setTeachers] = useState([])
  const [teacherId, setTeacherId]   = useState(0)
  const [solutionId, setSolutionId] = useState(null)
  const [rows, setRows] = useState([])                     // enriched assignments
  const [tsMap, setTsMap] = useState(new Map())            // subject_id -> Set(teacher_id)
  const [tAvail, setTAvail] = useState(new Map())          // key `${tid}:${d}:${p}` -> 0/1

  // ---------- Load base data ----------
  useEffect(()=>{ (async ()=>{
    const [tRes, tsRes, avRes] = await Promise.all([
      jget('/api/crud/teachers'),
      jget('/api/crud/teacher_subjects?limit=10000'),
      jget('/api/crud/availability_teacher?limit=10000'), // fetch ALL availability
    ])
    const t = (tRes.rows||[]).slice().sort((a,b)=> String(a.name).localeCompare(String(b.name)))
    setTeachers(t)
    if (!teacherId && t.length) setTeacherId(t[0].id)

    // teacher_subjects map
    const m = new Map()
    for (const r of (tsRes.rows||[])){
      if (!m.has(r.subject_id)) m.set(r.subject_id, new Set())
      m.get(r.subject_id).add(r.teacher_id)
    }
    setTsMap(m)

    // availability map
    const av = new Map()
    for (const r of (avRes.rows||[])){
      av.set(`${r.teacher_id}:${r.day}:${r.period}`, r.available ? 1 : 0)
    }
    setTAvail(av)
  })() }, [])

  // ---------- Solve + Load solution ----------
  async function solve(){
    setLoading(true)
    try{
      const j = await jpost('/api/optimize/solve', { week_start: weekStart, strict: true })
      setSolutionId(j.solution_id || null)
      if (j.solution_id) {
        const k = await jget(`/api/optimize/solution/${j.solution_id}`)
        setRows(k.rows || [])
      } else {
        setRows([])
        toast('No feasible solution for this week', 'error')
      }
    } finally { setLoading(false) }
  }

  // ---------- Build helpers ----------
  // determine how many periods/day to show (auto-detect)
  const periods = useMemo(()=>{
    let maxP = DEFAULT_PERIODS - 1
    // from availability of selected teacher
    for (const key of tAvail.keys()) {
      const [tid, , p] = key.split(':').map(Number)
      if (tid === teacherId) maxP = Math.max(maxP, p)
    }
    // from solution rows
    for (const r of rows) {
      if (r.teacher_id === teacherId) maxP = Math.max(maxP, r.period)
    }
    return Math.max(DEFAULT_PERIODS, maxP + 1)
  }, [tAvail, rows, teacherId])

  // group rows by teacher
  const byTeacher = useMemo(()=>{
    const map = new Map()
    rows.forEach(r=>{
      if(!map.has(r.teacher_id)) map.set(r.teacher_id, Array.from({length:5},()=>Array(periods).fill(null)))
      // if periods grew after first insert, make sure row fits
      const g = map.get(r.teacher_id)
      if (g[0].length < periods) {
        for (let d=0; d<5; d++) g[d] = [...g[d], ...Array(periods - g[d].length).fill(null)]
      }
      g[r.day][r.period] = r
    })
    return map
  }, [rows, periods])

  // busy set for quick lookup
  const busyAt = useMemo(()=>{
    const s = new Set()
    rows.forEach(r=> s.add(`${r.teacher_id}:${r.day}:${r.period}`))
    return s
  }, [rows])

  const myGrid = byTeacher.get(teacherId) || Array.from({length:5},()=>Array(periods).fill(null))

  // compute my free periods (available=1 and not busy)
  const myFree = useMemo(()=>{
    if (!teacherId) return []
    const out = []
    for (let d=0; d<5; d++){
      for (let p=0; p<periods; p++){
        const avail = tAvail.get(`${teacherId}:${d}:${p}`) === 1
        const hasClass = !!myGrid[d][p]
        if (avail && !hasClass) out.push({day:d, period:p})
      }
    }
    return out
  }, [teacherId, tAvail, myGrid, periods])

  // substitute suggestions for a given scheduled cell
  function findSubstitutes(cell){
    const subjectId = cell.subject_id
    const eligible = new Set(tsMap.get(subjectId) || [])
    // free & available & not me
    return teachers.filter(t=>{
      if (t.id === teacherId) return false
      if (!eligible.has(t.id)) return false
      const available = tAvail.get(`${t.id}:${cell.day}:${cell.period}`) === 1
      const free = !busyAt.has(`${t.id}:${cell.day}:${cell.period}`)
      return available && free
    })
  }

  // lock a scheduled cell
  async function lockCell(cell){
    try{
      await jpost('/api/optimize/lock', {
        week_start: weekStart,
        class_id: cell.class_id,
        subject_id: cell.subject_id,
        teacher_id: cell.teacher_id,
        room_id: cell.room_id,
        day: cell.day, period: cell.period
      })
      toast('Locked this slot', 'success')
    }catch(e){ toast(e.message || 'Failed to lock', 'error') }
  }

  // CSV export for the selected teacher
  function exportCSV(){
    const lines = []
    lines.push(`Teacher,${(teachers.find(t=>t.id===teacherId)?.name)||''}`)
    lines.push(`Week Start,${weekStart}`)
    lines.push('')
    lines.push(['Day', ...Array.from({length:periods}, (_,i)=>`P${i+1}`)].join(','))
    for (let d=0; d<5; d++){
      const row = [DAYS[d]]
      for (let p=0; p<periods; p++){
        const c = myGrid[d][p]
        row.push(c ? `${c.subject_label} @ ${c.class_label} (${c.room_label})` : '')
      }
      lines.push(row.map(x=> `"${String(x).replaceAll('"','""')}"`).join(','))
    }
    const blob = new Blob([lines.join('\n')], {type:'text/csv'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `timetable_teacher_${teacherId}_${weekStart}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <Card title="Teacher dashboard" subtitle="See your week, free periods, lock slots, and get substitute suggestions"
        actions={
          <>
            <select className="border rounded-xl px-3 py-2 text-sm"
                    value={teacherId} onChange={e=>setTeacherId(Number(e.target.value))}>
              {teachers.map(t=> <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)}
            </select>
            <button onClick={solve} className="px-3 py-2 rounded-xl border text-sm">Solve / Refresh</button>
          </>
        }>
        {loading && <Spinner label="Solving and loading…" />}
        {!loading && !solutionId && <Empty title="No solution loaded" hint="Click Solve / Refresh to generate or fetch this week’s schedule."/>}
        {!loading && solutionId && (
          <div className="text-xs opacity-70">Solution: {solutionId.slice(0,8)}…</div>
        )}
      </Card>

      {/* My timetable */}
      <Card title="My timetable"
        actions={<button onClick={exportCSV} className="px-3 py-2 rounded-xl border text-sm">Export CSV</button>}>
        <div className="overflow-auto rounded-2xl border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="p-2 text-left w-16">Day</th>
                {Array.from({length:periods}).map((_,p)=><th key={p} className="p-2 text-left">P{p+1}</th>)}
              </tr>
            </thead>
            <tbody>
              {DAYS.map((dLabel,d)=>(
                <tr key={d} className="border-t">
                  <td className="p-2">{dLabel}</td>
                  {Array.from({length:periods}).map((_,p)=>{
                    const cell = myGrid[d][p]
                    return (
                      <td key={p} className="p-2 align-top">
                        {cell ? (
                          <div className="rounded-xl border p-2 space-y-1 bg-white/60 dark:bg-gray-900/60">
                            <div className="font-medium">{cell.subject_label} • {cell.class_label}</div>
                            <div className="text-xs opacity-70">{cell.room_label} {cell.hard_lock?'• 🔒':''} {cell.is_lab?'• Lab':''}</div>

                            <details className="text-xs">
                              <summary className="cursor-pointer">Substitute suggestions</summary>
                              <SubList list={findSubstitutes(cell)} />
                            </details>

                            {!cell.hard_lock && (
                              <button onClick={()=>lockCell(cell)}
                                      className="text-xs underline opacity-80">Lock this slot</button>
                            )}

                            <details className="text-xs">
                              <summary className="cursor-pointer">Why this slot?</summary>
                              <ul className="list-disc pl-4 mt-1 space-y-1">
                                {cell.why?.map((w,i)=><li key={i}>{w}</li>)}
                              </ul>
                            </details>
                          </div>
                        ) : (
                          <div className="text-xs opacity-40">—</div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* My free periods */}
      <Card title="My free periods" subtitle="Available and not scheduled">
        {!myFree.length ? (
          <Empty title="No free periods found" hint="Either you’re fully booked or availability isn’t set for this teacher." />
        ) : (
          <div className="flex flex-wrap gap-2 text-sm">
            {myFree.map((x,i)=> (
              <span key={i} className="px-2 py-1 rounded-full border">
                {DAYS[x.day]} · P{x.period+1}
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Today’s agenda */}
      <Card title="Today’s agenda" subtitle="At a glance">
        <TodayAgenda grid={myGrid}/>
      </Card>
    </div>
  )
}

function SubList({ list }){
  if (!list.length) return <div className="opacity-70 mt-1">No eligible free teachers for this slot.</div>
  return (
    <ul className="mt-1 space-y-1">
      {list.map(t=> <li key={t.id}>• {t.name} (ID {t.id})</li>)}
    </ul>
  )
}

function TodayAgenda({ grid }){
  const jsDay = new Date().getDay() // 0..6 (Sun..Sat)
  const d = jsDay===0 ? 0 : Math.min(jsDay-1, 4)
  const row = grid[d] || []
  const items = row
    .map((c, p)=> c ? ({ p, subj:c.subject_label, cls:c.class_label, room:c.room_label }) : null)
    .filter(Boolean)

  if (!items.length) return <Empty title="Nothing scheduled today" hint="Enjoy your free time!"/>
  return (
    <div className="overflow-auto rounded-2xl border">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-900">
          <tr>
            <th className="p-2 text-left w-24">Period</th>
            <th className="p-2 text-left">Subject</th>
            <th className="p-2 text-left">Class</th>
            <th className="p-2 text-left">Room</th>
          </tr>
        </thead>
        <tbody>
          {items.map(x=>(
            <tr key={x.p} className="border-t">
              <td className="p-2">P{x.p+1}</td>
              <td className="p-2">{x.subj}</td>
              <td className="p-2">{x.cls}</td>
              <td className="p-2">{x.room}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
