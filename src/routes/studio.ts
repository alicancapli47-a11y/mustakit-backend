import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const variantId = isTest ? '1734577' : '1672284'

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: 50000, // 500 TL kuruş cinsinden
        test_mode: isTest,
        checkout_data: {
          email: data.email,
          name: data.name,
          custom: {
            phone: data.phone,
            city: data.city,
            area: String(data.area),
            order_type: 'studio_on_odeme',
          },
        },
        product_options: {
          redirect_url: 'https://studio.mustakit.com',
          receipt_thank_you_note: 'Ön ödemeniz alındı! Ekibimiz en kısa sürede iletişime geçecek.',
        },
        checkout_options: {
          button_color: '#F26419',
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: '370282' },
        },
        variant: {
          data: { type: 'variants', id: variantId },
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
  console.log('LS status:', res.status)

  if (!res.ok) {
    throw new Error(`LS API hatası: ${JSON.stringify(json?.errors || json)}`)
  }

  return json?.data?.attributes?.url
}

router.post('/order', async (req: Request, res: Response) => {
  const d = req.body
  console.log('Studio sipariş geldi:', d.name, d.email, d.city)

  try {
    // Checkout linki oluştur
    const checkoutUrl = await createCheckout(d)
    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Ödeme linki oluşturulamadı' })
    }

    // Bize bildirim
    resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `🎬 Yeni Studio Siparişi — ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <p style="color:#777;margin-bottom:24px;">Yeni arsa video siparişi — ön ödeme başlatıldı</p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Ad:</b> ${d.name}<br>
            <b>Firma:</b> ${d.company || '—'}<br>
            <b>E-posta:</b> <a href="mailto:${d.email}">${d.email}</a><br>
            <b>Telefon:</b> ${d.phone}<br>
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
            <p style="font-size:14px;line-height:1.7;">${d.description}</p>
            ${d.highlights ? `<p style="font-size:13px;color:#F26419;"><b>Vurgulanacaklar:</b> ${d.highlights}</p>` : ''}
          </div>
          ${d.files ? `<div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;margin-bottom:16px;">📎 ${d.files}</div>` : ''}
          <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
            <b>⏰ 1-2 iş günü içinde teslim</b><br>
            <span style="font-size:13px;opacity:0.9;">Ön ödeme: 500 TL · Kalan: 2.000 TL</span>
          </div>
        </div>
      `,
    }).catch(e => console.error('Mail hatası:', e))

    // Müşteriye onay
    resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: d.email,
      subject: 'Ön ödemeniz alındı — Müstakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit Studio</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${d.name}!</h2>
          <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
            500 TL ön ödemeniz alındı. <b>${d.city} / ${d.district}</b> arsanız için video hazırlığı başlıyor.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;margin-bottom:24px;">
            📍 <b>Konum:</b> ${d.city} / ${d.district}<br>
            📐 <b>Alan:</b> ${d.area} m²<br>
            ⏰ <b>Tahmini Teslim:</b> 1-2 iş günü<br>
            💳 <b>Kalan Ödeme:</b> 2.000 TL (teslimatta)
          </div>
          <p style="font-size:13px;color:#999;">Sorular için <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a></p>
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
