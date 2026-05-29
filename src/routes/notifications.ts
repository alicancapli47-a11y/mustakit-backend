import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

router.get('/:userId', async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    res.json(notifications)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

router.patch('/:id/read', async (req: Request, res: Response) => {
  try {
    await prisma.notification.update({ where: { id: req.params.id }, data: { read: true } })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

export default router
