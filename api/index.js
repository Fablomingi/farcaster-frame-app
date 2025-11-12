// Bu bizim "Beyin" (Vercel Serverless Fonksiyonu)
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { NeynarAPIClient } = require("@neynar/nodejs-sdk");
const axios = require('axios');
const { v2: cloudinary } = require('cloudinary');

// API Anahtarlarını Vercel'den (Güvenli Yerden) Çek
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Servisleri ayarla
const neynarClient = new NeynarAPIClient(NEYNAR_API_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
cloudinary.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// Vercel'e gelen tüm istekleri bu fonksiyon karşılayacak
export default async function handler(req, res) {
  
  // Sadece POST isteklerini kabul et (Farcaster Frame kuralı)
  if (req.method !== 'POST') {
    // İlk ziyaret için Ana Sayfa Frame'ini göster
    return res.status(200).setHeader("Content-Type", "text/html").send(getInitialFrame());
  }

  try {
    // Farcaster'dan gelen datayı oku
    const body = req.body;
    const fid = body.untrustedData.fid;
    const inputText = body.untrustedData.inputText || ""; // Kullanıcının girdiği metin
    const buttonIndex = body.untrustedData.buttonIndex;

    // --- DURUM 1: Kullanıcı ilk kez geldi veya "Başa Dön"e bastı ---
    if (buttonIndex === 2) {
      return res.status(200).setHeader("Content-Type", "text/html").send(getInitialFrame());
    }

    // --- DURUM 2: Kullanıcı "Oluştur" butonuna bastı (Button 1) ---
    
    // 1. PFP'yi Çek (Neynar)
    const user = await neynarClient.fetchBulkUsers([fid]);
    const pfpUrl = user.users[0]?.pfp_url || 'https://i.imgur.com/3q0Y7Yv.png'; // Bulamazsa varsayılan resim
    console.log("PFP Bulundu:", pfpUrl);

    // 2. Metni AI'a Gönder (Gemini)
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Şu metni analiz et: "${inputText}". Bu metindeki en önemli, en belirgin marka, proje, uygulama veya konseptin adını bul. Cevabın SADECE o şeyin adı olsun (örn: "Vercel", "OpenAI", "React", "Kahve"). Başka HİÇBİR ŞEY yazma.`;
    
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const topic = response.text().trim().replace(/[^a-zA-Z0-9\s-]/g, '').split(' ')[0]; // Temizle, sadece ilk kelimeyi al
    console.log("AI Konu Buldu:", topic);

    // 3. Logo Bul (Clearbit)
    // AI'ın bulduğu konuya göre logoyu ara (örn: "vercel" -> "vercel.com")
    let logoUrl;
    try {
      const domain = `${topic.toLowerCase()}.com`;
      logoUrl = `https://logo.clearbit.com/${domain}`;
      // Logoyu test et, 404 dönüyorsa varsayılan yap
      await axios.get(logoUrl);
      console.log("Logo Bulundu:", logoUrl);
    } catch (error) {
      console.log("Logo bulunamadı, varsayılan logo kullanılacak.");
      logoUrl = 'https://i.imgur.com/M8P5gYg.png'; // Varsayılan Farcaster logosu
    }

    // 4. Görseli Birleştir (Cloudinary)
    // Cloudinary'e diyoruz ki:
    // 1. Arkaplan olarak bu PFP'yi al (pfpUrl)
    // 2. Bulanıklaştır ve karart
    // 3. Üstüne bu Logoyu koy (logoUrl), küçült ve sağ alta yerleştir
    const finalImageUrl = cloudinary.url(pfpUrl, {
      transformation: [
        { width: 1000, height: 523, crop: 'fill', gravity: 'face', effect: 'blur:100' }, // Arkaplanı 1000x523 yap, yüzü ortala, bulanıklaştır
        { effect: 'brightness:-30' }, // Biraz karart
        {
          overlay: { url: logoUrl }, // Logoyu üstüne ekle
          width: 200, // Logo genişliği
          height: 200, // Logo yüksekliği
          crop: 'limit',
          gravity: 'south_east', // Sağ alt köşe
          x: 40, // Sağdan boşluk
          y: 40, // Alttan boşluk
          opacity: 90
        }
      ],
      sign_url: true // URL'i güvenli hale getir
    });
    
    console.log("Yeni Resim URL'i:", finalImageUrl);

    // 5. Yeni Frame'i Kullanıcıya Gönder
    const htmlResponse = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Sonuç</title>
        <meta property="og:title" content="Sonuç" />
        <meta property="fc:frame" content="vNext" />
        <meta property="fc:frame:image" content="${finalImageUrl}" />
        <meta property="fc:frame:button:1" content="Cast'e Ekle!" />
        <meta property="fc:frame:button:1:action" content="link" />
        <meta property="fc:frame:button:1:target" content="https://warpcast.com/~/compose?text=&embeds[]=${finalImageUrl}" />
        <meta property="fc:frame:button:2" content="Başa Dön" />
      </head>
      <body>Süper Görselin Hazır!</body>
      </html>
    `;
    
    return res.status(200).setHeader("Content-Type", "text/html").send(htmlResponse);

  } catch (error) {
    console.error("HATA OLDU:", error);
    // Hata olursa en başa dön
    return res.status(200).setHeader("Content-Type", "text/html").send(getInitialFrame("Bi hata oldu kank, tekrar dene?"));
  }
}

// ANA SAYFA FRAME HTML KODU
function getInitialFrame(message = "Cast'in için AI Kapak Görseli Yap!") {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>AI Kapak</title>
      <meta property="og:title" content="AI Kapak" />
      <meta property="fc:frame" content="vNext" />
      <meta property="fc:frame:image" content="https://i.imgur.com/L1NnO1P.png" />
      <meta property="fc:frame:input:text" content="Cast metnini buraya yapıştır..." />
      <meta property="fc:frame:button:1" content="Görsel Oluştur!" />
    </head>
    <body>${message}</body>
    </html>
  `;
}
