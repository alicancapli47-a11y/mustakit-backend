import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const variantId = isTest ? process.env.LS_VARIANT_ID_TEST : process.env.LS_VARIANT_ID_LIVE

  console.log('LS Config:', {
    isTest,
    storeId: process.env.LS_STORE_ID,
    variantId,
    hasApiKey: !!process.env.LS_API_KEY,
  })

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: 125000,
        test_mode: isTest,
        checkout_data: {
          email: data.email,
          name: data.name,
          custom: {
            phone: data.phone,
            city: data.city,
            area: String(data.area),
          },
        },
        product_options: {
          redirect_url: 'https://studio.mustakit.com',
          receipt_thank_you_note: 'Siparişiniz alındı! 1-2 iş günü içinde videonuzu göndereceğiz.',
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: String(process.env.LS_STORE_ID) },
        },
        variant: {
          data: { type: 'variants', id: String(variantId) },
        },
      },
    },
  }

  const res = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      'Authorization': `Bearer ${process.env.LS_API_KEY}`,
    },
    body: JSON.stringify(body),
  })

  const json = await res.json() as any
  console.log('LS Response status:', res.status)
  console.log('LS Response:', JSON.stringify(json).slice(0, 500))

  if (!res.ok) {
    throw new Error(`LS API hatası: ${JSON.stringify(json?.errors || json)}`)
  }

  return json?.data?.attributes?.url
}

router.post('/order', async (req: Request, res: Response) => {
  const d = req.body

  try {
    const checkoutUrl = await createCheckout(d)

    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Ödeme linki oluşturulamadı' })
    }

    // Bize mail gönder (async, cevabı bekleme)
    resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'info@mustakit.com',
      subject: `🎬 Yeni Studio Siparişi — ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Ad:</b> ${d.name}<br>
            <b>E-posta:</b> ${d.email}<br>
            <b>Telefon:</b> ${d.phone}<br>
            <b>Firma:</b> ${d.company || '—'}<br>
          </div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Konum:</b> ${d.city} / ${d.district} ${d.neighborhood || ''}<br>
            <b>Alan:</b> ${d.area} m²<br>
            <b>İmar:</b> ${d.zoning}<br>
            <b>Fiyat:</b> ${d.price ? Number(d.price).toLocaleString('tr-TR') + ' TL' : '—'}<br>
            <b>Altyapı:</b> ${d.infra || '—'}<br>
            ${d.maps_link ? `<b>Harita:</b> <a href="${d.maps_link}">Google Maps</a><br>` : ''}
            ${d.drone_link ? `<b>Drone:</b> <a href="${d.drone_link}">Video</a><br>` : ''}
          </div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Açıklama:</b><br>${d.description}<br>
            ${d.highlights ? `<br><b>Vurgulanacaklar:</b><br>${d.highlights}` : ''}
          </div>
          ${d.files ? `<div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;">📎 ${d.files}</div>` : ''}
          <div style="background:#F26419;color:white;border-radius:12px;padding:16px;text-align:center;margin-top:16px;">
            <b>⏰ 1-2 iş günü içinde teslim edilmeli</b>
          </div>
        </div>
      `,
    }).catch(e => console.error('Mail hatası:', e))

    // Müşteriye mail
    resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: d.email,
      subject: 'Siparişiniz alındı — Müstakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit Studio</div>
          <h2>Merhaba ${d.name}!</h2>
          <p style="color:#555;line-height:1.7;">Formunuz alındı. Ödemeniz onaylandıktan sonra <b>${d.city} / ${d.district}</b> arsanız için video hazırlığı başlayacak.</p>
          <p style="margin-top:16px;font-size:13px;color:#999;">Sorular için <a href="mailto:info@mustakit.com" style="color:#F26419;">info@mustakit.com</a></p>
        </div>
      `,
    }).catch(e => console.error('Müşteri mail hatası:', e))

    res.json({ success: true, checkoutUrl })

  } catch (error: any) {
    console.error('Studio order error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

export default router
