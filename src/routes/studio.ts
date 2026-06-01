import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

// Lemon Squeezy checkout linki oluştur
async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: 125000, // 1250 TL = kuruş cinsinden
        test_mode: isTest,
        checkout_data: {
          email: data.email,
          name: data.name,
          custom: {
            phone: data.phone,
            city: data.city,
            area: data.area,
            order_type: 'studio_video',
          },
        },
        product_options: {
          redirect_url: 'https://studio.mustakit.com/tesekkurler.html',
          receipt_thank_you_note: 'Siparişiniz alındı! 1-2 iş günü içinde videonuzu göndereceğiz.',
        },
        checkout_options: {
          button_color: '#F26419',
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: process.env.LS_STORE_ID },
        },
        variant: {
          data: { type: 'variants', id: isTest ? process.env.LS_VARIANT_ID_TEST : process.env.LS_VARIANT_ID_LIVE },
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
  return json?.data?.attributes?.url
}

// Sipariş al → mail gönder → checkout linki döndür
router.post('/order', async (req: Request, res: Response) => {
  const d = req.body

  try {
    // Lemon Squeezy checkout linki oluştur
    const checkoutUrl = await createCheckout(d)

    if (!checkoutUrl) {
      return res.status(500).json({ error: 'Ödeme linki oluşturulamadı' })
    }

    // Bize bildirim maili
    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'info@mustakit.com',
      subject: `🎬 Yeni Studio Siparişi — ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <div style="font-size:14px;color:#777;margin-bottom:24px;">Yeni arsa video siparişi — ödeme başlatıldı</div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h2 style="font-size:16px;margin-bottom:16px;">👤 İletişim</h2>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#777;width:140px;padding:4px 0;">Ad Soyad</td><td><strong>${d.name}</strong></td></tr>
              <tr><td style="color:#777;padding:4px 0;">Firma</td><td>${d.company || '—'}</td></tr>
              <tr><td style="color:#777;padding:4px 0;">E-posta</td><td><a href="mailto:${d.email}">${d.email}</a></td></tr>
              <tr><td style="color:#777;padding:4px 0;">Telefon</td><td>${d.phone}</td></tr>
            </table>
          </div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h2 style="font-size:16px;margin-bottom:16px;">📍 Arsa</h2>
            <table style="width:100%;font-size:14px;">
              <tr><td style="color:#777;width:140px;padding:4px 0;">Konum</td><td><strong>${d.city} / ${d.district} ${d.neighborhood || ''}</strong></td></tr>
              <tr><td style="color:#777;padding:4px 0;">Alan</td><td>${d.area} m²</td></tr>
              <tr><td style="color:#777;padding:4px 0;">İmar</td><td>${d.zoning}</td></tr>
              <tr><td style="color:#777;padding:4px 0;">Fiyat</td><td>${d.price ? Number(d.price).toLocaleString('tr-TR') + ' TL' : '—'}</td></tr>
              <tr><td style="color:#777;padding:4px 0;">Altyapı</td><td>${d.infra || '—'}</td></tr>
            </table>
            ${d.maps_link ? `<div style="margin-top:10px;"><a href="${d.maps_link}" style="color:#F26419;">📍 Google Maps</a></div>` : ''}
            ${d.drone_link ? `<div style="margin-top:6px;"><a href="${d.drone_link}" style="color:#F26419;">🎥 Drone Video</a></div>` : ''}
          </div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:20px;">
            <h2 style="font-size:16px;margin-bottom:10px;">📝 Açıklama</h2>
            <p style="font-size:14px;line-height:1.7;">${d.description}</p>
            ${d.highlights ? `<p style="font-size:13px;color:#F26419;margin-top:8px;"><strong>Vurgulanacaklar:</strong> ${d.highlights}</p>` : ''}
          </div>

          ${d.files ? `<div style="background:#fff8f5;border:1px solid rgba(242,100,25,0.2);border-radius:10px;padding:14px;margin-bottom:20px;font-size:13px;">📎 <strong>Dosyalar:</strong> ${d.files}</div>` : ''}

          <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
            <strong>⏰ 1-2 iş günü içinde teslim edilmeli</strong><br>
            <span style="font-size:13px;opacity:0.9;">Ödeme durumu Lemon Squeezy dashboard'dan takip edilebilir</span>
          </div>
        </div>
      `,
    })

    // Müşteriye onay maili
    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: d.email,
      subject: 'Siparişiniz alındı — Müstakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit Studio</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${d.name}!</h2>
          <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
            Formunuz alındı. Ödemeniz onaylandıktan sonra <strong>${d.city} / ${d.district}</strong> arsanız için video hazırlığı başlayacak.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:24px;font-size:14px;">
            📍 <strong>Konum:</strong> ${d.city} / ${d.district}<br>
            📐 <strong>Alan:</strong> ${d.area} m²<br>
            ⏰ <strong>Tahmini Teslim:</strong> 1-2 iş günü<br>
            💳 <strong>Kalan Ödeme:</strong> 1.250 TL (teslimatta)
          </div>
          <p style="font-size:13px;color:#999;">Sorular için <a href="mailto:info@mustakit.com" style="color:#F26419;">info@mustakit.com</a></p>
        </div>
      `,
    })

    // Checkout URL'i frontend'e döndür
    res.json({ success: true, checkoutUrl })

  } catch (error) {
    console.error('Studio order error:', error)
    res.status(500).json({ error: 'İşlem başarısız' })
  }
})

export default router
