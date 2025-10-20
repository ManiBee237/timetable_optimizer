import { connectMongo, Models as M } from './mongo.js'

async function one(Model, where, data={}) {
  const found = await Model.findOne(where).lean()
  if (!found) await Model.create({ ...where, ...data })
}

async function main() {
  await connectMongo()

  await one(M.Tenant, { slug:'demo' }, { name:'Demo School' })
  const tenant_slug = 'demo'

  // classes
  const classes = [
    { code:'8', section:'A', size:35 },
    { code:'8', section:'B', size:34 },
    { code:'9', section:'A', size:36 },
    { code:'9', section:'B', size:35 },
    { code:'10', section:'A', size:38 },
  ]
  const classDocs = []
  for (const c of classes) classDocs.push(await M.Class.findOneAndUpdate({ tenant_slug, code:c.code, section:c.section }, { tenant_slug, ...c }, { upsert:true, new:true }))

  // subjects
  const subjectsSeed = [
    { code:'MATH', name:'Mathematics', is_lab:0 },
    { code:'SCI',  name:'Science',     is_lab:1 },
    { code:'ENG',  name:'English',     is_lab:0 },
    { code:'SOC',  name:'Social Studies', is_lab:0 },
    { code:'LANG', name:'Language',    is_lab:0 },
    { code:'COMP', name:'Computer Science', is_lab:1 },
  ]
  const subjectDocs = []
  for (const s of subjectsSeed) subjectDocs.push(await M.Subject.findOneAndUpdate({ tenant_slug, code:s.code }, { tenant_slug, ...s }, { upsert:true, new:true }))

  // teachers
  const teacherNames = ['Ms. Priya','Mr. Raj','Ms. Anu','Mr. Kumar','Ms. Lakshmi','Mr. Joseph','Ms. Fatima','Mr. Arjun','Ms. Nisha','Mr. Vivek','Ms. Meera','Mr. Sandeep']
  const teacherDocs = []
  for (const name of teacherNames) teacherDocs.push(await M.Teacher.findOneAndUpdate({ tenant_slug, name }, { tenant_slug, name }, { upsert:true, new:true }))

  // rooms
  const roomsSeed = [
    { code:'R101', capacity:40, is_lab:0 },
    { code:'R201', capacity:40, is_lab:0 },
    { code:'LAB1', capacity:30, is_lab:1 },
    { code:'R102', capacity:40, is_lab:0 },
    { code:'R202', capacity:40, is_lab:0 },
    { code:'LAB2', capacity:30, is_lab:1 },
  ]
  const roomDocs = []
  for (const r of roomsSeed) roomDocs.push(await M.Room.findOneAndUpdate({ tenant_slug, code:r.code }, { tenant_slug, ...r }, { upsert:true, new:true }))

  // teacher→subject eligibility
  const s = (code)=> subjectDocs.find(x=>x.code===code)
  const t = (name)=> teacherDocs.find(x=>x.name===name)
  const mapTS = [
    [t('Ms. Priya'), s('MATH')], [t('Mr. Kumar'), s('MATH')], [t('Mr. Vivek'), s('MATH')],
    [t('Mr. Raj'), s('SCI')], [t('Ms. Lakshmi'), s('SCI')],
    [t('Ms. Anu'), s('ENG')], [t('Mr. Joseph'), s('ENG')],
    [t('Ms. Fatima'), s('SOC')], [t('Mr. Sandeep'), s('SOC')],
    [t('Mr. Arjun'), s('LANG')], [t('Ms. Meera'), s('LANG')],
    [t('Ms. Nisha'), s('COMP')], [t('Mr. Vivek'), s('COMP')],
  ]
  for (const [teacher, subj] of mapTS) await one(M.TeacherSubject, { tenant_slug, teacher_id: teacher._id, subject_id: subj._id })

  // class→subject mapping (all subjects to all classes)
  for (const c of classDocs){
    for (const subj of subjectDocs){
      await one(M.ClassSubject, { tenant_slug, class_id: c._id, subject_id: subj._id })
    }
  }

  // availability (5 days × 8 periods)
  const DAYS=5, PERIODS=8
  for (const teacher of teacherDocs){
    for (let d=0; d<DAYS; d++) for (let p=0; p<PERIODS; p++){
      await one(M.AvTeacher, { tenant_slug, teacher_id: teacher._id, day:d, period:p }, { available:1 })
    }
  }
  for (const room of roomDocs){
    for (let d=0; d<DAYS; d++) for (let p=0; p<PERIODS; p++){
      await one(M.AvRoom, { tenant_slug, room_id: room._id, day:d, period:p }, { available:1 })
    }
  }

  await one(M.Penalties, { tenant_slug }, {}) // defaults
  console.log('✓ Mongo seed complete'); process.exit(0)
}
main().catch(e=>{ console.error(e); process.exit(1) })
