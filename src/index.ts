import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'

import authRoutes from './routes/auth'
import projectRoutes from './routes/projects'
import professionalRoutes from './routes/professionals'
import productRoutes from './routes/products'
import adminRoutes from './routes/admin'
import uploadRoutes from './routes/upload'
import mailRoutes from './routes/mail'
import notificationRoutes from './routes/notifications'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000

// Security
app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://mustakit.com',
    'https://www.mustakit.com',
  ],
  credentials: true,
}))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 dakika
  max: 100,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
})
app.use(limiter)

app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// Routes
app.use('/auth', authRoutes)
app.use('/projects', projectRoutes)
app.use('/professionals', professionalRoutes)
app.use('/products', productRoutes)
app.use('/admin', adminRoutes)
app.use('/upload', uploadRoutes)
app.use('/mail', mailRoutes)
app.use('/notifications', notificationRoutes)

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

app.listen(PORT, () => {
  console.log(`🚀 Müstakit API — Port ${PORT}`)
})

export default app
