import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// Profesyoneller listesi
router.get('/', async (req: Request, res: Response) => {
  const { type, city, verified } = req.query
  try {
    const where: any = {}
    if (type) where.type = type
    if (city) where.city = { contains: city as string, mode: 'insensitive' }
    if (verified === 'true') where.verified = true

    const professionals = await prisma.professional.findMany({
      where,
      include: { user: { select: { name: true, image: true, email: true } } },
      orderBy: { rating: 'desc' },
    })
    res.json(professionals)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Profesyonel profil oluştur
router.post('/', async (req: Request, res: Response) => {
  const { userId, type, bio, city, priceMin, priceMax } = req.body
  try {
    const professional = await prisma.professional.upsert({
      where: { userId },
      update: { type, bio, city, priceMin, priceMax },
      create: { userId, type, bio, city, priceMin, priceMax },
    })
    res.json({ success: true, professional })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

export default router
