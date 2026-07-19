import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { v2 as cloudinary } from 'cloudinary'
import ffmpeg from 'fluent-ffmpeg'
import * as fs from 'fs'
import * as path from 'path'
import * as https from 'https'
import * as os from 'os'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

async function uploadToCloudinary(base64: string, index: number): Promise<string> {
  const result = await cloudinary.uploader.upload(`data:image/jpeg;base64,${base64}`, {
    folder: 'mustakit-ai-video',
    public_id: `render-${Date.now()}-${index}`,
    resource_type: 'image',
  })
  return result.secure_url
}

async function uploadVideoToCloudinary(filePath: string): Promise<string> {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: 'mustakit-ai-video-output',
    resource_type: 'video',
    public_id: `merged-${Date.now()}`,
  })
  return result.secure_url
}

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, res => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', err => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

function mergeVideos(inputPaths: string[], outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const listFile = outputPath + '.txt'
    const content = inputPaths.map(p => `file '${p}'`).join('\n')
    fs.writeFileSync(listFile, content)

    ffmpeg()
      .input(listFile)
      .inputOptions(['-f concat', '-safe 0'])
      .outputOptions(['-c copy'])
      .output(outputPath)
      .on('end', () => {
        fs.unlinkSync(listFile)
        resolve()
      })
      .on('error', (err: any) => {
        fs.unlinkSync(listFile)
        reject(err)
      })
      .run()
  })
}

async function generateEvolinkVideo(prompt: string, imageUrls: string[], duration: number, quality: string): Promise<string> {
  const evolinkBody = {
    model: 'seedance-2.0-reference-to-video',
    prompt,
    image_urls: imageUrls,
    duration,
    quality,
    aspect_ratio: '16:9',
    generate_audio: true,
    content_filter: true,
  }

  const response = await fetch('https://api.evolink.ai/v1/videos/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}`
    },
    body: JSON.stringify(evolinkBody)
  })

  const data = await response.json() as any
  if (!response.ok) throw new Error(data?.error?.message || 'EvoLink hatası')

  return data.id
}

async function waitForVideo(taskId: string, maxWait = 300000): Promise<string> {
  const start = Date.now()
  while (Date.now() - start < maxWait) {
    await new Promise(r => setTimeout(r, 8000))

    const response = await fetch(`https://api.evolink.ai/v1/videos/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}` }
    })
    const data = await response.json() as any

    console.log(`Task ${taskId}: ${data.status} (${data.progress}%)`)

    if (data.status === 'completed') {
      const url = data.results?.[0] || data.result_data?.[0]?.url
      if (url) return url
      throw new Error('Video URL bulunamadı')
    }
    if (data.status === 'failed') throw new Error('EvoLink video üretimi başarısız')
  }
  throw new Error('Zaman aşımı')
}

// Ana endpoint - prompt üret + tek klip
router.post('/generate', async (req: Request, res: Response) => {
  const { images, prompt: customPrompt, resolution = '480p', speed = 'fast', duration = 10, analyzeOnly = false } = req.body

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'En az 1 görsel gerekli' })
  }

  console.log(`AI Video: ${images.length} görsel, ${resolution}, ${duration}s, analyzeOnly: ${analyzeOnly}`)

  try {
    const refTags = images.map((_: any, i: number) => `@Image${i + 1}`).join(' ')

    const claudeContent: any[] = images.map((b64: string) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }))

    claudeContent.push({
      type: 'text',
      text: `You are an expert at writing Seedance 2.0 AI video generation prompts for architectural renders.

Analyze these ${images.length} building render image(s). Identify:
- Exact facade material and color
- Balcony style and shape
- Building height and proportions
- Distinctive architectural features (entrance, logos, signage)
- Lighting conditions
- Street/environment context

Write a Seedance 2.0 prompt that:
1. Starts with: ${refTags}
2. Precisely describes the building's unique visual identity for perfect consistency
3. Includes 3-4 smooth cinematic drone movements (no text, no voiceover, no timelapse)
4. Ends with: "Epic cinematic orchestral soundtrack, powerful and triumphant, no lyrics. Photorealistic. No text, no voiceover, no subtitles."

Write ONLY the prompt, nothing else.`
    })

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: claudeContent }]
    })

    const prompt = customPrompt || (claudeResponse.content[0] as any).text.trim()

    if (analyzeOnly) return res.json({ success: true, prompt })

    const imageUrls = await Promise.all(images.map((b64: string, i: number) => uploadToCloudinary(b64, i)))
    const taskId = await generateEvolinkVideo(prompt, imageUrls, duration, resolution)

    res.json({ success: true, prompt, taskId, status: 'pending' })

  } catch (error: any) {
    console.error('AI Video error:', error?.message)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

// 30 saniye video - 2 klip üret + birleştir
router.post('/generate-30s', async (req: Request, res: Response) => {
  const { images, prompt: customPrompt, resolution = '720p' } = req.body

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'En az 1 görsel gerekli' })
  }

  console.log(`30s Video başlatıldı: ${images.length} görsel, ${resolution}`)

  try {
    // Görselleri Cloudinary'e yükle
    const imageUrls = await Promise.all(images.map((b64: string, i: number) => uploadToCloudinary(b64, i)))

    const prompt = customPrompt || `@Image1 cinematic drone video of this building. Slow smooth aerial movements. Epic cinematic orchestral soundtrack. Photorealistic. No text, no voiceover.`

    // İki klip paralel üret
    console.log('2 klip paralel üretiliyor...')
    const [taskId1, taskId2] = await Promise.all([
      generateEvolinkVideo(prompt, imageUrls, 15, resolution),
      generateEvolinkVideo(prompt, imageUrls, 15, resolution),
    ])

    console.log('Task 1:', taskId1, '| Task 2:', taskId2)

    // İkisini de bekle
    const [url1, url2] = await Promise.all([
      waitForVideo(taskId1),
      waitForVideo(taskId2),
    ])

    console.log('Videolar hazır, indiriliyor...')

    // Geçici dosyalara indir
    const tmpDir = os.tmpdir()
    const file1 = path.join(tmpDir, `v1-${Date.now()}.mp4`)
    const file2 = path.join(tmpDir, `v2-${Date.now()}.mp4`)
    const merged = path.join(tmpDir, `merged-${Date.now()}.mp4`)

    await Promise.all([
      downloadFile(url1, file1),
      downloadFile(url2, file2),
    ])

    // FFmpeg ile birleştir
    console.log('FFmpeg ile birleştiriliyor...')
    await mergeVideos([file1, file2], merged)

    // Cloudinary'e yükle
    console.log('Cloudinary\'e yükleniyor...')
    const finalUrl = await uploadVideoToCloudinary(merged)

    // Geçici dosyaları temizle
    ;[file1, file2, merged].forEach(f => { try { fs.unlinkSync(f) } catch {} })

    console.log('30s video hazır:', finalUrl)
    res.json({ success: true, videoUrl: finalUrl, taskId1, taskId2 })

  } catch (error: any) {
    console.error('30s Video error:', error?.message)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

// Durum kontrolü
router.get('/status/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params
  try {
    const response = await fetch(`https://api.evolink.ai/v1/videos/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}` }
    })
    const data = await response.json() as any
    const videoUrl = data.results?.[0] || data.result_data?.[0]?.url || null
    res.json({ status: data.status, progress: data.progress, videoUrl, raw: data })
  } catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
