import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const variantId = process.env.LS_VARIANT_ID_LIVE

  console.log('LS Config:', { isTest, variantId, storeId: process.env.LS_STORE_ID })

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: 50000,
        test_mode: false,
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
          receipt_thank_you_note: 'Ön ödemeniz alındı! Ekibimiz 1-2 iş günü içinde iletişime geçecek.',
        },
        checkout_options: {
          button_color: '#F26419',
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
  if (!res.ok) throw new Error(`LS API hatası: ${JSON.stringify(json?.errors || json)}`)

  return json?.data?.attributes?.url
}

// Sipariş başlat - sadece checkout linki döndür
router.post('/order', async (req: Request, res: Response) => {
  const d = req.body
  console.log('Studio sipariş geldi:', d.name, d.email, d.city)

  try {
    const checkoutUrl = await createCheckout(d)
    if (!checkoutUrl) return res.status(500).json({ error: 'Ödeme linki oluşturulamadı' })

    // Bize bilgi maili (ödeme bekleniyor notu ile)
    resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `🎬 Studio Talebi (Ödeme Bekleniyor) — ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:10px;padding:14px;margin-bottom:20px;font-size:14px;">
            ⏳ <b>Ödeme henüz tamamlanmadı.</b> Müşteri ödeme sayfasına yönlendirildi.
          </div>
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
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;">
            <p style="font-size:14px;line-height:1.7;">${d.description}</p>
            ${d.highlights ? `<p style="color:#F26419;font-size:13px;"><b>Vurgulanacaklar:</b> ${d.highlights}</p>` : ''}
          </div>
          ${d.files ? `<div style="margin-top:12px;font-size:13px;">📎 ${d.files}</div>` : ''}
        </div>
      `,
    }).catch(e => console.error('Mail hatası:', e))

    res.json({ success: true, checkoutUrl })

  } catch (error: any) {
    console.error('Studio order error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'İşlem başarısız' })
  }
})

// Webhook - ödeme tamamlandığında tetiklenir
router.post('/webhook', async (req: Request, res: Response) => {
  const eventName = req.headers['x-event-name'] as string
  console.log('LS Webhook:', eventName)

  if (eventName !== 'order_created') {
    return res.json({ received: true })
  }

  try {
    const order = req.body?.data?.attributes
    const custom = order?.first_order_item?.custom_data || {}
    const customerEmail = order?.user_email
    const customerName = order?.user_name

    console.log('Ödeme tamamlandı:', customerEmail)

    // Bize başarı maili
    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `✅ Ödeme Alındı — ${customerName} | ${custom.city || ''}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <div style="background:#d4edda;border:1px solid #28a745;border-radius:10px;padding:16px;margin-bottom:20px;">
            ✅ <b>500 TL ön ödeme alındı!</b> Video hazırlığına başlanabilir.
          </div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;">
            <b>Ad:</b> ${customerName}<br>
            <b>E-posta:</b> <a href="mailto:${customerEmail}">${customerEmail}</a><br>
            <b>Telefon:</b> ${custom.phone || '—'}<br>
            <b>Şehir:</b> ${custom.city || '—'}<br>
            <b>Alan:</b> ${custom.area || '—'} m²<br>
          </div>
          <div style="background:#F26419;color:white;border-radius:12px;padding:16px;text-align:center;margin-top:16px;">
            <b>⏰ 1-2 iş günü içinde teslim edilmeli</b><br>
            <span style="font-size:13px;opacity:0.9;">Kalan ödeme: 2.000 TL (teslimatta)</span>
          </div>
        </div>
      `,
    })

    // Müşteriye onay
    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: customerEmail,
      subject: 'Ön ödemeniz alındı — Müstakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit Studio</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${customerName}!</h2>
          <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
            500 TL ön ödemeniz alındı. Video hazırlığı başlıyor, 1-2 iş günü içinde teslim edeceğiz.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;">
            ⏰ <b>Tahmini Teslim:</b> 1-2 iş günü<br>
            💳 <b>Kalan Ödeme:</b> 2.000 TL (teslimatta)
          </div>
          <p style="margin-top:20px;font-size:13px;color:#999;">
            Sorular için <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a>
          </p>
        </div>
      `,
    })

    res.json({ received: true })

  } catch (error: any) {
    console.error('Webhook error:', error?.message)
    res.status(500).json({ error: 'Webhook işlenemedi' })
  }
})

export default router
