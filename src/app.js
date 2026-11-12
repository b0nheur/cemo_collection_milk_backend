import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import authRoutes from './routes/auth.js'
import recordRoutes from './routes/records.js'
import reportRoutes from './routes/reports.js'

const app = express()
app.disable('x-powered-by')
app.use(helmet())
app.use(cors({
  origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((item) => item.trim()) : 'http://localhost:5173',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}))
app.use(express.json({ limit: '1mb' }))
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false }))
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'CEMO Milk Management API' }))
app.use('/api/auth', authRoutes)
app.use('/api', recordRoutes)
app.use('/api/reports', reportRoutes)
app.use((req, res) => res.status(404).json({ message: 'API route not found.' }))
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  console.error(error)
  const status = Number(error.status) || (error.code === 'ER_DUP_ENTRY' ? 409 : 500)
  return res.status(status).json({ message: status === 500 ? 'An unexpected server error occurred.' : error.message })
})

export default app
