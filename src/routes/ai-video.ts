// Bu kodu backend/src/routes/ klasörüne ai-video.ts olarak ekle
// Sonra server.ts'e import edip app.use('/ai-video', aiVideoRouter) ekle

import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'

const router = Router()
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

router.post('/generate', async (req: Request, res: Response) => {
  const { images, resolution = '480p', speed = 'fast', duration = 10 } = req.body

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'En az 1 görsel gerekli' })
  }

  console.log(`AI Video request: ${images.length} görsel, ${resolution}, ${speed}, ${duration}s`)

  try {
    // 1. Claude ile prompt üret
    const refTags = images.map((_: any, i: number) => `@Image${i + 1}`).join(' ')

    const claudeContent: any[] = images.map((b64: string, i: number) => ({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/jpeg',
        data: b64
      }
    }))

    claudeContent.push({
      type: 'text',
      text: `You are an expert at writing Seedance 2.0 AI video generation prompts for architectural renders.

Analyze these ${images.length} building render image(s) carefully. Identify:
- Exact facade material and color (e.g. "warm beige concrete", "grey stone cladding")
- Balcony style and shape
- Building height and proportions
- Distinctive architectural features (entrance, logos, signage, special elements)
- Lighting conditions in each render
- Street/environment context

Then write a Seedance 2.0 prompt that:
1. Starts with reference tags: ${refTags}
2. Precisely describes the building's unique visual identity so the AI maintains perfect consistency
3. Includes 3-4 smooth cinematic drone camera movements (no text overlays, no voiceover, no timelapse)
4. Ends with: "Epic cinematic orchestral soundtrack, powerful and triumphant, no lyrics. Photorealistic. No text, no voiceover, no subtitles."

Write ONLY the prompt, nothing else. No explanation, no preamble.`
    })

    const claudeResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: claudeContent }]
    })

    const prompt = (claudeResponse.content[0] as any).text.trim()
    console.log('Claude prompt üretildi:', prompt.substring(0, 100) + '...')

    // 2. EvoLink'e gönder
    const modelName = speed === 'fast' ? 'seedance-2-0-fast' : 'seedance-2-0'

    const evolinkBody = {
      model: modelName,
      prompt,
      resolution,
      duration,
      images: images.map((b64: string, i: number) => ({
        image: b64,
        tag: `Image${i + 1}`
      }))
    }

    const evolinkResponse = await fetch('https://api.evolink.ai/v1/video/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}`
      },
      body: JSON.stringify(evolinkBody)
    })

    const evolinkData = await evolinkResponse.json() as any

    if (!evolinkResponse.ok) {
      throw new Error(evolinkData.message || evolinkData.error || 'EvoLink API hatası')
    }

    console.log('EvoLink task oluşturuldu:', evolinkData.task_id || evolinkData.id)

    res.json({
      success: true,
      prompt,
      taskId: evolinkData.task_id || evolinkData.id,
      raw: evolinkData
    })

  } catch (error: any) {
    console.error('AI Video error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

// Video durumu kontrol endpoint'i
router.get('/status/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params

  try {
    const response = await fetch(`https://api.evolink.ai/v1/video/task/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}` }
    })

    const data = await response.json()
    res.json(data)

  } catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
