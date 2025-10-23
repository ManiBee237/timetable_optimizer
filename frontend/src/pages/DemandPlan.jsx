// frontend/src/pages/DemandPlan.jsx

import { useEffect, useState } from 'react'
import Card from '../components/Card'
import Empty from '../components/Empty'
import Spinner from '../components/Spinner'
import { Play, RefreshCw } from 'lucide-react'
import { jget, jpost } from '../lib/api'
import { toast } from '../components/Toast'

export default function DemandPlan({ weekStart }){
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  async function load(){
    setLoading(true)
    try {
      const j = await jget(`demand/forecast?week_start=${encodeURIComponent(weekStart)}`)
      setRows(j.items || [])
    } catch (e) {
      toast(e.message || 'Failed to load forecast', 'error')
      setRows([])
    } finally { setLoading(false) }
  }

  async function run(){
    setLoading(true)
    try {
      await jpost('demand/forecast', { tenant: 'demo', week_start: weekStart })
      toast('ML forecast refreshed', 'success')
      await load()
    } catch(e){ toast(e.message || 'Failed to run forecast', 'error') }
    finally { setLoading(false) }
  }

  useEffect(()=>{ load() }, [weekStart])

  return (
    <div className="space-y-6">
      <Card title="Weekly Demand" subtitle="Defaults auto-fill if ML has no history"
        actions={
          <>
            <button onClick={run} disabled={loading} className="px-3 py-2 rounded-xl border text-sm inline-flex items-center gap-2">
              <Play size={16}/> Run ML Forecast
            </button>
            <button onClick={load} disabled={loading} className="px-3 py-2 rounded-xl border text-sm inline-flex items-center gap-2">
              <RefreshCw size={16}/> Refresh
            </button>
          </>
        }>
        {loading && <Spinner label="Loading demand..." />}
        {!loading && !rows.length && <Empty title="No demand yet" hint="Click Run ML Forecast or go to Admin to add." />}
        {!!rows.length && (
          <div className="overflow-auto rounded-lg border border-[rgb(var(--border))]">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-900">
                  <th className="p-2 text-left">Class</th>
                  <th className="p-2 text-left">Subject</th>
                  <th className="p-2 text-left">Periods</th>
                  <th className="p-2 text-left">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r,i)=>(
                  <tr key={i} className="border-t border-[rgb(var(--border))]">
                    <td className="p-2">#{r.class_id}</td>
                    <td className="p-2">#{r.subject_id}</td>
                    <td className="p-2">{r.periods_required}</td>
                    <td className="p-2">{r.source || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
