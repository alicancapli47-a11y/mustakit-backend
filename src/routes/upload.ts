import { Router, Request, Response } from 'express'
import multer from 'multer'
import { v2 as cloudinary } from 'cloudinary'
import { PrismaClient } from '@prisma/client'

const router = Router()
const prisma = new PrismaClient()

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
      cb(null, true)
    } else {
      cb(new Error('Sadece resim ve PDF yüklenebilir'))
    }
  },
})

// Proje fotoğrafı yükle
router.post('/photo/:projectId', upload.single('photo'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' })

  const { projectId } = req.params
  const { stage, lat, lng } = req.body

  try {
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `mustakit/projects/${projectId}`, resource_type: 'image' },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      ).end(req.file!.buffer)
    })

    const photo = await prisma.projectPhoto.create({
      data: {
        projectId,
        url: result.secure_url,
        stage: stage || 'TEMEL',
        lat: lat ? Number(lat) : undefined,
        lng: lng ? Number(lng) : undefined,
      },
    })

    res.json({ success: true, photo, url: result.secure_url })
  } catch (error) {
    res.status(500).json({ error: 'Yükleme başarısız' })
  }
})

// Belge yükle (ruhsat, tapu vs)
router.post('/document/:projectId', upload.single('document'), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya bulunamadı' })

  const { projectId } = req.params
  const { type } = req.body

  try {
    const result = await new Promise<any>((resolve, reject) => {
      cloudinary.uploader.upload_stream(
        { folder: `mustakit/documents/${projectId}`, resource_type: 'auto' },
        (error, result) => {
          if (error) reject(error)
          else resolve(result)
        }
      ).end(req.file!.buffer)
    })

    const document = await prisma.projectDocument.create({
      data: { projectId, type: type || 'diger', url: result.secure_url },
    })

    res.json({ success: true, document, url: result.secure_url })
  } catch (error) {
    res.status(500).json({ error: 'Yükleme başarısız' })
  }
})

export default router
