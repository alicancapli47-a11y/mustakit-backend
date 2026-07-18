import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import { v2 as cloudinary } from 'cloudinary'

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

router.post('/generate', async (req: Request, res: Response) => {
  const { images, prompt: customPrompt, resolution = '480p', speed = 'fast', duration = 10, analyzeOnly = false } = req.body

  if (!images || !Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: 'En az 1 görsel gerekli' })
  }

  console.log(`AI Video request: ${images.length} görsel, ${resolution}, ${speed}, ${duration}s, analyzeOnly: ${analyzeOnly}`)

  try {
    // 1. Claude ile prompt üret
    const refTags = images.map((_: any, i: number) => `@Image${i + 1}`).join(' ')

    const claudeContent: any[] = images.map((b64: string) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
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

    const prompt = customPrompt || (claudeResponse.content[0] as any).text.trim()
    console.log('Claude prompt:', prompt.substring(0, 100) + '...')

    // Sadece prompt isteniyorsa burada dur
    if (analyzeOnly) {
      return res.json({ success: true, prompt })
    }

    // 2. Görselleri Cloudinary'e yükle → URL al
    console.log('Cloudinary\'e yükleniyor...')
    const imageUrls = await Promise.all(images.map((b64: string, i: number) => uploadToCloudinary(b64, i)))
    console.log('Cloudinary URLs:', imageUrls)

    // 3. EvoLink'e gönder
    const evolinkBody = {
      model: 'seedance-2.0-reference-to-video',
      prompt,
      image_urls: imageUrls,
      duration,
      quality: resolution,
      aspect_ratio: '16:9',
      generate_audio: true,
      content_filter: true,
    }

    const evolinkResponse = await fetch('https://api.evolink.ai/v1/videos/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}`
      },
      body: JSON.stringify(evolinkBody)
    })

    const evolinkData = await evolinkResponse.json() as any
    console.log('EvoLink response:', JSON.stringify(evolinkData).substring(0, 200))

    if (!evolinkResponse.ok) {
      const errMsg = evolinkData?.error?.message || evolinkData?.message || JSON.stringify(evolinkData)
      throw new Error(`EvoLink: ${errMsg}`)
    }

    console.log('EvoLink task ID:', evolinkData.id)

    res.json({
      success: true,
      prompt,
      taskId: evolinkData.id,
      status: evolinkData.status,
      estimatedTime: evolinkData.task_info?.estimated_time,
    })

  } catch (error: any) {
    console.error('AI Video error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

// Video durum kontrolü
router.get('/status/:taskId', async (req: Request, res: Response) => {
  const { taskId } = req.params

  try {
    const response = await fetch(`https://api.evolink.ai/v1/videos/generations/${taskId}`, {
      headers: { 'Authorization': `Bearer ${process.env.EVOLINK_API_KEY}` }
    })

    const data = await response.json() as any

    res.json({
      status: data.status,
      progress: data.progress,
      videoUrl: data.task_info?.video_url || data.video_url || null,
      raw: data
    })

  } catch (error: any) {
    res.status(500).json({ error: error?.message })
  }
})

export default router
