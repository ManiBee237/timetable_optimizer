import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import optimizeRoutes from './routes/optimize.js'
import crudRoutes from './routes/crud.js'

const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '10mb' }))

app.get('/', (_req,res)=> res.json({ ok:true, name:'TimeWeave API' }))
app.use('/api', optimizeRoutes)
app.use('/api/crud', crudRoutes)

// 404 JSON
app.use((req,res)=> res.status(404).json({ error:'Not Found', path:req.originalUrl }))

// 500 JSON
app.use((err,req,res,_next)=>{
  console.error('[API ERROR]', err)
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' })
})

app.listen(process.env.PORT || 4000, ()=>{
  console.log('API listening on :'+(process.env.PORT||4000))
})
