import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

// Google ile giriş — NextAuth'dan çağrılır
router.post('/google', async (req: Request, res: Response) => {
  const { email, name, image, googleId } = req.body

  try {
    let user = await prisma.user.findUnique({ where: { email } })

    if (!user) {
      user = await prisma.user.create({
        data: { email, name, image, googleId },
      })
    } else {
      user = await prisma.user.update({
        where: { email },
        data: { name, image, googleId },
      })
    }

    res.json({ success: true, user })
  } catch (error) {
    res.status(500).json({ error: 'Kullanıcı kaydı başarısız' })
  }
})

// Kullanıcı bilgisi
router.get('/me', async (req: Request, res: Response) => {
  const { email } = req.query

  if (!email) return res.status(400).json({ error: 'Email gerekli' })

  try {
    const user = await prisma.user.findUnique({
      where: { email: email as string },
      include: { professional: true },
    })

    if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı' })

    res.json(user)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

export default router
