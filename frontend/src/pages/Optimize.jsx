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

  async function loadClasses(){
    const j = await jget('/api/crud/classes?limit=1000')
    const list = (j.rows||[]).slice().sort((a,b)=> String(a.code+a.section).localeCompare(String(b.code+b.section)))
    setClasses(list)
  }

  async function solve(){
    setLoading(true)
    try{
      await jget(`/api/demand/forecast?week_start=${weekStart}`)
      const res = await jpost('/api/optimize/solve', { week_start: weekStart, strict: true })
      setSolutionId(res.solution_id || null)
      if (res.solution_id){
        const k = await jget(`/api/optimize/solution/${res.solution_id}`)
        setRows(k.rows || [])
      } else {
        setRows([])
        alert('No feasible solution for this week.')
      }
    } finally {
      setLoading(false)
    }
  }

  async function reload(){
    if (!solutionId) return
    const k = await jget(`/api/optimize/solution/${solutionId}`)
    setRows(k.rows || [])
  }

  useEffect(()=>{ loadClasses() }, [])
  useEffect(()=>{ if (solutionId) reload() }, [solutionId])

  const periods = useMemo(()=>{
    let maxP = DEFAULT_PERIODS - 1
    for (const r of rows) maxP = Math.max(maxP, r.period)
    return Math.max(DEFAULT_PERIODS, maxP + 1)
  }, [rows])

  // class -> 5 x periods grid
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

      {/* COLUMN LAYOUT: one card per class, stacked vertically */}
      <div className="flex flex-col gap-4">
        {classes.map(c => {
          const cid = String(c._id || c.id)
          const grid = byClass.get(cid) || Array.from({length:5},()=>Array(periods).fill(null))
          const title = `${c.code}-${c.section}`

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
                                  <div className="font-medium">{cell.subject_label}</div>
                                  <div className="text-xs opacity-70">
                                    {cell.teacher_name} • {cell.room_label} {cell.hard_lock?'• 🔒':''} {cell.is_lab?'• Lab':''}
                                  </div>
                                  <details className="text-xs">
                                    <summary className="cursor-pointer">Why this slot?</summary>
                                    <ul className="list-disc pl-4 mt-1 space-y-1">
                                      {(cell.why||[]).map((w,i)=> <li key={`why-${cid}-${d}-${p}-${i}`}>{w}</li>)}
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
            </div>
          )
        })}
      </div>
    </div>
  )
}
