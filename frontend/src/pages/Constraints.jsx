import Card from '../components/Card'
import { useState } from 'react'
import { jpost } from '../lib/api'
import { toast } from '../components/Toast'

export default function Constraints({ weekStart }){
  const [form, setForm] = useState({ class_id:'', subject_id:'', teacher_id:'', room_id:'', day:0, period:0 })
  const set = k => e => setForm(f=>({...f, [k]: isNaN(+e.target.value) ? e.target.value : +e.target.value }))

  async function addLock(){
    try{
      await jpost('/api/optimize/lock', { week_start: weekStart, ...form })
      toast('Lock added', 'success')
    } catch(e){ toast(e.message || 'Failed', 'error') }
  }

  return (
    <div className="space-y-6">
      <Card title="Hard Locks" subtitle="Pin specific slots before solving"
        actions={<button onClick={addLock} className="px-3 py-2 rounded-xl border text-sm">Add Lock</button>}>
        <div className="grid md:grid-cols-3 gap-3">
          {['class_id','subject_id','teacher_id','room_id','day','period'].map(k=>(
            <label key={k} className="text-sm flex flex-col gap-1">
              <span className="opacity-70">{k.replace('_',' ').toUpperCase()}</span>
              <input placeholder={k} className="border rounded-xl px-3 py-2" onChange={set(k)}/>
            </label>
          ))}
        </div>
      </Card>
    </div>
  )
}
