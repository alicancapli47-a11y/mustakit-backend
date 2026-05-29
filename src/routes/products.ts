import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

router.get('/', async (req: Request, res: Response) => {
  const { category } = req.query
  try {
    const products = await prisma.product.findMany({
      where: { active: true, ...(category ? { category: category as string } : {}) },
      orderBy: { createdAt: 'desc' },
    })
    res.json(products)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

router.post('/', async (req: Request, res: Response) => {
  const { name, category, price, unit, description, emoji, sellerId, stock } = req.body
  try {
    const product = await prisma.product.create({
      data: { name, category, price: Number(price), unit, description, emoji, sellerId, stock: Number(stock) },
    })
    res.json({ success: true, product })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

export default router
