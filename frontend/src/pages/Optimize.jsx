// frontend/src/pages/Optimize.jsx

import { useEffect, useMemo, useState } from 'react'
import { jget, jpost } from '../lib/api'
import Spinner from '../components/Spinner'

const DAYS = ['Mon','Tue','Wed','Thu','Fri']
const DEFAULT_PERIODS = 8

export default function Optimize({ weekStart }){
  const [loading, setLoading] = useState(false)
  const [solutionId, setSolutionId] = useState(null)
  const [rows, setRows] = useState([])

  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  const [rooms, setRooms] = useState([])

  const normList = (j) => (j?.rows || j?.items || [])

  async function loadAll(){
    const [c,s,t,r] = await Promise.all([
      jget('crud/classes?limit=1000').catch(()=>({})),
      jget('crud/subjects?limit=1000').catch(()=>({})),
      jget('crud/teachers?limit=1000').catch(()=>({})),
      jget('crud/rooms?limit=1000').catch(()=>({})),
    ])
    setClasses(normList(c))
    setSubjects(normList(s))
    setTeachers(normList(t))
    setRooms(normList(r))
  }

  const fullTeacherAvail = (teacher_id, days=5, periods=8) =>
    Array.from({length: days*periods}, (_,i) => ({
      teacher_id, day: Math.floor(i/periods), period: i%periods, available: 1
    }))

  const fullRoomAvail = (room_id, days=5, periods=8) =>
    Array.from({length: days*periods}, (_,i) => ({
      room_id, day: Math.floor(i/periods), period: i%periods, available: 1
    }))

  function buildPayload(){
    const hasData = classes.length && subjects.length && teachers.length && rooms.length

    const C = hasData ? classes.map(x => ({ id: x.id ?? x._id ?? 1, code: x.code, section: x.section })) : [{ id:1, code:'A', section:'1' }]
    const S = hasData ? subjects.map(x => ({ id: x.id ?? x._id ?? 10, name: x.name, is_lab: x.is_lab?1:0 })) : [{ id:10, name:'Math', is_lab:0 }]
    const T = hasData ? teachers.map(x => ({ id: x.id ?? x._id ?? 100, name: x.name })) : [{ id:100, name:'Mrs X' }]
    const R = hasData ? rooms.map(x => ({ id: x.id ?? x._id ?? 200, name: x.name, is_lab: x.is_lab?1:0 })) : [{ id:200, name:'R1', is_lab:0 }]

    const teacher_subjects = T.flatMap(t => S.map(s => ({ teacher_id: t.id, subject_id: s.id })))
    const class_subjects = C.flatMap(c => S.map(s => ({ class_id: c.id, subject_id: s.id })))
    const availability_teacher = T.flatMap(t => fullTeacherAvail(t.id, 5, DEFAULT_PERIODS))
    const availability_room    = R.flatMap(r => fullRoomAvail(r.id, 5, DEFAULT_PERIODS))
    const demand = C.flatMap(c => S.map(s => ({ class_id: c.id, subject_id: s.id, periods_required: 3 })))

    return {
      tenant: 'demo',
      week_start: weekStart,
      strict: true,
      classes: C, subjects: S, teachers: T, rooms: R,
      teacher_subjects, class_subjects,
      availability_teacher, availability_room,
      demand, locks: [], penalties: { room_mismatch: 4 },
    }
  }

  async function solve(){
    setLoading(true)
    try{
      const payload = buildPayload()
      const res = await jpost('optimize/solve', payload)
      setSolutionId(res.solution_id || null)

      if (res.solution_id){
        const got = await jget(`optimize/solution/${res.solution_id}`)
        setRows(got.rows || [])
      } else {
        setRows([])
        alert('No feasible solution for this week.')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(()=>{ loadAll() }, [])

  const periods = useMemo(()=>{
    let maxP = DEFAULT_PERIODS - 1
    for (const r of rows) maxP = Math.max(maxP, r.period)
    return Math.max(DEFAULT_PERIODS, maxP + 1)
  }, [rows])

  const byClass = useMemo(()=>{
    const map = new Map()
    for (const r of rows){
      const cid = String(r.class_id)
      if(!map.has(cid)) map.set(cid, Array.from({length:5},()=>Array(periods).fill(null)))
      const g = map.get(cid)
      if (g[0].length < periods){
        for (let d=0; d<5; d++) g[d] = [...g[d], ...Array(periods - g[d].length).fill(null)]
      }
      g[r.day][r.period] = r
    }
    return map
  }, [rows, periods])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={solve} className="px-3 py-2 rounded-xl border text-sm">Solve Timetable</button>
        {loading && <Spinner label="Solving..." />}
        {solutionId && <div className="text-xs opacity-70">Solution: {String(solutionId).slice(0,8)}…</div>}
        <div className="ml-auto text-sm opacity-70">Week: {weekStart}</div>
      </div>

      <div className="flex flex-col gap-4">
        {(classes.length ? classes : [{id:1, code:'A', section:'1'}]).map(c => {
          const cid = String(c._id || c.id || 1)
          const grid = byClass.get(cid) || Array.from({length:5},()=>Array(periods).fill(null))
          const title = `${c.code || 'A'}-${c.section || '1'}`
          return (
            <div key={cid} className="rounded-2xl border bg-white shadow-sm overflow-hidden">
              <div className="px-3 py-2 font-semibold bg-gray-50">{title}</div>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="p-2 text-left w-16">Day</th>
                      {Array.from({length:periods}).map((_,p)=>(
                        <th key={`phead-${cid}-${p}`} className="p-2 text-left">P{p+1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map((dLabel,d)=>(
                      <tr key={`row-${cid}-${d}`} className="border-t">
                        <td className="p-2">{dLabel}</td>
                        {Array.from({length:periods}).map((_,p)=>{
                          const cell = grid[d][p]
                          return (
                            <td key={`cell-${cid}-${d}-${p}`} className="p-2 align-top">
                              {cell ? (
                                <div className="rounded-xl border p-2 space-y-1">
                                  <div className="font-medium">Subject #{cell.subject_id}</div>
                                  <div className="text-xs opacity-70">
                                    Teacher #{cell.teacher_id} • Room #{cell.room_id} {cell.hard_lock?'• 🔒':''}
                                  </div>
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
