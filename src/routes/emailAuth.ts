import { Router, Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import nodemailer from 'nodemailer'
import crypto from 'crypto'

const router = Router()
const prisma = new PrismaClient()

const JWT_SECRET = process.env.JWT_SECRET || 'mustakit_jwt_secret'

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
})

// Kayıt ol
router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password, phone, city, userType, acceptedTerms } = req.body

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Ad, e-posta ve şifre zorunludur' })
  }

  if (!acceptedTerms) {
    return res.status(400).json({ error: 'Kullanım koşullarını kabul etmelisiniz' })
  }

  if (password.length < 8) {
    return res.status(400).json({ error: 'Şifre en az 8 karakter olmalıdır' })
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return res.status(400).json({ error: 'Bu e-posta zaten kayıtlı' })
    }

    const hashedPassword = await bcrypt.hash(password, 12)
    const verifyToken = crypto.randomBytes(32).toString('hex')

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        phone,
        city,
        userType: userType || 'ARSA_SAHIBI',
        emailVerified: false,
        verifyToken,
        acceptedTerms: true,
        acceptedTermsAt: new Date(),
      },
    })

    // Doğrulama maili gönder
    const verifyUrl = `${process.env.FRONTEND_URL}/dogrula?token=${verifyToken}`
    await transporter.sendMail({
      from: `"Müstakit" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'E-posta adresinizi doğrulayın — Müstakit',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Hoş geldiniz, ${name}!</h2>
          <p style="color:#555;line-height:1.7;margin-bottom:24px;">
            Hesabınızı aktifleştirmek için aşağıdaki butona tıklayın.
          </p>
          <a href="${verifyUrl}" style="display:inline-block;background:#F26419;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            E-postamı Doğrula
          </a>
          <p style="color:#999;font-size:12px;margin-top:24px;">
            Bu link 24 saat geçerlidir. Eğer siz kayıt olmadıysanız bu maili görmezden gelin.
          </p>
        </div>
      `,
    })

    res.json({ success: true, message: 'Doğrulama maili gönderildi' })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Kayıt başarısız' })
  }
})

// E-posta doğrula
router.get('/verify', async (req: Request, res: Response) => {
  const { token } = req.query

  if (!token) return res.status(400).json({ error: 'Token gerekli' })

  try {
    const user = await prisma.user.findFirst({
      where: { verifyToken: token as string },
    })

    if (!user) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token' })

    await prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, verifyToken: null },
    })

    res.json({ success: true, message: 'E-posta doğrulandı' })
  } catch (error) {
    res.status(500).json({ error: 'Doğrulama başarısız' })
  }
})

// Giriş yap
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre zorunludur' })
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })

    if (!user || !user.password) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' })
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return res.status(401).json({ error: 'E-posta veya şifre hatalı' })
    }

    if (!user.emailVerified) {
      return res.status(401).json({ error: 'Lütfen önce e-postanızı doğrulayın' })
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '30d' }
    )

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        membershipType: user.membershipType,
        image: user.image,
      },
    })
  } catch (error) {
    res.status(500).json({ error: 'Giriş başarısız' })
  }
})

// Şifre sıfırlama isteği
router.post('/forgot-password', async (req: Request, res: Response) => {
  const { email } = req.body

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) return res.json({ success: true }) // Güvenlik için her zaman success döndür

    const resetToken = crypto.randomBytes(32).toString('hex')
    const resetExpiry = new Date(Date.now() + 3600000) // 1 saat

    await prisma.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry: resetExpiry },
    })

    const resetUrl = `${process.env.FRONTEND_URL}/sifre-sifirla?token=${resetToken}`
    await transporter.sendMail({
      from: `"Müstakit" <${process.env.SMTP_FROM}>`,
      to: email,
      subject: 'Şifre sıfırlama — Müstakit',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit</div>
          <p style="color:#555;line-height:1.7;margin-bottom:24px;">
            Şifrenizi sıfırlamak için aşağıdaki butona tıklayın. Link 1 saat geçerlidir.
          </p>
          <a href="${resetUrl}" style="display:inline-block;background:#F26419;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            Şifremi Sıfırla
          </a>
        </div>
      `,
    })

    res.json({ success: true })
  } catch (error) {
    res.status(500).json({ error: 'Hata oluştu' })
  }
})

// Şifre sıfırla
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, password } = req.body

  try {
    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })

    if (!user) return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş link' })

    const hashedPassword = await bcrypt.hash(password, 12)
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword, resetToken: null, resetTokenExpiry: null },
    })

    res.json({ success: true, message: 'Şifre güncellendi' })
  } catch (error) {
    res.status(500).json({ error: 'Hata oluştu' })
  }
})

export default router
