import { Router, Request, Response } from 'express'
import { Resend } from 'resend'

const router = Router()
const resend = new Resend(process.env.RESEND_API_KEY)

router.post('/order', async (req: Request, res: Response) => {
  const d = req.body
  console.log('Studio sipariş geldi:', d.name, d.email, d.city)

  try {
    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: 'tvarzmedya@gmail.com',
      subject: `🎬 Yeni Studio Siparişi — ${d.name} | ${d.city}`,
      html: `
        <div style="font-family:Inter,sans-serif;max-width:700px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:8px;">Müstakit Studio</div>
          <p style="color:#777;margin-bottom:24px;">Yeni arsa video siparişi geldi</p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <h3 style="font-size:14px;margin-bottom:12px;">👤 İletişim</h3>
            <b>Ad:</b> ${d.name}<br>
            <b>Firma:</b> ${d.company || '—'}<br>
            <b>E-posta:</b> <a href="mailto:${d.email}">${d.email}</a><br>
            <b>Telefon:</b> ${d.phone}<br>
          </div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <h3 style="font-size:14px;margin-bottom:12px;">📍 Arsa Bilgileri</h3>
            <b>Konum:</b> ${d.city} / ${d.district} ${d.neighborhood || ''}<br>
            <b>Ada/Parsel:</b> ${d.parcel || '—'}<br>
            <b>Alan:</b> ${d.area} m²<br>
            <b>İmar:</b> ${d.zoning}<br>
            <b>Tip:</b> ${d.type || '—'}<br>
            <b>Fiyat:</b> ${d.price ? Number(d.price).toLocaleString('tr-TR') + ' TL' : '—'}<br>
            <b>Altyapı:</b> ${d.infra || '—'}<br>
            <b>Şehre Uzaklık:</b> ${d.distance_city || '—'}<br>
            <b>Denize Uzaklık:</b> ${d.distance_sea || '—'}<br>
            <b>Özellikler:</b> ${d.features || '—'}<br>
            ${d.maps_link ? `<b>Harita:</b> <a href="${d.maps_link}">Google Maps</a><br>` : ''}
            ${d.drone_link ? `<b>Drone:</b> <a href="${d.drone_link}">Video</a><br>` : ''}
          </div>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:16px;">
            <h3 style="font-size:14px;margin-bottom:10px;">📝 Açıklama</h3>
            <p style="font-size:14px;line-height:1.7;">${d.description}</p>
            ${d.highlights ? `<p style="font-size:13px;color:#F26419;margin-top:10px;"><b>Vurgulanacaklar:</b> ${d.highlights}</p>` : ''}
            ${d.notes ? `<p style="font-size:13px;color:#777;margin-top:8px;"><b>Notlar:</b> ${d.notes}</p>` : ''}
          </div>
          ${d.files ? `<div style="background:#fff8f5;border:1px solid rgba(242,100,25,0.2);border-radius:10px;padding:14px;font-size:13px;margin-bottom:16px;">📎 <b>Dosyalar:</b> ${d.files}</div>` : ''}
          <div style="background:#F26419;color:white;border-radius:12px;padding:20px;text-align:center;">
            <b style="font-size:16px;">⏰ 1-2 iş günü içinde teslim edilmeli</b><br>
            <span style="font-size:13px;opacity:0.9;">Ücret: 2.500 TL · Tel: ${d.phone}</span>
          </div>
        </div>
      `,
    })

    await resend.emails.send({
      from: 'Müstakit Studio <info@mustakit.com>',
      to: d.email,
      subject: 'Talebiniz alındı — Müstakit Studio',
      html: `
        <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;">
          <div style="font-size:22px;font-weight:800;color:#F26419;margin-bottom:24px;">Müstakit Studio</div>
          <h2 style="font-size:20px;margin-bottom:12px;">Merhaba ${d.name}!</h2>
          <p style="font-size:15px;color:#555;line-height:1.7;margin-bottom:16px;">
            Talebiniz alındı. Ekibimiz en kısa sürede sizinle iletişime geçecek ve ödeme bilgilerini paylaşacaktır.
          </p>
          <div style="background:#f7f4f1;border-radius:12px;padding:20px;margin-bottom:24px;font-size:14px;line-height:1.8;">
            📍 <b>Konum:</b> ${d.city} / ${d.district}<br>
            📐 <b>Alan:</b> ${d.area} m²<br>
            ⏰ <b>Tahmini Teslim:</b> 1-2 iş günü<br>
            💳 <b>Ücret:</b> 2.500 TL (%50 peşin, %50 teslimde)
          </div>
          <p style="font-size:13px;color:#999;">
            Sorularınız için <a href="mailto:tvarzmedya@gmail.com" style="color:#F26419;">tvarzmedya@gmail.com</a> adresine yazabilirsiniz.
          </p>
        </div>
      `,
    })

    res.json({ success: true })

  } catch (error: any) {
    console.error('Studio order error:', error?.message || error)
    res.status(500).json({ error: 'Mail gönderilemedi' })
  }
})

export default router
