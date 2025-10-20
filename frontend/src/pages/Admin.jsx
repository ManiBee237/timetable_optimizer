import { useEffect, useMemo, useState } from 'react'
import Card from '../components/Card'
import Spinner from '../components/Spinner'
import Empty from '../components/Empty'
import { jget, jpost } from '../lib/api'
import { toast } from '../components/Toast'

const PAGE_SIZE = 20

// Entity configs: columns (view) + fields (edit)
const ENTITIES = [
  {
    key:'classes', label:'Classes',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'code',label:'Code'},
      {k:'section',label:'Section'},
      {k:'size',label:'Size'},
    ],
    fields: [
      {k:'code',label:'Code',type:'text',required:true},
      {k:'section',label:'Section',type:'text',required:true},
      {k:'size',label:'Size',type:'number'},
    ]
  },
  {
    key:'subjects', label:'Subjects',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'code',label:'Code'},
      {k:'name',label:'Name'},
      {k:'is_lab',label:'Lab?'},
    ],
    fields: [
      {k:'code',label:'Code',type:'text',required:true},
      {k:'name',label:'Name',type:'text',required:true},
      {k:'is_lab',label:'Is Lab',type:'checkbox'},
    ]
  },
  {
    key:'teachers', label:'Teachers',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'name',label:'Name'},
      {k:'max_periods_per_day',label:'Max/Day'},
      {k:'max_periods_per_week',label:'Max/Week'},
    ],
    fields: [
      {k:'name',label:'Name',type:'text',required:true},
      {k:'max_periods_per_day',label:'Max/Day',type:'number'},
      {k:'max_periods_per_week',label:'Max/Week',type:'number'},
    ]
  },
  {
    key:'rooms', label:'Rooms',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'code',label:'Code'},
      {k:'capacity',label:'Capacity'},
      {k:'is_lab',label:'Lab?'},
    ],
    fields: [
      {k:'code',label:'Code',type:'text',required:true},
      {k:'capacity',label:'Capacity',type:'number'},
      {k:'is_lab',label:'Is Lab',type:'checkbox'},
    ]
  },
  {
    key:'teacher_subjects', label:'Teacher→Subject',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'teacher_id',label:'Teacher'},
      {k:'subject_id',label:'Subject'},
    ],
    fields: [
      {k:'teacher_id',label:'Teacher',type:'select-teacher',required:true},
      {k:'subject_id',label:'Subject',type:'select-subject',required:true},
    ]
  },
  {
    key:'class_subjects', label:'Class→Subject',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'class_id',label:'Class'},
      {k:'subject_id',label:'Subject'},
    ],
    fields: [
      {k:'class_id',label:'Class',type:'select-class',required:true},
      {k:'subject_id',label:'Subject',type:'select-subject',required:true},
    ]
  },
  {
    key:'demand_forecast', label:'Demand (Weekly)',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'week_start',label:'Week (Mon)'},
      {k:'class_id',label:'Class'},
      {k:'subject_id',label:'Subject'},
      {k:'periods_required',label:'Periods'},
      {k:'source',label:'Source'},
    ],
    fields: [
      {k:'week_start',label:'Week (Mon)',type:'date',required:true},
      {k:'class_id',label:'Class',type:'select-class',required:true},
      {k:'subject_id',label:'Subject',type:'select-subject',required:true},
      {k:'periods_required',label:'Periods',type:'number',required:true},
      {k:'source',label:'Source',type:'text'},
    ]
  },
  {
    key:'penalties', label:'Penalties',
    cols: [
      {k:'id',label:'ID',w:72},
      {k:'teacher_gap',label:'Teacher Gap'},
      {k:'uneven_subject',label:'Uneven Subject'},
      {k:'room_mismatch',label:'Room Mismatch'},
      {k:'early_or_late',label:'Early/Late'},
    ],
    fields: [
      {k:'teacher_gap',label:'Teacher Gap',type:'number'},
      {k:'uneven_subject',label:'Uneven Subject',type:'number'},
      {k:'room_mismatch',label:'Room Mismatch',type:'number'},
      {k:'early_or_late',label:'Early/Late',type:'number'},
    ]
  },
]

// small helpers
function Input({type='text', value, onChange, ...rest}){
  if (type==='checkbox') {
    return <input type="checkbox" checked={!!value} onChange={e=>onChange(e.target.checked?1:0)} {...rest}/>
  }
  return <input type={type} value={value ?? ''} onChange={e=>{
    const t=e.target; let v=t.value
    if (type==='number') v = v===''? '' : Number(v)
    onChange(v)
  }} className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-gray-900/70" {...rest}/>
}

export default function Admin(){
  const [entity, setEntity] = useState('classes')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(0)
  const [q, setQ] = useState('')
  const [weekFilter, setWeekFilter] = useState('')
  const [editing, setEditing] = useState(null) // row or null
  const [form, setForm] = useState({})

  // relation caches
  const [classes, setClasses] = useState([])
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])

  const cfg = useMemo(()=> ENTITIES.find(e=>e.key===entity), [entity])

  function setField(k){ return (v)=> setForm(f=>({...f, [k]: v})) }

  async function loadRelations(){
    const [c,s,t] = await Promise.all([
      jget('/api/crud/classes'),
      jget('/api/crud/subjects'),
      jget('/api/crud/teachers'),
    ])
    setClasses((c.rows||[]).sort((a,b)=> (a.code===b.code ? String(a.section).localeCompare(String(b.section)) : String(a.code).localeCompare(String(b.code),undefined,{numeric:true}))))
    setSubjects((s.rows||[]).sort((a,b)=> String(a.name).localeCompare(String(b.name))))
    setTeachers((t.rows||[]).sort((a,b)=> String(a.name).localeCompare(String(b.name))))
  }

  async function load(){
    setLoading(true)
    try{
      const params = new URLSearchParams()
      params.set('limit', PAGE_SIZE)
      params.set('offset', String(page*PAGE_SIZE))
      if (q) params.set('q', q)
      if (entity==='demand_forecast' && weekFilter) params.set('week_start', weekFilter)
      const j = await jget(`/api/crud/${entity}?${params.toString()}`)
      setRows(j.rows || [])
    } finally { setLoading(false) }
  }

  useEffect(()=>{ loadRelations() }, [])
  useEffect(()=>{ setPage(0) }, [entity, q, weekFilter])
  useEffect(()=>{ load() }, [entity, page, q, weekFilter])

  function startCreate(){
    setEditing(null)
    setForm({})
  }
  function startEdit(row){
    setEditing(row)
    setForm(row)
    if (row.week_start && row.week_start.length>10) {
      // normalize to YYYY-MM-DD (SQLite may return full ISO)
      setForm(f=>({...f, week_start: row.week_start.slice(0,10)}))
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  async function save(){
    // simple required validation
    for (const f of (cfg.fields||[])) {
      if (f.required && (form[f.k]===undefined || form[f.k]==='' || form[f.k]===null)) {
        toast(`${f.label} is required`, 'error'); return
      }
    }
    if (editing) {
      await jpost(`/api/crud/${entity}/${editing.id}`, form, 'PUT')
      toast('Updated', 'success')
    } else {
      await jpost(`/api/crud/${entity}`, form, 'POST')
      toast('Created', 'success')
    }
    setForm({}); setEditing(null); await load()
  }
  async function del(id){
    if (!confirm('Delete this item?')) return
    await jpost(`/api/crud/${entity}/${id}`, null, 'DELETE')
    toast('Deleted', 'success')
    await load()
  }

  // render field control
  function FieldControl({f}){
    const val = form[f.k]
    if (f.type==='select-class'){
      return (
        <select value={val ?? ''} onChange={e=>setField(f.k)(Number(e.target.value||0))}
                className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-gray-900/70">
          <option value="">Select class</option>
          {classes.map(c=> <option key={c.id} value={c.id}>{c.code}-{c.section} (ID {c.id})</option>)}
        </select>
      )
    }
    if (f.type==='select-subject'){
      return (
        <select value={val ?? ''} onChange={e=>setField(f.k)(Number(e.target.value||0))}
                className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-gray-900/70">
          <option value="">Select subject</option>
          {subjects.map(s=> <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
        </select>
      )
    }
    if (f.type==='select-teacher'){
      return (
        <select value={val ?? ''} onChange={e=>setField(f.k)(Number(e.target.value||0))}
                className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-gray-900/70">
          <option value="">Select teacher</option>
          {teachers.map(t=> <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)}
        </select>
      )
    }
    return <Input type={f.type||'text'} value={val} onChange={setField(f.k)} placeholder={f.placeholder}/>
  }

  // header actions
  const headerActions = (
    <div className="flex items-center gap-2">
      {entity==='demand_forecast' && (
        <input type="date" value={weekFilter} onChange={e=>setWeekFilter(e.target.value)}
               className="border rounded-xl px-3 py-2 text-sm" placeholder="Week filter"/>
      )}
      <input placeholder="Search…" value={q} onChange={e=>setQ(e.target.value)}
             className="border rounded-xl px-3 py-2 text-sm"/>
      <button onClick={()=>load()} className="px-3 py-2 rounded-xl border text-sm">Refresh</button>
    </div>
  )

  return (
    <div className="space-y-6">
      <Card title="Admin" subtitle="Manage core data — classes, subjects, teachers, mappings, demand"
            actions={<div className="flex gap-2">
              {ENTITIES.map(e=>(
                <button key={e.key}
                  onClick={()=>{ setEntity(e.key); startCreate() }}
                  className={`px-3 py-2 rounded-xl border text-sm ${entity===e.key?'bg-gray-100 dark:bg-gray-900':''}`}>
                  {e.label}
                </button>
              ))}
            </div>}
      >
        <div className="grid md:grid-cols-[1fr,2fr] gap-6">
          {/* Editor */}
          <div>
            <div className="text-sm font-medium mb-2">{editing ? 'Edit' : 'Create'} {cfg.label}</div>
            <div className="rounded-2xl border p-4 bg-white/50 dark:bg-gray-900/50 space-y-3">
              {(cfg.fields||[]).map(f=>(
                <label key={f.k} className="text-sm flex flex-col gap-1">
                  <span className="opacity-70">{f.label}{f.required && <span className="text-red-600">*</span>}</span>
                  <FieldControl f={f}/>
                </label>
              ))}
              <div className="flex gap-2">
                <button onClick={save} className="px-3 py-2 rounded-xl border text-sm">{editing?'Update':'Create'}</button>
                <button onClick={()=>{ setForm({}); setEditing(null) }} className="px-3 py-2 rounded-xl border text-sm bg-gray-100 dark:bg-gray-900">Reset</button>
                {entity==='demand_forecast' && <div className="text-xs opacity-70 self-center">Tip: Set the Monday date for the target week.</div>}
              </div>
            </div>
          </div>

          {/* List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{cfg.label} — List</div>
              {headerActions}
            </div>

            <div className="rounded-2xl border overflow-hidden bg-white/50 dark:bg-gray-900/50">
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900">
                    <tr>
                      {cfg.cols.map(c=>(
                        <th key={c.k} className="p-2 text-left" style={{width:c.w}}>{c.label}</th>
                      ))}
                      <th className="p-2 text-left w-28">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && <tr><td colSpan={cfg.cols.length+1} className="p-4"><Spinner label="Loading..." /></td></tr>}
                    {!loading && !rows.length && <tr><td colSpan={cfg.cols.length+1}><Empty title="No items" hint="Create new or adjust filters."/></td></tr>}
                    {!loading && rows.map(row=>(
                      <tr key={row.id} className="border-t">
                        {cfg.cols.map(c=>{
                          let v = row[c.k]
                          if (c.k==='is_lab') v = v ? 'Yes' : 'No'
                          return <td key={c.k} className="p-2">{String(v ?? '')}</td>
                        })}
                        <td className="p-2">
                          <button onClick={()=>startEdit(row)} className="text-xs underline mr-2">Edit</button>
                          <button onClick={()=>del(row.id)} className="text-xs underline text-red-600">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="flex items-center justify-between p-2 border-t text-xs">
                <button disabled={page===0} onClick={()=>setPage(p=>Math.max(0,p-1))}
                        className="px-2 py-1 rounded border disabled:opacity-50">Prev</button>
                <div className="opacity-70">Page {page+1}</div>
                <button disabled={rows.length<PAGE_SIZE} onClick={()=>setPage(p=>p+1)}
                        className="px-2 py-1 rounded border disabled:opacity-50">Next</button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Helpers */}
      {entity==='teacher_subjects' && (
        <Card title="Helper: Add mappings quickly" subtitle="Pick a teacher and add multiple subjects">
          <QuickMapTeacherSubject teachers={teachers} subjects={subjects} onDone={load} />
        </Card>
      )}
      {entity==='class_subjects' && (
        <Card title="Helper: Map core subjects to all classes"
              actions={<button onClick={mapCoreToAll} className="px-3 py-2 rounded-xl border text-sm">Apply</button>}
              subtitle="Core: MATH, SCI, ENG, SOC, LANG, COMP">
          <div className="text-sm opacity-70">Click Apply to INSERT IGNORE all core subjects for every class.</div>
        </Card>
      )}
    </div>
  )

  async function mapCoreToAll(){
    // Do on client by calling CRUD endpoints per missing pair (simple + portable)
    const core = (subjects||[]).filter(s=> ['MATH','SCI','ENG','SOC','LANG','COMP'].includes(s.code))
    const cl = classes||[]
    let added = 0
    for (const c of cl){
      for (const s of core){
        const exists = rows.find(r=> r.class_id===c.id && r.subject_id===s.id) // rows may not include all; so just try insert
        if (!exists) {
          try{ await jpost('/api/crud/class_subjects', { class_id:c.id, subject_id:s.id }, 'POST'); added++ }catch{}
        }
      }
    }
    toast(`Applied core mappings (added ${added}).`, 'success')
    await load()
  }
}

function QuickMapTeacherSubject({ teachers, subjects, onDone }){
  const [teacher_id, setTeacherId] = useState('')
  const [subject_ids, setSubjectIds] = useState([])
  const core = subjects.filter(s=> ['MATH','SCI','ENG','SOC','LANG','COMP'].includes(s.code))

  function toggle(id){
    setSubjectIds(list => list.includes(id) ? list.filter(x=>x!==id) : [...list, id])
  }
  async function apply(){
    if (!teacher_id || subject_ids.length===0) return
    let ok=0
    for (const sid of subject_ids){
      try { await jpost('/api/crud/teacher_subjects', { teacher_id:Number(teacher_id), subject_id:sid }, 'POST'); ok++ } catch {}
    }
    onDone?.()
    setSubjectIds([])
    window.alert(`Added ${ok} mappings.`)
  }

  return (
    <div className="space-y-3">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="text-sm flex flex-col gap-1">
          <span className="opacity-70">Teacher</span>
          <select value={teacher_id} onChange={e=>setTeacherId(e.target.value)}
                  className="border rounded-xl px-3 py-2 bg-white/70 dark:bg-gray-900/70">
            <option value="">Select teacher</option>
            {teachers.map(t=> <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)}
          </select>
        </label>
        <div className="text-sm">
          <div className="opacity-70 mb-1">Core Subjects</div>
          <div className="flex flex-wrap gap-2">
            {core.map(s=>{
              const on = subject_ids.includes(s.id)
              return (
                <button key={s.id} onClick={()=>toggle(s.id)}
                  className={`px-3 py-1 rounded-full border text-xs ${on?'bg-gray-200 dark:bg-gray-800':''}`}>
                  {s.name} ({s.code})
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div>
        <button onClick={apply} className="px-3 py-2 rounded-xl border text-sm">Add Mappings</button>
      </div>
    </div>
  )
}
