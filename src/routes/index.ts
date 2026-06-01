import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import dotenv from 'dotenv'
import { rateLimit } from 'express-rate-limit'
import { PrismaClient } from '@prisma/client'

import authRoutes from './routes/auth'
import emailAuthRoutes from './routes/emailAuth'
import projectRoutes from './routes/projects'
import professionalRoutes from './routes/professionals'
import productRoutes from './routes/products'
import adminRoutes from './routes/admin'
import uploadRoutes from './routes/upload'
import mailRoutes from './routes/mail'
import notificationRoutes from './routes/notifications'
import studioRoutes from './routes/studio'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 4000
const prisma = new PrismaClient()

app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({
  origin: [
    process.env.FRONTEND_URL || 'http://localhost:3000',
    'https://mustakit.com',
    'https://www.mustakit.com',
    'https://studio.mustakit.com',
  ],
  credentials: true,
}))

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { error: 'Çok fazla istek. Lütfen bekleyin.' },
})
app.use(limiter)
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

app.use('/auth', authRoutes)
app.use('/email-auth', emailAuthRoutes)
app.use('/projects', projectRoutes)
app.use('/professionals', professionalRoutes)
app.use('/products', productRoutes)
app.use('/admin', adminRoutes)
app.use('/upload', uploadRoutes)
app.use('/mail', mailRoutes)
app.use('/notifications', notificationRoutes)
app.use('/studio', studioRoutes)

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

async function main() {
  try {
    await prisma.$connect()
    console.log('✅ Veritabanı bağlantısı başarılı')
  } catch (error) {
    console.error('❌ Veritabanı bağlantı hatası:', error)
  }
  app.listen(PORT, () => {
    console.log(`🚀 Müstakit API — Port ${PORT}`)
  })
}

main()
