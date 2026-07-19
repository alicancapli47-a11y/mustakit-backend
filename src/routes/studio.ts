import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const serviceType = data.serviceType || 'arsa'

  // ALL PRICES IN USD CENTS NOW (store currency = USD)
  // Land/Arsa: $75 total, 20% deposit = $15 = 1500 cents
  // Construction/Yapi: $80 total, 20% deposit = $16 = 1600 cents
  let customPrice: number

  if (serviceType === 'yapi_projesi' || serviceType === 'construction_video_eng') {
    customPrice = 1600 // $16.00
  } else {
    customPrice = 1500 // $15.00 (arsa / land_video_eng / default)
  }

  const variantId = isTest ? process.env.LS_VARIANT_ID_TEST : process.env.LS_VARIANT_ID_LIVE

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: customPrice,
        test_mode: isTest,
        checkout_data: {
          email: data.email,
          name: data.name,
          custom: {
            phone: String(data.phone || ''),
            city: String(data.city || ''),
            area: String(data.area || 'N/A'),
            serviceType: String(serviceType),
          },
        },
        product_options: {
          redirect_url: serviceType.includes('eng')
            ? 'https://studio.mustakit.com/eng'
            : 'https://studio.mustakit.com',
          receipt_thank_you_note: serviceType.includes('eng')
            ? 'Your deposit has been received! Our team will reach out shortly.'
            : 'On odemeniz alindi! Ekibimiz en kisa surede iletisime gececek.',
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
  console.log('LS Response status:', res.status, '| Service:', serviceType, '| Price (cents):', customPrice)
  if (!res.ok) throw new Error(`LS API error: ${JSON.stringify(json?.errors || json)}`)

  return json?.data?.attributes?.url
}

function getServiceLabels(serviceType: string) {
  switch (serviceType) {
    case 'land_video_eng':
      return { name: 'Land Video', total: '$75', deposit: '$15', remaining: '$60', lang: 'en' }
    case 'construction_video_eng':
      return { name: 'Construction Project Video', total: '$80', deposit: '$16', remaining: '$64', lang: 'en' }
    case 'yapi_projesi':
      return { name: 'Yapi Projesi Videosu', total: '$80', deposit: '$16', remaining: '$64', lang: 'tr' }
    default:
      return { name: 'Arsa Videosu', total: '$75', deposit: '$15', remaining: '$60', lang: 'tr' }
  }
}

router.post('/order', async (req: Request, res: Response) => {
  const d = req.body
  const serviceType = d.serviceType || 'arsa'
  const labels = getServiceLabels(serviceType)
  console.log('Studio order received:', d.name, d.email, d.city, '| Type:', serviceType)

  try {
    const checkoutUrl = await createCheckout(d)
    if (!checkoutUrl) return res.status(500).json({ error: 'Could not create checkout link' })

    if (labels.lang === 'en') {
      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: 'tvarzmedya@gmail.com',
        subject: `New ${labels.name} Order - ${d.name} | ${d.city}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Mustakit Studio</div>
            <div style="background:#1a1a1a;color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px;">${labels.name}</div>
            <p style="color:#777;margin-bottom:24px;">New order - payment started</p>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <b>Name:</b> ${d.name}<br>
              <b>Company:</b> ${d.company || '-'}<br>
              <b>Email:</b> <a href="mailto:${d.email}">${d.email}</a><br>
              <b>Phone:</b> ${d.phone}<br>
            </div>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <b>Location:</b> ${d.country || ''} ${d.city || ''}<br>
              ${d.projectName ? `<b>Project Name:</b> ${d.projectName}<br>` : ''}
              ${d.parcel ? `<b>Parcel:</b> ${d.parcel}<br>` : ''}
              <b>Area:</b> ${d.area || '-'}<br>
              <b>Type:</b> ${d.zoning || '-'}<br>
              ${d.unitCount ? `<b>Units:</b> ${d.unitCount}<br>` : ''}
              ${d.deliveryDate ? `<b>Completion:</b> ${d.deliveryDate}<br>` : ''}
              ${d.price ? `<b>Price:</b> ${d.price}<br>` : ''}
              <b>Features:</b> ${d.infra || d.features || '-'}<br>
              ${d.maps_link ? `<b>Map:</b> <a href="${d.maps_link}">Google Maps</a><br>` : ''}
              ${d.drone_link ? `<b>Drone:</b> <a href="${d.drone_link}">Video</a><br>` : ''}
            </div>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <p style="font-size:14px;line-height:1.7;">${d.description}</p>
              ${d.highlights ? `<p style="font-size:13px;color:#F26419;"><b>To highlight:</b> ${d.highlights}</p>` : ''}
            </div>

            ${d.krokiFiles ? `<div style="background:#e8f4ff;border-radius:10px;padding:14px;font-size:13px;margin-bottom:12px;">Blueprints: ${d.krokiFiles}</div>` : ''}
            ${d.files ? `<div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;margin-bottom:16px;">Photos: ${d.files}</div>` : ''}

            <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
              <b>Deliver within 1-2 business days</b><br>
              <span style="font-size:13px;opacity:0.9;">Total: ${labels.total} - Deposit: ${labels.deposit} - Remaining: ${labels.remaining}</span>
            </div>
          </div>
        `,
      }).catch(e => console.error('Mail error:', e))

      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: d.email,
        subject: 'Your deposit has been received - Mustakit Studio',
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Mustakit Studio</div>
            <h2 style="font-size:20px;margin-bottom:12px;">Hi ${d.name}!</h2>
            <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
              Your ${labels.deposit} deposit has been received. Production of your ${labels.name.toLowerCase()} is starting now.
            </p>
            <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;margin-bottom:24px;">
              Location: ${d.country || ''} ${d.city || ''}<br>
              Estimated delivery: 1-2 business days<br>
              Remaining balance: ${labels.remaining} (due on delivery)
            </div>
            <p style="font-size:13px;color:#999;">Questions? Email us at <a href="mailto:info@mustakit.com" style="color:#F26419;">info@mustakit.com</a></p>
          </div>
        `,
      }).catch(e => console.error('Customer mail error:', e))

    } else {
      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: 'tvarzmedya@gmail.com',
        subject: `Yeni ${labels.name} Siparisi - ${d.name} | ${d.city}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Mustakit Studio</div>
            <div style="background:#1a1a1a;color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px;">${labels.name}</div>
            <p style="color:#777;margin-bottom:24px;">Yeni siparis - odeme baslatildi</p>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <b>Ad:</b> ${d.name}<br>
              <b>Firma:</b> ${d.company || '-'}<br>
              <b>E-posta:</b> <a href="mailto:${d.email}">${d.email}</a><br>
              <b>Telefon:</b> ${d.phone}<br>
            </div>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <b>Konum:</b> ${d.city} / ${d.district || ''} ${d.neighborhood || ''}<br>
              ${d.projectName ? `<b>Proje Adi:</b> ${d.projectName}<br>` : ''}
              <b>Alan:</b> ${d.area} m2<br>
              <b>Tip:</b> ${d.zoning || '-'}<br>
              ${d.unitCount ? `<b>Birim Sayisi:</b> ${d.unitCount}<br>` : ''}
              ${d.deliveryDate ? `<b>Teslim Tarihi:</b> ${d.deliveryDate}<br>` : ''}
              ${d.price ? `<b>Fiyat:</b> ${d.price}<br>` : ''}
              <b>Ozellikler:</b> ${d.features || d.infra || '-'}<br>
              ${d.maps_link ? `<b>Harita:</b> <a href="${d.maps_link}">Google Maps</a><br>` : ''}
              ${d.drone_link ? `<b>Drone:</b> <a href="${d.drone_link}">Video</a><br>` : ''}
            </div>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <p style="font-size:14px;line-height:1.7;">${d.description}</p>
              ${d.highlights ? `<p style="font-size:13px;color:#F26419;"><b>Vurgulanacaklar:</b> ${d.highlights}</p>` : ''}
            </div>

            ${d.krokiFiles ? `<div style="background:#e8f4ff;border-radius:10px;padding:14px;font-size:13px;margin-bottom:12px;">Kroki/Plan Dosyalari: ${d.krokiFiles}</div>` : ''}
            ${d.files ? `<div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;margin-bottom:16px;">Fotograflar: ${d.files}</div>` : ''}

            <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
              <b>1-2 is gunu icinde teslim edilmeli</b><br>
              <span style="font-size:13px;opacity:0.9;">Toplam: ${labels.total} - On odeme: ${labels.deposit} - Kalan: ${labels.remaining}</span>
            </div>
          </div>
        `,
      }).catch(e => console.error('Mail hatasi:', e))

      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: d.email,
        subject: 'On odemeniz alindi - Mustakit Studio',
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Mustakit Studio</div>
            <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${d.name}!</h2>
            <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
              ${labels.deposit} on odemeniz alindi. ${labels.name} hazirligi basliyor.
            </p>
            <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;margin-bottom:24px;">
              Konum: ${d.city} / ${d.district || ''}<br>
              Alan: ${d.area} m2<br>
              Tahmini Teslim: 1-2 is gunu<br>
              Kalan Odeme: ${labels.remaining} (teslimatta)
            </div>
            <p style="font-size:13px;color:#999;">Sorular icin <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a></p>
          </div>
        `,
      }).catch(e => console.error('Musteri mail hatasi:', e))
    }

    res.json({ success: true, checkoutUrl })

  } catch (error: any) {
    console.error('Studio order error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'Operation failed' })
  }
})

export default router


// Bu endpoint'i mevcut studio.ts dosyasının sonuna ekle (export default router'dan ONCE)
// order-fiverr endpoint'inin altina ekleyebilirsin

async function createTRCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const isStandart = data.packageType === 'standart'

  const customPrice = isStandart ? 200000 : 150000 // kurus/cent bazinda - store para birimine gore yorumlanir

  const variantId = isTest ? process.env.LS_VARIANT_ID_TEST : process.env.LS_VARIANT_ID_LIVE

  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        custom_price: customPrice,
        test_mode: isTest,
        checkout_data: {
          email: data.email,
          name: data.name,
          custom: {
            phone: String(data.phone || ''),
            city: String(data.city || ''),
            packageType: String(data.packageType || 'minimal'),
          },
        },
        product_options: {
          redirect_url: 'https://studio.mustakit.com',
          receipt_thank_you_note: 'Odemeniz alindi! Ekibimiz en kisa surede iletisime gececek.',
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
  console.log('TR LS Response status:', res.status, '| Package:', data.packageType, '| Price:', customPrice)
  if (!res.ok) throw new Error(`LS API hatasi: ${JSON.stringify(json?.errors || json)}`)

  return json?.data?.attributes?.url
}

router.post('/order-tr', async (req: Request, res: Response) => {
  const d = req.body
  console.log('TR Studio order received:', d.name, d.email, d.city, '| Package:', d.packageName, '| Payment:', d.paymentMethod)

  try {
    let checkoutUrl: string | undefined

    if (d.paymentMethod === 'lemonsqueezy') {
      checkoutUrl = await createTRCheckout(d)
    }

    resend.emails.send({
      from: 'Mustakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `Yeni Siparis - ${d.packageName} (${d.packagePrice}) - ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Mustakit Studio</div>
          <div style="background:#1a1a1a;color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:8px;">${d.packageName} - ${d.packagePrice}</div>
          <div style="background:${d.paymentMethod === 'shopier' ? '#1DBF73' : '#635BFF'};color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px;margin-left:8px;">${d.paymentMethod === 'shopier' ? 'Shopier' : 'Kart/LS'}</div>
          <p style="color:#777;margin-bottom:24px;">Yeni siparis - odeme baslatildi</p>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Ad:</b> ${d.name}<br>
            <b>Firma:</b> ${d.company || '-'}<br>
            <b>E-posta:</b> <a href="mailto:${d.email}">${d.email}</a><br>
            <b>Telefon:</b> ${d.phone}<br>
          </div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Konum:</b> ${d.city} / ${d.district || ''}<br>
            ${d.projectName ? `<b>Proje/Arsa Adi:</b> ${d.projectName}<br>` : ''}
            <b>Alan:</b> ${d.area || '-'}<br>
            ${d.maps_link ? `<b>Harita:</b> <a href="${d.maps_link}">Google Maps</a><br>` : ''}
            ${d.drone_link ? `<b>Drone:</b> <a href="${d.drone_link}">Video</a><br>` : ''}
          </div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <p style="font-size:14px;line-height:1.7;">${d.description || '-'}</p>
            ${d.highlights ? `<p style="font-size:13px;color:#F26419;"><b>Vurgulanacaklar:</b> ${d.highlights}</p>` : ''}
          </div>

          ${d.krokiFiles ? `<div style="background:#e8f4ff;border-radius:10px;padding:14px;font-size:13px;margin-bottom:12px;">Kroki/Plan: ${d.krokiFiles}</div>` : ''}
          ${d.files ? `<div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;margin-bottom:16px;">Fotograflar: ${d.files}</div>` : ''}

          <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
            <b>1-2 is gunu icinde teslim edilmeli</b><br>
            <span style="font-size:13px;opacity:0.9;">Paket: ${d.packageName} - Fiyat: ${d.packagePrice} - Odeme: ${d.paymentMethod === 'shopier' ? 'Shopier (takip et)' : 'Kart (otomatik)'}</span>
          </div>
        </div>
      `,
    }).catch(e => console.error('Mail hatasi:', e))

    resend.emails.send({
      from: 'Mustakit Studio <info@mustakit.com>',
      to: d.email,
      subject: 'Siparisiniz alindi - Mustakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Mustakit Studio</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${d.name}!</h2>
          <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
            ${d.packageName} siparisiniz alindi. Odemeniz tamamlandiktan sonra video hazirligimiz baslayacak.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;margin-bottom:24px;">
            Paket: ${d.packageName}<br>
            Fiyat: ${d.packagePrice}<br>
            Konum: ${d.city} / ${d.district || ''}<br>
            Tahmini Teslim: 1-2 is gunu
          </div>
          <p style="font-size:13px;color:#999;">Sorular icin <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a></p>
        </div>
      `,
    }).catch(e => console.error('Musteri mail hatasi:', e))

    res.json({ success: true, checkoutUrl })

  } catch (error: any) {
    console.error('TR Studio order error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'Islem basarisiz' })
  }
})

// ============================================================
// WEBHOOK - Lemon Squeezy odeme bildirimi
// ============================================================
const AI_VIDEO_VARIANT_ID = '1926389'

router.post('/webhook', async (req: Request, res: Response) => {
  const event = req.headers['x-event-name'] as string
  const body = req.body

  console.log('LS Webhook:', event)

  if (event !== 'order_created') {
    return res.json({ received: true })
  }

  try {
    const order = body?.data?.attributes
    const variantId = String(body?.data?.relationships?.variant?.data?.id || '')
    const customerEmail = order?.user_email || ''
    const customerName = order?.user_name || ''
    const total = order?.total_formatted || ''

    console.log('Order webhook - variant:', variantId, '| email:', customerEmail)

    // AI Video paketi (600 TL)
    if (variantId === AI_VIDEO_VARIANT_ID) {
      // Sana bildirim
      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: 'tvarzmedya@gmail.com',
        subject: `⚡ Yeni AI Video Siparisi - ${customerName} (${total})`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Mustakit Studio</div>
            <div style="background:#F26419;color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px;">⚡ AI Video - 600 TL</div>
            <p style="color:#555;margin-bottom:20px;">Odeme tamamlandi. Musteri gorsellerini gondermeyi bekliyor.</p>
            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
              <b>Ad:</b> ${customerName}<br>
              <b>E-posta:</b> <a href="mailto:${customerEmail}">${customerEmail}</a><br>
              <b>Odeme:</b> ${total}
            </div>
            <div style="background:#fff8f5;border-radius:10px;padding:14px;font-size:13px;color:#7a3a10;">
              Musteri render gorsellerini gondermesi icin gorsel yukle maili gidecek.
              Goller gelince AI Video aracini kullanarak 30 dakika icinde teslim et.
            </div>
          </div>
        `,
      }).catch(e => console.error('Admin mail hatasi:', e))

      // Müşteriye "Gorsellerinizi gonderin" maili
      resend.emails.send({
        from: 'Mustakit Studio <info@mustakit.com>',
        to: customerEmail,
        subject: 'Odemeniz alindi! Simdi render gorsellerinizi gonderin — Mustakit Studio',
        html: `
          <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
            <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Mustakit Studio</div>
            <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${customerName}!</h2>
            <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:20px;">
              <strong>600 TL odemeniz basariyla alindi.</strong> Harika! Simdi tek yapmaniz gereken
              projenizin render gorsellerini bize gondermek.
            </p>

            <div style="background:#F26419;color:white;border-radius:14px;padding:24px;margin-bottom:24px;text-align:center;">
              <div style="font-size:32px;margin-bottom:8px;">⚡</div>
              <div style="font-size:18px;font-weight:800;margin-bottom:6px;">30 Dakika Icinde Teslim</div>
              <div style="font-size:13px;opacity:0.9;">Gorselleri alir almaz AI sistemi harekete geciyor</div>
            </div>

            <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:20px;">
              <div style="font-weight:700;font-size:15px;margin-bottom:12px;">Gorsellerinizi su adrese gonderin:</div>
              <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;font-size:18px;font-weight:700;">tvarzmedya@gmail.com</a>
              <div style="font-size:13px;color:#777;margin-top:10px;line-height:1.6;">
                En az 2, en fazla 9 adet render gorseli gonderin.<br>
                JPG veya PNG formati, yuksek cozunurluk tercih edilir.<br>
                Proje adi ve kisaca aciklama da ekleyin.
              </div>
            </div>

            <div style="font-size:13px;color:#999;line-height:1.6;">
              Sorulariniz icin: <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a>
            </div>
          </div>
        `,
      }).catch(e => console.error('Musteri mail hatasi:', e))

      return res.json({ received: true, handled: 'ai_video' })
    }

    // Diger siparisler (arsa, yapi projesi vs.) - sadece log
    console.log('Diger variant webhook:', variantId)
    res.json({ received: true })

  } catch (error: any) {
    console.error('Webhook error:', error?.message)
    res.status(500).json({ error: error?.message })
  }
})
