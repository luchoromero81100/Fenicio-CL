/**
 * SERVER - Backend Node.js para IMG Finder
 * Maneja: API keys, proxy a OpenAI, scraping de imágenes
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateProductDescriptions } from './openaiClient.js';

// Cargar .env del directorio padre
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(cors());
app.use(express.json());

// Logging
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path}`);
    next();
});

// =============================================
// ENDPOINTS
// =============================================

// Health check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        openaiKey: process.env.OPENAI_API_KEY ? '✅ Configurada' : '❌ Falta',
        googleKey: process.env.GOOGLE_API_KEY ? '✅ Configurada' : '❌ Falta',
        geminiKey: process.env.GEMINI_API_KEY ? '✅ Configurada' : '❌ Falta'
    });
});

// Endpoint para servir API keys al frontend de forma segura
// Las keys vienen del .env del servidor, no se exponen en archivos estáticos
app.get('/api/config', (req, res) => {
    res.json({
        GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
        GOOGLE_CSE_ID: process.env.GOOGLE_CSE_ID || '',
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
        REMOVEBG_API_KEY: process.env.REMOVEBG_API_KEY || ''
    });
});

// Generar descripciones de producto
app.post('/api/generate-descriptions', async (req, res) => {
    try {
        const { product } = req.body;

        if (!product) {
            return res.status(400).json({ error: 'Falta el objeto product' });
        }

        console.log('🔄 Generando descripciones para:', product.nombreOriginal || product.modelo);

        const result = await generateProductDescriptions(product);

        console.log('✅ Descripciones generadas');
        res.json(result);

    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            error: error.message,
            descripcion_255: '',
            descripcion_larga: '',
            warnings: [`Error del servidor: ${error.message}`]
        });
    }
});

// Proxy para Chat Completions
app.post('/api/openai/chat', async (req, res) => {
    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (!response.ok) {
            console.error('❌ OpenAI Error:', response.status, JSON.stringify(data));
            return res.status(response.status).json(data);
        }

        res.json(data);

    } catch (error) {
        console.error('❌ Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// SCRAPING DE PÁGINA DE PRODUCTO + IA
// =============================================

app.post('/api/scrape-product-images', async (req, res) => {
    try {
        const { pageUrl, imageUrl, productContext } = req.body;

        if (!pageUrl && !imageUrl) {
            return res.status(400).json({ error: 'Falta pageUrl o imageUrl' });
        }

        let targetUrl = pageUrl;
        if (!targetUrl && imageUrl) {
            const urlObj = new URL(imageUrl);
            const domain = urlObj.hostname;
            console.log(`🔍 Buscando página de producto en: ${domain}`);
            targetUrl = `${urlObj.protocol}//${domain}`;
        }

        console.log(`📥 Scraping página: ${targetUrl}`);

        const response = await fetch(targetUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                'Accept-Language': 'es-419,es;q=0.9,en;q=0.8',
                'Cache-Control': 'no-cache'
            },
            timeout: 10000
        });

        if (!response.ok) {
            console.error(`❌ Error fetching page: ${response.status}`);
            return res.json({ images: [], error: `Error ${response.status}` });
        }

        const html = await response.text();
        const truncatedHtml = html.substring(0, 50000);

        console.log(`📄 HTML obtenido: ${html.length} chars (truncado a ${truncatedHtml.length})`);

        const extractedImages = await extractImagesWithAI(truncatedHtml, productContext, imageUrl);

        console.log(`✅ Extracted ${extractedImages.length} images`);
        res.json({ images: extractedImages });

    } catch (error) {
        console.error('❌ Scraping Error:', error);
        res.status(500).json({ error: error.message, images: [] });
    }
});

async function extractImagesWithAI(html, productContext, referenceImageUrl) {
    try {
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const srcsetRegex = /srcset=["']([^"']+)["']/gi;
        const dataRegex = /data-(?:src|zoom|large|original|image)=["']([^"']+)["']/gi;
        const bgRegex = /url\(["']?([^"')]+\.(jpg|jpeg|png|webp)[^"')]*)/gi;

        const allImageUrls = new Set();
        let match;

        while ((match = imgRegex.exec(html)) !== null) {
            if (match[1] && !match[1].startsWith('data:')) allImageUrls.add(match[1]);
        }
        while ((match = srcsetRegex.exec(html)) !== null) {
            const srcsetParts = match[1].split(',');
            for (const part of srcsetParts) {
                const url = part.trim().split(' ')[0];
                if (url && !url.startsWith('data:')) allImageUrls.add(url);
            }
        }
        while ((match = dataRegex.exec(html)) !== null) {
            if (match[1] && !match[1].startsWith('data:')) allImageUrls.add(match[1]);
        }
        while ((match = bgRegex.exec(html)) !== null) {
            if (match[1]) allImageUrls.add(match[1]);
        }

        const imageList = Array.from(allImageUrls)
            .filter(url => {
                const lower = url.toLowerCase();
                if (lower.includes('logo') || lower.includes('icon') || lower.includes('banner') ||
                    lower.includes('sprite') || lower.includes('pixel') || lower.includes('1x1') ||
                    lower.includes('avatar') || lower.includes('placeholder') || lower.includes('loading') ||
                    lower.includes('.svg') || lower.includes('.gif') || lower.includes('payment') ||
                    lower.includes('social') || lower.includes('footer') || lower.includes('header') ||
                    lower.includes('tracking') || lower.includes('analytics')) {
                    return false;
                }
                return /\.(jpg|jpeg|png|webp)/i.test(lower);
            })
            .slice(0, 50);

        if (imageList.length === 0) {
            console.log('⚠️ No se encontraron URLs de imágenes en el HTML');
            return [];
        }

        console.log(`🔍 Encontradas ${imageList.length} URLs de imágenes potenciales`);

        const prompt = `Analiza estas URLs de imágenes de una página web y selecciona SOLO las que parecen ser fotos del CARRUSEL DE PRODUCTO (diferentes ángulos/vistas del mismo producto).

URL de referencia (imagen ya encontrada del producto):
${referenceImageUrl || 'No disponible'}

Contexto del producto:
${productContext ? JSON.stringify(productContext) : 'No disponible'}

Lista de URLs encontradas:
${imageList.map((url, i) => `${i + 1}. ${url}`).join('\n')}

REGLAS:
- Selecciona URLs que parezcan ser VARIANTES de la misma imagen (diferentes tamaños/ángulos)
- Busca patrones como: -1, -2, -3 o _front, _back, _detail
- Prioriza las de mayor resolución
- Excluye thumbnails pequeños (menos de 100px en el nombre)
- Máximo 5 imágenes

Responde SOLO con un JSON array de los números de las URLs seleccionadas:
{"selected": [1, 3, 5, 7, 9]}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                max_tokens: 100
            })
        });

        if (!response.ok) {
            console.error('❌ OpenAI Error:', response.status);
            return [];
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '{}';

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const selectedIndices = result.selected || [];

            const selectedUrls = selectedIndices
                .filter(i => i >= 1 && i <= imageList.length)
                .map(i => imageList[i - 1]);

            return selectedUrls;
        }

        return [];

    } catch (error) {
        console.error('❌ Extract Images Error:', error);
        return [];
    }
}

// =============================================
// PROXY DE IMÁGENES (para descargar ZIP sin CORS)
// =============================================

app.get('/api/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).json({ error: 'Falta parámetro url' });
    }

    try {
        const response = await fetch(imageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Referer': new URL(imageUrl).origin
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `Error fetching image: ${response.status}` });
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');

        const buffer = await response.arrayBuffer();
        res.send(Buffer.from(buffer));

    } catch (error) {
        console.error('❌ Proxy Image Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// =============================================
// SERVIR FRONTEND (archivos estáticos)
// =============================================

app.use(express.static(path.join(__dirname, '..')));

// =============================================
// INICIAR SERVIDOR
// =============================================

app.listen(PORT, () => {
    console.log('');
    console.log('🚀 ═══════════════════════════════════════════');
    console.log(`🚀 IMG Finder corriendo en puerto ${PORT}`);
    console.log('🚀 ═══════════════════════════════════════════');
    console.log(`📡 App:  http://localhost:${PORT}`);
    console.log(`📡 API:  http://localhost:${PORT}/api`);
    console.log(`🔑 OpenAI:  ${process.env.OPENAI_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 Google:  ${process.env.GOOGLE_API_KEY ? '✅' : '❌'}`);
    console.log(`🔑 Gemini:  ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
    console.log('');
});
