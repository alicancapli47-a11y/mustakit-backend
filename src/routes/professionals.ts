import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { Resend } from 'resend'

const router = Router()
const prisma = new PrismaClient()
const resend = new Resend(process.env.RESEND_API_KEY)

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

// Profesyonel başvuru - kayıt
router.post('/', async (req: Request, res: Response) => {
  const { userId, name, email, type, bio, city, phone, experience, priceMin, priceMax, certFile, idFile } = req.body

  if (!userId || !type || !city) {
    return res.status(400).json({ error: 'Kullanıcı, uzmanlık alanı ve şehir zorunludur' })
  }

  try {
    const professional = await prisma.professional.upsert({
      where: { userId },
      update: { type, bio, city, priceMin, priceMax },
      create: { userId, type, bio, city, priceMin, priceMax },
    })

    // Bize bildirim maili
    resend.emails.send({
      from: 'Müstakit <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `👷 Yeni Usta Başvurusu — ${name} | ${type} | ${city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit</div>
          <p style="color:#777;margin-bottom:20px;">Yeni usta/uzman başvurusu geldi</p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;font-size:14px;line-height:1.8;">
            <b>Ad:</b> ${name}<br>
            <b>E-posta:</b> <a href="mailto:${email}">${email}</a><br>
            <b>Telefon:</b> ${phone || '—'}<br>
            <b>Uzmanlık:</b> ${type}<br>
            <b>Şehir:</b> ${city}<br>
            <b>Deneyim:</b> ${experience ? experience + ' yıl' : '—'}<br>
            <b>Ücret:</b> ${priceMin || '—'} – ${priceMax || '—'} TL/gün<br>
            ${bio ? `<b>Hakkında:</b> ${bio}<br>` : ''}
            ${certFile ? `<b>Uzmanlık Belgesi:</b> ${certFile}<br>` : ''}
            ${idFile ? `<b>Kimlik:</b> ${idFile}<br>` : ''}
          </div>
          <a href="https://mustakit.com/admin/onaylar" 
             style="display:inline-block;background:#F26419;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">
            Admin Panelinde Onayla →
          </a>
        </div>
      `,
    }).catch(e => console.error('Mail hatası:', e))

    // Başvuru sahibine onay maili
    if (email) {
      resend.emails.send({
        from: 'Müstakit <info@mustakit.com>',
        to: email,
        subject: 'Başvurunuz alındı — Müstakit',
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit</div>
            <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${name}!</h2>
            <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
              <b>${type}</b> uzmanlık başvurunuz alındı. Ekibimiz bilgilerinizi inceleyecek ve 1-2 iş günü içinde size geri dönecektir.
            </p>
            <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;">
              <b>Uzmanlık:</b> ${type}<br>
              <b>Şehir:</b> ${city}<br>
              <b>Durum:</b> İnceleniyor
            </div>
            <p style="margin-top:20px;font-size:13px;color:#999;">
              Sorular için <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a>
            </p>
          </div>
        `,
      }).catch(e => console.error('Müşteri mail hatası:', e))
    }

    res.json({ success: true, professional })
  } catch (error) {
    console.error('Professional create error:', error)
    res.status(500).json({ error: 'Kayıt başarısız' })
  }
})

export default router
