import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { knex as makeKnex } from 'knex'
import cfg from '../../knexfile.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
async function ensureDir(p){ if(!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }) }

async function main(){
  // ensure ./data/ for sqlite
  if (cfg.client === 'sqlite3') {
    await ensureDir(path.join(__dirname, '../../data'))
  }
  const knex = makeKnex(cfg)

  // helpers
  const has = (t)=> knex.schema.hasTable(t)
  const id = (t)=> t === 'timetable' ? 'bigIncrements' : 'increments'

  // === Tables ===
  if(!await has('tenants')) await knex.schema.createTable('tenants', t=>{
    t.increments('id').primary()
    t.string('slug').unique()
    t.string('name')
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })
  if(!await has('classes')) await knex.schema.createTable('classes', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.string('code'); t.string('section'); t.integer('size')
  })
  if(!await has('subjects')) await knex.schema.createTable('subjects', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.string('code'); t.string('name'); t.integer('is_lab').defaultTo(0)
  })
  if(!await has('teachers')) await knex.schema.createTable('teachers', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.string('name')
    t.integer('max_periods_per_day').defaultTo(5)
    t.integer('max_periods_per_week').defaultTo(28)
  })
  if(!await has('rooms')) await knex.schema.createTable('rooms', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.string('code'); t.integer('capacity'); t.integer('is_lab').defaultTo(0)
  })
  if(!await has('teacher_subjects')) await knex.schema.createTable('teacher_subjects', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.integer('teacher_id'); t.integer('subject_id')
  })
  if(!await has('class_subjects')) await knex.schema.createTable('class_subjects', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.integer('class_id'); t.integer('subject_id')
  })
  if(!await has('availability_teacher')) await knex.schema.createTable('availability_teacher', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.integer('teacher_id'); t.integer('day'); t.integer('period'); t.integer('available')
  })
  if(!await has('availability_room')) await knex.schema.createTable('availability_room', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.integer('room_id'); t.integer('day'); t.integer('period'); t.integer('available')
  })
  if(!await has('demand_forecast')) await knex.schema.createTable('demand_forecast', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.date('week_start'); t.integer('class_id'); t.integer('subject_id'); t.integer('periods_required')
    t.string('source').defaultTo('ml')
  })
  if(!await has('hard_locks')) await knex.schema.createTable('hard_locks', t=>{
    t.increments('id').primary()
    t.integer('tenant_id'); t.date('week_start'); t.integer('class_id'); t.integer('subject_id')
    t.integer('teacher_id'); t.integer('room_id'); t.integer('day'); t.integer('period')
  })
  if(!await has('timetable')) await knex.schema.createTable('timetable', t=>{
    t.bigIncrements('id').primary()
    t.integer('tenant_id'); t.string('solution_id'); t.date('week_start')
    t.integer('class_id'); t.integer('subject_id'); t.integer('teacher_id'); t.integer('room_id')
    t.integer('day'); t.integer('period'); t.integer('hard_lock').defaultTo(0)
  })
  if(!await has('penalties')) await knex.schema.createTable('penalties', t=>{
    t.increments('id').primary()
    t.integer('tenant_id')
    t.integer('teacher_gap').defaultTo(3)
    t.integer('uneven_subject').defaultTo(2)
    t.integer('room_mismatch').defaultTo(4)
    t.integer('early_or_late').defaultTo(1)
  })

  // === Seeds (idempotent) ===
  const one = async (table, where, data)=> {
    const row = await knex(table).where(where).first()
    if (!row) await knex(table).insert({ ...where, ...data })
  }

  await one('tenants', { id:1 }, { slug:'demo', name:'Demo School' })

  // Classes (5 baseline; you can add more later and it stays portable)
  const classSeed = [
    {id:1, code:'8', section:'A', size:35},
    {id:2, code:'8', section:'B', size:34},
    {id:3, code:'9', section:'A', size:36},
    {id:4, code:'9', section:'B', size:35},
    {id:5, code:'10', section:'A', size:38}
  ]
  for (const c of classSeed) await one('classes', {id:c.id, tenant_id:1}, c)

  // Subjects (6)
  const subjSeed = [
    {id:1, code:'MATH', name:'Mathematics', is_lab:0},
    {id:2, code:'SCI',  name:'Science',     is_lab:1},
    {id:3, code:'ENG',  name:'English',     is_lab:0},
    {id:4, code:'SOC',  name:'Social Studies', is_lab:0},
    {id:5, code:'LANG', name:'Language',    is_lab:0},
    {id:6, code:'COMP', name:'Computer Science', is_lab:1}
  ]
  for (const s of subjSeed) await one('subjects', {id:s.id, tenant_id:1}, s)

  // Teachers (12)
  const teacherSeed = [
    {id:1, name:'Ms. Priya'}, {id:2, name:'Mr. Raj'}, {id:3, name:'Ms. Anu'},
    {id:4, name:'Mr. Kumar'}, {id:5, name:'Ms. Lakshmi'}, {id:6, name:'Mr. Joseph'},
    {id:7, name:'Ms. Fatima'}, {id:8, name:'Mr. Arjun'}, {id:9, name:'Ms. Nisha'},
    {id:10, name:'Mr. Vivek'}, {id:11, name:'Ms. Meera'}, {id:12, name:'Mr. Sandeep'}
  ]
  for (const t of teacherSeed) await one('teachers', {id:t.id, tenant_id:1}, t)

  // Rooms (regular + labs)
  const roomSeed = [
    {id:1, code:'R101', capacity:40, is_lab:0},
    {id:2, code:'R201', capacity:40, is_lab:0},
    {id:3, code:'LAB1', capacity:30, is_lab:1},
    {id:4, code:'R102', capacity:40, is_lab:0},
    {id:5, code:'R202', capacity:40, is_lab:0},
    {id:6, code:'LAB2', capacity:30, is_lab:1}
  ]
  for (const r of roomSeed) await one('rooms', {id:r.id, tenant_id:1}, r)

  // teacher_subjects mapping
  const mapTS = [
    [1,1],[4,1],[10,1],  // MATH
    [2,2],[5,2],         // SCI
    [3,3],[6,3],         // ENG
    [7,4],[12,4],        // SOC
    [8,5],[11,5],        // LANG
    [9,6],[10,6]         // COMP
  ]
  for (const [teacher_id, subject_id] of mapTS) {
    const row = await knex('teacher_subjects').where({tenant_id:1, teacher_id, subject_id}).first()
    if (!row) await knex('teacher_subjects').insert({tenant_id:1, teacher_id, subject_id})
  }

  // class_subjects: all classes take all 6 subjects
  const classes = await knex('classes').where({tenant_id:1})
  for (const c of classes) {
    for (const s of subjSeed) {
      const row = await knex('class_subjects').where({tenant_id:1, class_id:c.id, subject_id:s.id}).first()
      if (!row) await knex('class_subjects').insert({tenant_id:1, class_id:c.id, subject_id:s.id})
    }
  }

  // availability: 5 days x 8 periods (adjust to 12 if you prefer)
  const DAYS = 5, PERIODS = 8
  const teachersAll = await knex('teachers').where({tenant_id:1})
  for (const t of teachersAll) {
    for (let d=0; d<DAYS; d++){
      for (let p=0; p<PERIODS; p++){
        const row = await knex('availability_teacher')
          .where({tenant_id:1, teacher_id:t.id, day:d, period:p}).first()
        if (!row) await knex('availability_teacher')
          .insert({tenant_id:1, teacher_id:t.id, day:d, period:p, available:1})
      }
    }
  }
  const roomsAll = await knex('rooms').where({tenant_id:1})
  for (const r of roomsAll) {
    for (let d=0; d<DAYS; d++){
      for (let p=0; p<PERIODS; p++){
        const row = await knex('availability_room')
          .where({tenant_id:1, room_id:r.id, day:d, period:p}).first()
        if (!row) await knex('availability_room')
          .insert({tenant_id:1, room_id:r.id, day:d, period:p, available:1})
      }
    }
  }

  // penalties default
  const pen = await knex('penalties').where({tenant_id:1}).first()
  if (!pen) await knex('penalties').insert({tenant_id:1})

  console.log('✓ Migration/seed complete for', cfg.client === 'sqlite3' ? 'SQLite' : 'MySQL')
  await knex.destroy()
}

main().catch(e=>{ console.error(e); process.exit(1) })
