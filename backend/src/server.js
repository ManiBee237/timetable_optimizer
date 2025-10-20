import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initStore } from './store/fileStore.js'
import crudRoutes from './routes/crud.files.js'
import optimizeRoutes from './routes/optimize.files.js'

const app = express()
app.use(cors({ origin:true, credentials:true }))
app.use(express.json({ limit:'10mb' }))

app.get('/', (_req,res)=> res.json({ ok:true, name:'TimeWeave API (file-store)' }))
app.use('/api/crud', crudRoutes)
app.use('/api', optimizeRoutes)

const port = process.env.PORT || 4000
await initStore()
app.listen(port, ()=> console.log('API (file-store) listening on :'+port))
