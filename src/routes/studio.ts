import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

async function createCheckout(data: any) {
  const isTest = process.env.LS_TEST_MODE === 'true'
  const isYapiProjesi = data.serviceType === 'yapi_projesi'

  const customPrice = isYapiProjesi ? 60000 : 50000
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
            serviceType: data.serviceType || 'arsa',
          },
        },
        product_options: {
          redirect_url: 'https://studio.mustakit.com',
          receipt_thank_you_note: 'On odemeniz alindi! Ekibimiz en kisa surede iletisime gececek.',
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
  if (!res.ok) throw new Error(`LS API hatasi: ${JSON.stringify(json?.errors || json)}`)

  return json?.data?.attributes?.url
}

router.post('/order', async (req: Request, res: Response) => {
  const d = req.body
  const isYapiProjesi = d.serviceType === 'yapi_projesi'
  console.log('Studio siparis geldi:', d.name, d.email, d.city, '| Tip:', d.serviceType || 'arsa')

  try {
    const checkoutUrl = await createCheckout(d)
    if (!checkoutUrl) return res.status(500).json({ error: 'Odeme linki olusturulamadi' })

    const onOdeme = isYapiProjesi ? '600 TL' : '500 TL'
    const kalanOdeme = isYapiProjesi ? '2.400 TL' : '2.000 TL'
    const toplamFiyat = isYapiProjesi ? '3.000 TL' : '2.500 TL'
    const hizmetAdi = isYapiProjesi ? 'Yapi Projesi Videosu' : 'Arsa Videosu'

    resend.emails.send({
      from: 'Mustakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `Yeni ${hizmetAdi} Siparisi - ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Mustakit Studio</div>
          <div style="background:#1a1a1a;color:white;display:inline-block;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px;">${hizmetAdi}</div>
          <p style="color:#777;margin-bottom:24px;">Yeni siparis - odeme baslatildi</p>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Ad:</b> ${d.name}<br>
            <b>Firma:</b> ${d.company || '-'}<br>
            <b>E-posta:</b> <a href="mailto:${d.email}">${d.email}</a><br>
            <b>Telefon:</b> ${d.phone}<br>
          </div>

          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <b>Konum:</b> ${d.city} / ${d.district} ${d.neighborhood || ''}<br>
            ${d.projectName ? `<b>Proje Adi:</b> ${d.projectName}<br>` : ''}
            <b>Alan:</b> ${d.area} m2<br>
            <b>Tip:</b> ${d.zoning || '-'}<br>
            ${d.unitCount ? `<b>Birim Sayisi:</b> ${d.unitCount}<br>` : ''}
            ${d.deliveryDate ? `<b>Teslim Tarihi:</b> ${d.deliveryDate}<br>` : ''}
            ${d.price ? `<b>Fiyat:</b> ${Number(d.price).toLocaleString('tr-TR')} TL<br>` : ''}
            <b>Ozellikler:</b> ${d.features || '-'}<br>
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
            <span style="font-size:13px;opacity:0.9;">Toplam: ${toplamFiyat} - On odeme: ${onOdeme} - Kalan: ${kalanOdeme}</span>
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
            ${onOdeme} on odemeniz alindi. ${hizmetAdi} hazirligi basliyor.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;font-size:14px;line-height:1.8;margin-bottom:24px;">
            Konum: ${d.city} / ${d.district}<br>
            Alan: ${d.area} m2<br>
            Tahmini Teslim: 1-2 is gunu<br>
            Kalan Odeme: ${kalanOdeme} (teslimatta)
          </div>
          <p style="font-size:13px;color:#999;">Sorular icin <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a></p>
        </div>
      `,
    }).catch(e => console.error('Musteri mail hatasi:', e))

    res.json({ success: true, checkoutUrl })

  } catch (error: any) {
    console.error('Studio order error:', error?.message || error)
    res.status(500).json({ error: error?.message || 'Islem basarisiz' })
  }
})

export default router
