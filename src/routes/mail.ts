import { Router, Request, Response } from 'express'
import nodemailer from 'nodemailer'

const router = Router()

const getTransporter = () => nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

router.post('/send', async (req: Request, res: Response) => {
  const { to, subject, body } = req.body
  if (!to || !subject || !body) return res.status(400).json({ error: 'Eksik alan' })

  try {
    await getTransporter().sendMail({
      from: `"Müstakit" <${process.env.SMTP_FROM || 'info@mustakit.com'}>`,
      to,
      subject,
      html: `<div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
        <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit</div>
        <div style="font-size:15px;line-height:1.7;">${body}</div>
      </div>`,
    })
    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Mail gönderilemedi' })
  }
})

export default router
