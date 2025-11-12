// Bu bizim "Beyin" (Vercel Serverless Fonksiyonu) - DÜZELTİLMİŞ VERSİYON
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
    // İlk ziyaret (GET isteği) için Ana Sayfa Frame'ini göster
    return res.status(200).setHeader("Content-Type", "text/html").send(getInitialFrame());
  }

  // --- POST İsteği Geldi (Kullanıcı Butona Bastı) ---
  try {
    // Farcaster'dan gelen datayı oku
    const body = req.body;
    const fid = body.untrustedData.fid;
    const inputText = body.untrustedData.inputText || ""; // Kullanıcının girdiği metin
    const buttonIndex = body.untrustedData.buttonIndex;

    // --- DURUM 1: Kullanıcı "Başa Dön"e bastı (eğer eklersek) ---
    if (buttonIndex === 2) { // 2. butona (Başa Dön) basılırsa
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
    let logoUrl;
    try {
      const domain = `${topic.toLowerCase()}.com`;
      logoUrl = `https://logo.clearbit.com/${domain}`;
      await axios.get(logoUrl); // Logoyu test et
      console.log("Logo Bulundu:", logoUrl);
    } catch (error) {
      console.log("Logo bulunamadı, varsayılan logo kullanılacak.");
      logoUrl = 'https://i.imgur.com/M8P5gYg.png'; // Varsayılan Farcaster logosu
    }

    // 4. Görseli Birleştir (Cloudinary)
    const finalImageUrl = cloudinary.url(pfpUrl, {
      transformation: [
        { width: 1000, height: 523, crop: 'fill', gravity: 'face', effect: 'blur:100' }, 
        { effect: 'brightness:-30' }, 
        {
          overlay: { url: logoUrl }, 
          width: 200, 
          height: 200, 
          crop: 'limit',
          gravity: 'south_east', 
          x: 40, 
          y: 40, 
          opacity: 90
        }
      ],
      sign_url: true 
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
    return res.status(500).setHeader("Content-Type", "text/html").send(getInitialFrame("Bi hata oldu kank, tekrar dene?"));
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
