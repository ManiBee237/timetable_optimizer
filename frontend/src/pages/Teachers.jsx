import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { jget, jpost } from '../lib/api'

const DAYS = ['Mon','Tue','Wed','Thu','Fri']
const PERIODS = 8

const tone = (s)=> s?.toLowerCase().includes('lab') ? 'grape' : 'peach'
const bgFor = (t)=> ({
  mint:'bg-candy-mint/30 border-candy-mint/70',
  sky:'bg-candy-sky/30 border-candy-sky/70',
  peach:'bg-candy-peach/30 border-candy-peach/70',
  grape:'bg-candy-grape/30 border-candy-grape/70',
  pink:'bg-candy-pink/30 border-candy-pink/70',
  blue:'bg-candy-blue/30 border-candy-blue/70'
}[t] || 'bg-candy-sky/30 border-candy-sky/70')

export default function Teachers({ weekStart }){
  const [solutionId, setSolutionId] = useState(null)
  const [rows, setRows] = useState([])
  const [teachers, setTeachers] = useState([])
  const [filterId, setFilterId] = useState(0)

  async function loadTeachers(){
    const j = await jget('/api/crud/teachers')
    setTeachers((j.rows||[]).slice().sort((a,b)=> String(a.name).localeCompare(String(b.name))))
  }
  async function solve(){
    const j = await jpost('/api/optimize/solve', { week_start: weekStart, strict: true })
    setSolutionId(j.solution_id)
    if (j.solution_id) await load(j.solution_id)
  }
  async function load(sid){
    const j = await jget(`/api/optimize/solution/${sid}`)
    setRows(j.rows || [])
  }
  useEffect(()=>{ loadTeachers() }, [])
  useEffect(()=>{ if (solutionId) load(solutionId) }, [solutionId])

  const byTeacher = useMemo(()=>{
    const map = new Map()
    rows.forEach(r=>{
      if(!map.has(r.teacher_id)) map.set(r.teacher_id, Array.from({length:5},()=>Array(PERIODS).fill(null)))
      map.get(r.teacher_id)[r.day][r.period] = r
    })
    return map
  }, [rows])

  const visible = filterId ? teachers.filter(t=>t.id===filterId) : teachers

  return (
    <div className="space-y-6">
      <Card title="Teacher Timetables 🍎" subtitle="See who teaches what & when" tone="peach"
        actions={
          <>
            <button onClick={solve} className="px-4 py-2 rounded-bubble border bg-white/70 hover:brightness-105 text-sm">Solve Timetable</button>
            <select className="border rounded-bubble px-3 py-2 text-sm bg-white/70"
                    value={filterId} onChange={e=>setFilterId(Number(e.target.value))}>
              <option value={0}>All teachers</option>
              {teachers.map(t=> <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)}
            </select>
          </>
        }/>

      {visible.map(t=>{
        const grid = byTeacher.get(t.id) || Array.from({length:5},()=>Array(PERIODS).fill(null))
        return (
          <div key={t.id} className="rounded-bubble border border-[rgb(var(--border))] bg-white/70 dark:bg-gray-900/60 overflow-auto shadow-bubble">
            <div className="px-4 py-3 font-display bg-gradient-to-r from-candy-peach/40 to-candy-lemon/40">
              {t.name} <span className="text-xs opacity-70">(ID {t.id})</span>
            </div>
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-white/60 dark:bg-gray-900/60">
                  <th className="p-2 text-left w-16">Day</th>
                  {Array.from({length:PERIODS}).map((_,p)=><th key={p} className="p-2 text-left">P{p+1}</th>)}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((dLabel,d)=>(
                  <tr key={d} className="border-t border-[rgb(var(--border))]">
                    <td className="p-2 font-medium">{dLabel}</td>
                    {Array.from({length:PERIODS}).map((_,p)=>{
                      const cell = grid[d][p]
                      if (!cell) return <td key={p} className="p-2 align-top"><div className="text-xs opacity-30">—</div></td>
                      const t = tone(cell.subject_label)
                      return (
                        <td key={p} className="p-2 align-top">
                          <div className={`rounded-bubble border p-2 shadow-bubble ${bgFor(t)}`}>
                            <div className="font-semibold">{cell.subject_label} {cell.is_lab ? '🧪' : '📘'}</div>
                            <div className="text-xs opacity-80">🧑‍🎓 {cell.class_label} • 🚪 {cell.room_label} {cell.hard_lock?'• 🔒':''}</div>
                            <details className="text-xs mt-1">
                              <summary className="cursor-pointer">Why?</summary>
                              <ul className="list-disc pl-5 mt-1 space-y-1">
                                {cell.why?.map((w,i)=><li key={i}>{w}</li>)}
                              </ul>
                            </details>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}
