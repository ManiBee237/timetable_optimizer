import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import { jget, jpost } from '../lib/api'

const DAYS = ['Mon','Tue','Wed','Thu','Fri']
const PERIODS = 8

const subjectTone = (name='')=>{
  const n = name.toLowerCase()
  if (n.includes('math')) return 'mint'
  if (n.includes('sci'))  return 'sky'
  if (n.includes('eng'))  return 'peach'
  if (n.includes('soc'))  return 'grape'
  if (n.includes('lang')) return 'pink'
  if (n.includes('comp')) return 'blue'
  return 'sky'
}
const bgFor = (tone)=> ({
  mint:'bg-candy-mint/30 border-candy-mint/70',
  sky:'bg-candy-sky/30 border-candy-sky/70',
  peach:'bg-candy-peach/30 border-candy-peach/70',
  grape:'bg-candy-grape/30 border-candy-grape/70',
  pink:'bg-candy-pink/30 border-candy-pink/70',
  blue:'bg-candy-blue/30 border-candy-blue/70'
}[tone] || 'bg-candy-sky/30 border-candy-sky/70')

export default function Optimize({ weekStart }){
  const [solutionId, setSolutionId] = useState(null)
  const [grid, setGrid] = useState({})
  const [classes, setClasses] = useState([])
  const [onlyScheduled, setOnlyScheduled] = useState(false)
  const [loading, setLoading] = useState(false)

  async function loadClasses(){
    const j = await jget('/api/crud/classes')
    const rows = (j.rows||[]).slice().sort((a,b)=>{
      if (a.code===b.code) return String(a.section).localeCompare(String(b.section))
      return String(a.code).localeCompare(String(b.code), undefined, { numeric:true })
    })
    setClasses(rows)
  }
  async function solve(){
    setLoading(true)
    try{
      const j = await jpost('/api/optimize/solve', { week_start: weekStart, strict: true })
      setSolutionId(j.solution_id)
      if (j.solution_id) await load(j.solution_id)
    } finally { setLoading(false) }
  }
  async function load(sid){
    const j = await jget(`/api/optimize/solution/${sid}`)
    const byClass = {}
    ;(j.rows||[]).forEach(r=>{
      byClass[r.class_id] ||= Array.from({length:5},()=>Array(PERIODS).fill(null))
      byClass[r.class_id][r.day][r.period] = r
    })
    setGrid(byClass)
  }
  useEffect(()=>{ loadClasses() }, [])
  useEffect(()=>{ if (solutionId) load(solutionId) }, [solutionId])

  const visibleClasses = useMemo(()=>{
    if (!onlyScheduled) return classes
    const scheduledIds = new Set(Object.keys(grid).map(Number))
    return classes.filter(c => scheduledIds.has(c.id))
  }, [classes, grid, onlyScheduled])

  return (
    <div className="space-y-6">
      <Card title="Class Timetables 🧩" subtitle="Colorful slots by subject" tone="mint"
        actions={
          <>
            <button onClick={solve} className="px-4 py-2 rounded-bubble border bg-white/70 hover:brightness-105 text-sm">Solve Timetable</button>
            <label className="text-xs flex items-center gap-2 bg-white/60 px-3 py-2 rounded-bubble border">
              <input type="checkbox" checked={onlyScheduled} onChange={e=>setOnlyScheduled(e.target.checked)} />
              Only show scheduled classes
            </label>
          </>
        }>
        {visibleClasses.length === 0 && (
          <div className="text-sm opacity-60">No classes yet — add some in Admin or uncheck the filter.</div>
        )}

        {visibleClasses.map(c=>{
          const cid = c.id, label = `${c.code}-${c.section}`
          const classGrid = grid[cid] || Array.from({length:5},()=>Array(PERIODS).fill(null))
          return (
            <div key={cid} className="rounded-bubble border border-[rgb(var(--border))] bg-white/70 dark:bg-gray-900/60 overflow-auto mb-6 shadow-bubble">
              <div className="px-4 py-3 font-display bg-gradient-to-r from-candy-sky/40 to-candy-blue/40">
                Class {label} <span className="text-xs opacity-70">(ID {cid})</span>
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
                        const cell = classGrid[d][p]
                        if (!cell) return <td key={p} className="p-2 align-top"><div className="text-xs opacity-30">—</div></td>
                        const tone = subjectTone(cell.subject_label)
                        return (
                          <td key={p} className="p-2 align-top">
                            <div className={`rounded-bubble border p-2 shadow-bubble ${bgFor(tone)}`}>
                              <div className="font-semibold">
                                {cell.subject_label} {cell.is_lab ? '🧪' : '📘'}
                              </div>
                              <div className="text-xs opacity-80">
                                👩‍🏫 {cell.teacher_name} • 🚪 {cell.room_label} {cell.hard_lock?'• 🔒':''}
                              </div>
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
      </Card>
    </div>
  )
}
