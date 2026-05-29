import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// AI Maliyet tahmini hesapla
function calcEstimate(area: number, city: string) {
  const baseMin = 8000
  const baseMax = 15000
  const cityMultiplier: Record<string, number> = {
    istanbul: 1.4,
    ankara: 1.2,
    izmir: 1.25,
    antalya: 1.2,
    default: 1.0,
  }
  const mult = cityMultiplier[city.toLowerCase()] || cityMultiplier.default
  return {
    min: Math.round(area * baseMin * mult),
    max: Math.round(area * baseMax * mult),
    breakdown: {
      ruhsat: Math.round(area * 1500 * mult),
      kabaInsaat: Math.round(area * 6000 * mult),
      tesisat: Math.round(area * 2000 * mult),
      inceIsler: Math.round(area * 3000 * mult),
      peyzaj: Math.round(area * 1000 * mult),
    },
    duration: area < 100 ? '3-4 ay' : area < 150 ? '4-6 ay' : '6-9 ay',
  }
}

// Yeni proje oluştur
router.post('/', async (req: Request, res: Response) => {
  const { userId, name, city, area, budget, description } = req.body

  if (!userId || !name || !city || !area) {
    return res.status(400).json({ error: 'Eksik alan' })
  }

  try {
    const aiEstimate = calcEstimate(Number(area), city)
    const project = await prisma.project.create({
      data: {
        userId,
        name,
        city,
        area: Number(area),
        budget: budget ? Number(budget) : undefined,
        description,
        aiEstimate,
      },
    })
    res.json({ success: true, project })
  } catch (error) {
    res.status(500).json({ error: 'Proje oluşturulamadı' })
  }
})

// Kullanıcının projeleri
router.get('/user/:userId', async (req: Request, res: Response) => {
  try {
    const projects = await prisma.project.findMany({
      where: { userId: req.params.userId },
      include: {
        escrow: true,
        bids: { include: { professional: { include: { user: true } } } },
        photos: { orderBy: { takenAt: 'desc' }, take: 5 },
      },
      orderBy: { createdAt: 'desc' },
    })
    res.json(projects)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Proje detay
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        escrow: true,
        bids: { include: { professional: { include: { user: true } } } },
        photos: { orderBy: { takenAt: 'desc' } },
        documents: true,
        user: true,
      },
    })
    if (!project) return res.status(404).json({ error: 'Proje bulunamadı' })
    res.json(project)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Aşama güncelle
router.patch('/:id/stage', async (req: Request, res: Response) => {
  const { stage } = req.body
  try {
    const project = await prisma.project.update({
      where: { id: req.params.id },
      data: { stage },
    })
    res.json({ success: true, project })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// AI tahmini al
router.post('/estimate', async (req: Request, res: Response) => {
  const { area, city } = req.body
  if (!area || !city) return res.status(400).json({ error: 'Alan ve şehir gerekli' })
  const estimate = calcEstimate(Number(area), city)
  res.json(estimate)
})

export default router
