import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import nodemailer from 'nodemailer'

const router = Router()
const prisma = new PrismaClient()

// Admin middleware — basit API key kontrolü
const adminAuth = (req: Request, res: Response, next: Function) => {
  const key = req.headers['x-admin-key']
  if (key !== process.env.ADMIN_SECRET_KEY) {
    return res.status(403).json({ error: 'Yetkisiz erişim' })
  }
  next()
}

// Dashboard istatistikleri
router.get('/stats', adminAuth, async (req: Request, res: Response) => {
  try {
    const [users, projects, professionals, products] = await Promise.all([
      prisma.user.count(),
      prisma.project.count({ where: { status: 'ACTIVE' } }),
      prisma.professional.count({ where: { verified: true } }),
      prisma.product.count({ where: { active: true } }),
    ])

    const escrows = await prisma.escrow.findMany({
      where: { status: 'AKTIF' },
    })
    const escrowTotal = escrows.reduce((sum, e) => sum + e.amount, 0)

    res.json({ users, activeProjects: projects, professionals, products, escrowTotal })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Tüm kullanıcılar
router.get('/users', adminAuth, async (req: Request, res: Response) => {
  const { page = 1, limit = 20, search } = req.query
  const skip = (Number(page) - 1) * Number(limit)

  try {
    const where = search
      ? {
          OR: [
            { name: { contains: search as string, mode: 'insensitive' as any } },
            { email: { contains: search as string, mode: 'insensitive' as any } },
          ],
        }
      : {}

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: { professional: true },
      }),
      prisma.user.count({ where }),
    ])

    res.json({ users, total, page: Number(page), limit: Number(limit) })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Profesyonel onaylama
router.patch('/professionals/:id/verify', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params
  try {
    const professional = await prisma.professional.update({
      where: { id },
      data: { verified: true },
    })
    res.json({ success: true, professional })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Toplu e-posta gönder
router.post('/mail/bulk', adminAuth, async (req: Request, res: Response) => {
  const { subject, body, filter } = req.body

  if (!subject || !body) {
    return res.status(400).json({ error: 'Konu ve içerik zorunlu' })
  }

  try {
    // Kullanıcıları filtrele
    const where: any = {}
    if (filter === 'professionals') {
      where.professional = { isNot: null }
    } else if (filter === 'premium') {
      where.membershipType = { in: ['STANDARD', 'PREMIUM'] }
    }

    const users = await prisma.user.findMany({ where, select: { email: true, name: true } })

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    let sentCount = 0
    const batchSize = 50

    for (let i = 0; i < users.length; i += batchSize) {
      const batch = users.slice(i, i + batchSize)
      await Promise.all(
        batch.map(user =>
          transporter.sendMail({
            from: `"Müstakit" <${process.env.SMTP_FROM || 'info@mustakit.com'}>`,
            to: user.email,
            subject,
            html: `
              <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
                <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit</div>
                <div style="font-size:15px;color:#1A1A1A;line-height:1.7;">
                  Merhaba ${user.name?.split(' ')[0] || ''},<br/><br/>
                  ${body}
                </div>
                <div style="margin-top:32px;padding-top:24px;border-top:1px solid #E0D9D0;font-size:12px;color:#777;">
                  Bu e-postayı almak istemiyorsanız <a href="mailto:info@mustakit.com">buradan</a> bize yazın.
                </div>
              </div>
            `,
          }).then(() => sentCount++)
        )
      )
      // Rate limit için bekle
      if (i + batchSize < users.length) {
        await new Promise(r => setTimeout(r, 1000))
      }
    }

    // Gönderim kaydı
    await prisma.bulkEmail.create({
      data: {
        subject,
        body,
        sentTo: sentCount,
        sentBy: 'admin',
      },
    })

    res.json({ success: true, sentTo: sentCount })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Mail gönderilemedi' })
  }
})

// Bildirim geçmişi
router.get('/mail/history', adminAuth, async (req: Request, res: Response) => {
  try {
    const history = await prisma.bulkEmail.findMany({
      orderBy: { sentAt: 'desc' },
      take: 20,
    })
    res.json(history)
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

// Bekleyen onaylar
router.get('/pending', adminAuth, async (req: Request, res: Response) => {
  try {
    const [professionals, documents] = await Promise.all([
      prisma.professional.findMany({
        where: { verified: false },
        include: { user: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.projectDocument.findMany({
        where: { verified: false },
        include: { project: { include: { user: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    res.json({ professionals, documents })
  } catch (error) {
    res.status(500).json({ error: 'Hata' })
  }
})

export default router
