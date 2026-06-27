import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const serviceType = data.serviceType || 'arsa'

  // TR fiyatlandirma (TL kurus): Arsa 4000 TL (%20=800), Yapi 5000 TL (%20=1000)
  // ENG fiyatlandirma (USD cent): Land $75 (20%=$15), Construction $80 (20%=$16)
  let customPrice: number
  let currency = 'TRY'

  if (serviceType === 'land_video_eng') {
    customPrice = 1500 // $15.00 in cents
    currency = 'USD'
  } else if (serviceType === 'construction_video_eng') {
    customPrice = 1600 // $16.00 in cents
    currency = 'USD'
  } else if (serviceType === 'yapi_projesi') {
    customPrice = 100000 // 1.000 TL in kurus
  } else {
    customPrice = 80000 // 800 TL in kurus (arsa - default)
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
            phone: data.phone,
            city: data.city,
            area: String(data.area),
            serviceType,
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
  console.log('LS Response status:', res.status, '| Service:', serviceType, '| Price:', customPrice, currency)
  if (!res.ok) throw new Error(`LS API hatasi: ${JSON.stringify(json?.errors || json)}`)

  return json?.data?.attributes?.url
}

function getServiceLabels(serviceType: string) {
  switch (serviceType) {
    case 'land_video_eng':
      return { name: 'Land Video (EN)', total: '$75', deposit: '$15', remaining: '$60', lang: 'en' }
    case 'construction_video_eng':
      return { name: 'Construction Project Video (EN)', total: '$80', deposit: '$16', remaining: '$64', lang: 'en' }
    case 'yapi_projesi':
      return { name: 'Yapi Projesi Videosu', total: '5.000 TL', deposit: '1.000 TL', remaining: '4.000 TL', lang: 'tr' }
    default:
      return { name: 'Arsa Videosu', total: '4.000 TL', deposit: '800 TL', remaining: '3.200 TL', lang: 'tr' }
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
      // ENGLISH EMAILS
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
      // TURKISH EMAILS (existing flow)
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
              ${d.price ? `<b>Fiyat:</b> ${Number(d.price).toLocaleString('tr-TR')} TL<br>` : ''}
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
