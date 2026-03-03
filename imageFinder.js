// =============================================
// IMAGE FINDER - Buscador de Imágenes
// Requiere: shared.js cargado previamente
// =============================================

// =============================================
// CONSTANTES PARA PREFILTRADO
// =============================================
const PREFILTER_BLACKLIST = [
    'pinterest', 'pinimg', 'favicon', 'sprite', 'logo', 'icon',
    'banner', 'ads', 'svg', 'vector', 'placeholder', 'loading',
    'pixel', 'tracking', '1x1', 'spacer', 'avatar', 'thumb_'
];

const VALID_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];

// =============================================
// A) RECOLECCIÓN DE CANDIDATAS (SIN IA)
// =============================================
async function collectCandidateImages(product) {
    const cleanedSku = product.sku;
    const marca = product.marca || '';
    const modelo = product.modelo || '';
    const colorProv = product.colorProv || '';
    const colorExpanded = COLOR_CODES_MAPPING[(colorProv || '').toUpperCase()] || colorProv;
    const nombreProducto = product.nombreOriginal || '';
    const categoriaES = product.categoria || '';

    // Traducir categoría a inglés para búsquedas
    const categoriaEN = CATEGORY_TO_ENGLISH[categoriaES] || extractProductCategory(nombreProducto) || '';

    // Preparar filtro de marca
    const marcaLower = marca.toLowerCase().replace(/\s+/g, '');
    const marcaWords = marca.toLowerCase().split(/\s+/).filter(w => w.length > 3);

    const trustedDomains = [
        'amazon', 'mercadolibre', 'ebay', 'zalando', 'asos',
        'footlocker', 'jdsports', 'surfstitch', 'boardriders', 'patagonia', 'rei.com'
    ];

    // Función para verificar si URL contiene la marca
    const urlMatchesBrand = (url) => {
        const urlLower = url.toLowerCase();
        if (urlLower.includes(marcaLower)) return true;
        if (marcaWords.some(word => urlLower.includes(word))) return true;
        if (trustedDomains.some(d => urlLower.includes(d))) return true;
        return false;
    };

    // =============================================
    // 7 QUERIES TOTALES - Cada una busca hasta 20 URLs
    // =============================================

    // GRUPO A: Búsquedas generales (sin filtro de marca en URL)
    const queriesGeneral = [
        {
            name: 'Q1-G (Marca+Modelo+Color)',
            query: `${marca} ${modelo} ${colorExpanded} ${categoriaEN}`.trim(),
            numImages: 20
        },
        {
            name: 'Q2-G (SKU Exacto)',
            query: `"${cleanedSku}"`,
            numImages: 20
        }
    ];

    // GRUPO B: Las mismas queries pero CON filtro de marca + queries adicionales
    const queriesBrand = [
        {
            name: 'Q1-B (Marca+Modelo+Color)',
            query: `${marca} ${modelo} ${colorExpanded} ${categoriaEN}`.trim(),
            numImages: 20
        },
        {
            name: 'Q2-B (SKU Exacto)',
            query: `"${cleanedSku}"`,
            numImages: 20
        },
        {
            name: 'Q3-B (Marca+Modelo+Categoria)',
            query: `${marca} ${modelo} ${categoriaEN}`.trim(),
            numImages: 20
        },
        {
            name: 'Q4-B (SKU+Marca)',
            query: `"${cleanedSku}" ${marca}`,
            numImages: 20
        },
        {
            name: 'Q5-B (Modelo+Color)',
            query: `${modelo} ${colorExpanded}`.trim(),
            numImages: 20
        }
    ];

    let candidatesGeneral = [];
    let candidatesBrand = [];
    const MAX_TOTAL_IMAGES = 140;  // 7 queries × 20 URLs = 140 máximo

    addLog(`🔎 Búsqueda: ${marca} ${modelo} | Color: ${colorExpanded} | Cat: ${categoriaEN} | SKU: ${cleanedSku}`, 'info');

    // Ejecutar GRUPO A (sin filtro de marca)
    for (const { name, query, numImages } of queriesGeneral) {
        try {
            const images = await searchImagesWithSize(query, numImages, null);
            candidatesGeneral.push(...images);
            addLog(`   ${name}: ${images.length} imgs`, 'info');
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_REQUESTS));
        } catch (error) {
            addLog(`   ${name}: ERROR - ${error.message}`, 'warning');
        }
    }

    // Ejecutar GRUPO B (con filtro de marca en URL)
    for (const { name, query, numImages } of queriesBrand) {
        if ((candidatesGeneral.length + candidatesBrand.length) >= MAX_TOTAL_IMAGES) {
            break;
        }
        try {
            const images = await searchImagesWithSize(query, numImages + 5, null);

            // Filtrar solo las que contengan la marca en la URL
            const brandFiltered = marca.length > 2
                ? images.filter(urlMatchesBrand)
                : images;

            candidatesBrand.push(...brandFiltered);
            addLog(`   ${name}: ${images.length} → ${brandFiltered.length} de marca`, 'info');
            await new Promise(r => setTimeout(r, CONFIG.DELAY_BETWEEN_REQUESTS));
        } catch (error) {
            addLog(`   ${name}: ERROR - ${error.message}`, 'warning');
        }
    }

    // Combinar y deduplicar (normalizando URLs para evitar duplicados triviales)
    const allCandidates = [...candidatesGeneral, ...candidatesBrand];

    const seenUrls = new Set();
    const uniqueCandidates = [];

    for (const url of allCandidates) {
        if (!url) continue;

        // Normalización básica para dedupe: trim, toLower, quitar protocolo, quitar slash final
        // Esto detecta: http://... vs https://... y .../ vs ...
        const normalized = url.trim().toLowerCase()
            .replace(/^https?:\/\//, '')
            .replace(/\/$/, '');

        if (!seenUrls.has(normalized)) {
            seenUrls.add(normalized);
            uniqueCandidates.push(url);
        }
    }

    // Limitar al máximo permitido
    const finalCandidates = uniqueCandidates.slice(0, MAX_TOTAL_IMAGES);

    addLog(`📊 Total: ${candidatesGeneral.length} generales + ${candidatesBrand.length} de marca → ${finalCandidates.length} únicas`, 'success');
    return finalCandidates;
}

// =============================================
// B) PREFILTRADO BARATO (SIN IA)
// =============================================
async function prefilterImageUrls(urls) {
    const startCount = urls.length;
    addLog(`🧹 Prefiltrado: iniciando con ${startCount} URLs...`, 'info');

    // Paso 1: Filtrado por reglas estáticas
    let filtered = urls.filter(url => {
        const urlLower = url.toLowerCase();

        // Rechazar URLs muy largas
        if (url.length > 2000) return false;

        // Verificar extensión válida (incluyendo querystrings)
        const hasValidExt = VALID_IMAGE_EXTENSIONS.some(ext => {
            const pattern = new RegExp(`\\.${ext}($|\\?|&)`, 'i');
            return pattern.test(url);
        });
        if (!hasValidExt) return false;

        // Verificar blacklist
        const hasBlacklisted = PREFILTER_BLACKLIST.some(kw => urlLower.includes(kw));
        if (hasBlacklisted) return false;

        return true;
    });

    addLog(`   Tras filtros estáticos: ${filtered.length}`, 'info');

    // Paso 2: Preload para verificar que cargan (opcional pero recomendado)
    const verifiedUrls = [];
    const preloadPromises = filtered.slice(0, 30).map(async (url, idx) => {
        const loads = await preloadImageWithTimeout(url, CONFIG.IMAGE_LOAD_TIMEOUT);
        if (loads) {
            verifiedUrls.push(url);
        }
    });

    await Promise.all(preloadPromises);

    // Limitar al máximo para IA
    const finalUrls = verifiedUrls.slice(0, CONFIG.MAX_CANDIDATES_FOR_AI);

    addLog(`   Tras preload: ${verifiedUrls.length} cargan → ${finalUrls.length} para IA`, 'info');

    return finalUrls;
}

// Helper: Preload imagen con timeout
function preloadImageWithTimeout(url, timeout) {
    return new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => {
            img.src = '';
            resolve(false);
        }, timeout);

        img.onload = () => {
            clearTimeout(timer);
            // Verificar tamaño mínimo
            resolve(img.naturalWidth >= 200 && img.naturalHeight >= 200);
        };
        img.onerror = () => {
            clearTimeout(timer);
            resolve(false);
        };
        img.src = url;
    });
}

// =============================================
// C) SELECCIÓN CON IA - FLUJO HÍBRIDO
// Gemini: Describe las imágenes visualmente
// ChatGPT: Evalúa las descripciones vs datos del producto
// =============================================

async function selectBestImageSetWithAI(candidateUrls, product, excludeColor = null) {
    if (candidateUrls.length === 0) {
        addLog('❌ No hay candidatas para enviar a IA', 'error');
        return [];
    }

    const colorProv = product.colorProv || '';
    const colorExpanded = COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv;

    // Obtener categoría en español e inglés
    const categoriaES = product.categoria || '';
    const categoriaEN = CATEGORY_TO_ENGLISH[categoriaES] || categoriaES;

    const productContext = {
        marca: product.marca || '',
        modelo: product.modelo || '',
        sku: product.sku,
        nombreOriginal: product.nombreOriginal,
        colorExpanded: colorExpanded,
        colorProv: colorProv,
        categoriaES: categoriaES,
        categoriaEN: categoriaEN
    };

    addLog(`🔍 Analizando ${candidateUrls.length} imágenes con IA...`, 'info');
    const startTime = Date.now();

    try {
        // =============================================
        // PASO 1: Describir cada imagen
        // =============================================
        addLog(`🌟 Paso 1: Describiendo imágenes (esperando: ${productContext.categoriaES})...`, 'info');
        const imageDescriptions = await describeImagesWithGemini(candidateUrls, productContext.categoriaES);

        const validDescriptions = imageDescriptions.filter(d => d.description !== null);
        addLog(`   ✓ ${validDescriptions.length}/${candidateUrls.length} imágenes descritas`, 'success');

        if (validDescriptions.length === 0) {
            addLog('❌ No se pudo describir ninguna imagen', 'error');
            return candidateUrls.slice(0, CONFIG.IMAGES_PER_ITEM);
        }

        // =============================================
        // PASO 1.5: FILTRADO ESTRICTO EN JS (HARD FILTER)
        // =============================================
        // Aplicamos reglas de oro ANTES de preguntar a GPT para ahorrar tokens y evitar errores
        const strictFiltered = filterDescriptionsStrictly(validDescriptions, productContext, excludeColor);
        addLog(`   🛡️ Hard Filter: ${validDescriptions.length} → ${strictFiltered.length} candidatas válidas`, strictFiltered.length > 0 ? 'info' : 'warning');

        if (strictFiltered.length === 0) {
            addLog(`⚠️ Todas las imágenes fueron rechazadas por reglas estrictas (categoría/color/calidad)`, 'warning');
            return [];
        }

        // =============================================
        // PASO 2: ChatGPT evalúa y ordena las descripciones
        // =============================================
        addLog(`🧠 Paso 2: ChatGPT evaluando ${strictFiltered.length} imágenes...`, 'info');
        const selectedImages = await evaluateDescriptionsWithGPT(strictFiltered, productContext, excludeColor);

        const elapsed = Date.now() - startTime;

        if (selectedImages.length === 0) {
            addLog(`⚠️ ChatGPT no aprobó ninguna imagen (${elapsed}ms)`, 'warning');
            return candidateUrls.slice(0, CONFIG.IMAGES_PER_ITEM);
        }

        addLog(`✅ Seleccionadas ${selectedImages.length} imágenes en ${elapsed}ms`, 'success');
        return selectedImages;

    } catch (error) {
        console.error('Error en flujo híbrido:', error);
        addLog(`❌ Error: ${error.message}`, 'error');
        return candidateUrls.slice(0, CONFIG.IMAGES_PER_ITEM);
    }
}

// =============================================
// GEMINI: Describir imágenes visualmente
// =============================================
async function describeImagesWithGemini(imageUrls, expectedCategory = '') {
    const descriptions = [];
    const batchSize = 5; // Procesar en lotes para evitar rate limits

    for (let i = 0; i < imageUrls.length; i += batchSize) {
        const batch = imageUrls.slice(i, i + batchSize);

        const batchPromises = batch.map(async (url, batchIndex) => {
            const globalIndex = i + batchIndex;
            try {
                const description = await describeImageWithGemini(url, expectedCategory);
                return {
                    index: globalIndex,
                    url: url,
                    description: description
                };
            } catch (error) {
                console.error(`Error describiendo imagen ${globalIndex}:`, error);
                return {
                    index: globalIndex,
                    url: url,
                    description: null
                };
            }
        });

        const batchResults = await Promise.all(batchPromises);

        // Log de cada descripción
        for (const result of batchResults) {
            if (result.description) {
                const d = result.description;
                const realIcon = d.es_producto_real ? '✓' : '✗';
                const perchaIcon = d.esta_colgado_en_percha ? '👔' : '';
                const tipoIcon = d.tipo_foto === 'estudio' ? '🎨' : '🌆';
                const catVisibleIcon = d.se_ve_claramente_la_categoria === 'si' ? '✅' : '❌';
                const mangaIcon = d.tipo_manga === 'corta' ? 'MC' : d.tipo_manga === 'larga' ? 'ML' : d.tipo_manga === 'sin_manga' ? 'SM' : '';

                addLog(`   📷 Img ${result.index}: ${d.objeto_detectado || '?'} | ${d.color_detectado || '?'} | ${mangaIcon ? mangaIcon + ' |' : ''} ${tipoIcon} | Real: ${realIcon} | Cat.Visible: ${catVisibleIcon} ${perchaIcon}`, 'info');

                if (d.descripcion_diseno) {
                    addLog(`      └─ Diseño: ${d.descripcion_diseno}`, 'info');
                }
                if (d.descripcion_visual_muy_detallada) {
                    addLog(`      👀 Detalle: ${d.descripcion_visual_muy_detallada.substring(0, 100)}...`, 'info');
                }
            } else {
                addLog(`   📷 Img ${result.index}: ❌ No se pudo describir`, 'warning');
            }
        }


        descriptions.push(...batchResults);

        // Pequeño delay entre lotes
        if (i + batchSize < imageUrls.length) {
            await delay(200);
        }

    }

    return descriptions;
}

// Describir una sola imagen con OpenAI (acepta URLs directas)
async function describeImageWithGemini(imageUrl, expectedCategory = '') {
    const prompt = `Analiza esta imagen y describe OBJETIVAMENTE solo lo que ves.

NO DEBES inferir el producto esperado.
SOLO describe lo que está visible en la imagen con MÁXIMA PRECISIÓN.

PREGUNTA CRÍTICA: ¿Se ve CLARAMENTE un/a "${expectedCategory || 'producto'}" en esta imagen?
- Responde "si" SOLO si el artículo de tipo "${expectedCategory}" es claramente visible y reconocible.
- Responde "no" si no hay ningún "${expectedCategory}" visible, o si el objeto principal es OTRO tipo de prenda/producto.

RESPONDE EXCLUSIVAMENTE EN JSON (sin markdown, sin backticks):
{
  "se_ve_claramente_la_categoria": "si" | "no",
  "objeto_detectado": "remera" | "championes" | "zapatilla" | "gorra" | "campera" | "pantalon" | "short" | "buzo" | "musculosa" | "mochila" | "accesorio" | "otro",
  "color_detectado": "color principal simple (negro, blanco, azul, rojo, verde, gris, beige, etc.)",
  "tiene_logo_o_diseno": true | false,
  "descripcion_diseno": "describe brevemente el logo, texto o gráfico visible (null si no hay diseño)",
  "tipo_foto": "estudio" | "lifestyle",
  "es_producto_real": true | false,
  "esta_colgado_en_percha": true | false,
  "visibilidad_producto": "clara" | "parcial" | "confusa",
  "protagonismo_producto": "destacado" | "secundario" | "fondo",
  "tiene_texto_extra_o_banner": true | false,
  "es_collage": true | false,
  "tipo_manga": "corta" | "larga" | "sin_manga" | "no_aplica",
  "descripcion_visual_muy_detallada": "DESCRIPCIÓN EXHAUSTIVA (mínimo 20 palabras). Describe geometría del logo, ubicación exacta de textos, tipografía, texturas, colores secundarios, fondo, y cualquier detalle distintivo."
}

CRITERIOS PARA "tipo_manga":
- "corta": Prenda con mangas que terminan en el bíceps o antes del codo
- "larga": Prenda con mangas que llegan hasta la muñeca
- "sin_manga": Prenda sin mangas (musculosa, tank top, tirantes)
- "no_aplica": Si no es una prenda con mangas (gorras, zapatillas, mochilas, etc.)

CRITERIOS DE EXCLUSIÓN (TOLERANCIA CERO):
- "tiene_texto_extra_o_banner": TRUE si ves precios, "SALE", "MÁXIMA CALIDAD", marcas de agua, bordes de colores, o texto que NO es parte del diseño de la prenda en sí.
- "es_collage": TRUE si la imagen son 2 o más fotos pegadas.
- "es_producto_real": FALSE si es un gráfico, vector, dibujo o un banner publicitario.

CRITERIOS DE VISIBILIDAD (MUY IMPORTANTE):
- "visibilidad_producto": "clara" SI Y SOLO SI el artículo se ve completo (o su parte principal) y nítido.
- "visibilidad_producto": "parcial" si está tapado, cortado o borroso.
- "protagonismo_producto": "destacado" si el artículo es el foco principal de la imagen. Si es una foto lifestyle de cuerpo entero y buscas "zapatillas", pero las zapatillas se ven pequeñas o sin detalle, pon "secundario".

REGLAS CRÍTICAS PARA "objeto_detectado":

⚠️ SÉ MUY ESPECÍFICO Y PRECISO. Diferencia claramente entre prendas similares:

- "remera": Manga corta o larga, CUELLO REDONDO o en V, SIN capucha, SIN cierre
- "buzo": Con o sin capucha, SIN cierre frontal, tela más gruesa/abrigada
- "musculosa": SIN MANGAS, tirantes anchos
- "campera": Con CIERRE frontal (cremallera/botones), prenda de abrigo
- "sweater": Prenda de punto/tejido, SIN capucha, SIN cierre
- "gorra": Visera frontal, tipo baseball cap
- "gorro": SIN visera, cubre la cabeza, tipo beanie
- "zapatilla" o "championes": Calzado deportivo
- "otro": Solo si no puedes identificar claramente qué es

EJEMPLOS VISUALES:
- Si ves MANGAS + SIN capucha + SIN cierre + tela liviana → "remera"
- Si ves CON capucha + SIN cierre → "buzo"
- Si ves SIN mangas + tirantes → "musculosa"
- Si ves CIERRE frontal visible → "campera"
- Si NO estás 100% seguro del tipo → "otro"

REGLAS GENERALES:
- color_detectado: Color dominante del producto (UNA palabra simple)
- tiene_logo_o_diseno: ¿Tiene algún logo, texto, estampado o diseño visible?
- descripcion_diseno: Si tiene diseño, descríbelo brevemente. Si es liso/sin diseño, devuelve null.
- tipo_foto: "estudio" = fondo neutro/blanco. "lifestyle" = persona usándolo o contexto real.
- es_producto_real: false si es un render 3D, mockup digital, ilustración, captura de pantalla o banner.
- esta_colgado_en_percha: true si el producto está colgado en una percha (gancho de ropa).

Ejemplo de respuesta:
{
  "objeto_detectado": "remera",
  "color_detectado": "negro",
  "tiene_logo_o_diseno": true,
  "descripcion_diseno": "logo circular blanco en el pecho",
  "tipo_foto": "estudio",
  "es_producto_real": true,
  "esta_colgado_en_percha": false
}`;


    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } }
                    ]
                }],
                max_tokens: 300,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`OpenAI Vision error: ${response.status}`, errorText);
            return null;
        }

        const data = await response.json();
        const responseText = data.choices?.[0]?.message?.content || '';

        // Intentar parsear JSON
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                return JSON.parse(jsonMatch[0]);
            } catch (e) {
                console.error('Error parsing response:', e);
                return null;
            }
        }

        return null;

    } catch (error) {
        console.error('Error describiendo imagen:', error);
        return null;
    }
}




// =============================================
// CHATGPT: Evaluar descripciones vs producto
// =============================================
async function evaluateDescriptionsWithGPT(imageDescriptions, productContext, excludeColor = null) {
    const prompt = buildEvaluationPrompt(imageDescriptions, productContext, excludeColor);

    try {
        const response = await AIRequestQueue.callWithRetry(async () => {
            return await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: CONFIG.AI_MODEL,
                    messages: [{
                        role: 'system',
                        content: 'Eres un experto en validación de productos para e-commerce. Tu trabajo es decidir si las descripciones de imágenes coinciden con el producto buscado. Respondes SOLO en JSON válido.'
                    }, {
                        role: 'user',
                        content: prompt
                    }],
                    max_tokens: 1000,
                    temperature: 0.1
                })
            });
        }, 3);

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const responseText = data.choices[0]?.message?.content || '';

        return parseGPTEvaluationResponse(responseText, imageDescriptions);

    } catch (error) {
        console.error('Error en evaluación GPT:', error);
        addLog(`⚠️ Error GPT: ${error.message}`, 'warning');
        // Fallback: Si GPT falla, devolvemos las que pasaron el filtro estricto (mejor que nada y seguro)
        return imageDescriptions.slice(0, CONFIG.IMAGES_PER_ITEM).map(d => d.url);
    }
}

// =============================================
// FILTRO ESTRICTO EN JS (HARD FILTER)
// =============================================
function filterDescriptionsStrictly(items, ctx, excludeColor) {
    return items.filter(item => {
        const d = item.description;
        const logPrefix = `   🚫 Rechazada Img ${item.index}:`;

        // 0. REGLA PRINCIPAL: ¿Se ve claramente la categoría esperada?
        if (d.se_ve_claramente_la_categoria === 'no') {
            // addLog(`${logPrefix} No se ve claramente la categoría esperada`, 'warning');
            return false;
        }

        // 1. REGLA DE CALIDAD / REALISMO (TOLERANCIA CERO)
        if (!d.es_producto_real) {
            // addLog(`${logPrefix} No es producto real`, 'warning'); // Verbose off
            return false;
        }
        if (d.tiene_texto_extra_o_banner) {
            // addLog(`${logPrefix} Tiene banner/texto`, 'warning');
            return false;
        }
        if (d.es_collage) {
            return false;
        }
        if (d.visibilidad_producto === 'confusa') {
            return false;
        }
        if (d.protagonismo_producto === 'fondo' || d.protagonismo_producto === 'secundario') {
            // addLog(`${logPrefix} Protagonismo bajo (${d.protagonismo_producto})`, 'warning');
            return false;
        }

        // 2. REGLA DE ORO DE CATEGORÍA
        const nameUpper = ctx.nombreOriginal.toUpperCase();
        const obj = (d.objeto_detectado || '').toLowerCase();

        // Mapas de rechazo explícito
        if (nameUpper.includes('REMERA') || nameUpper.includes('TEE') || ctx.categoriaES.includes('Remera')) {
            if (obj !== 'remera' && obj !== 'musculosa' && obj !== 'polo') return false;
            // Aceptamos musculosa/polo como "quizas", pero rechazamos buzo/campera fuerte
            if (obj === 'buzo' || obj === 'campera' || obj === 'sweater' || obj === 'hoodie') return false;
        }

        if (nameUpper.includes('BUZO') || nameUpper.includes('HOODIE') || ctx.categoriaES.includes('Buzo')) {
            if (obj !== 'buzo' && obj !== 'sweater') return false;
            if (obj === 'remera' || obj === 'campera' && !nameUpper.includes('ZIP')) return false;
        }

        if (nameUpper.includes('GORRA') || ctx.categoriaES.includes('Gorra')) {
            if (obj !== 'gorra') return false;
        }

        if (nameUpper.includes('CHAMPIONES') || nameUpper.includes('ZAPATILLAS') || ctx.categoriaES.includes('Calzado')) {
            // Aceptamos zapatilla, championes, zapato. Rechazamos ropa.
            if (!['zapatilla', 'championes', 'calzado', 'zapato', 'botas'].includes(obj)) return false;
        }

        // RECHAZO DE "OTROS" y "ACCESORIOS" SI BUSCAMOS ROPA ESPECÍFICA
        if (['remera', 'buzo', 'pantalón', 'campera', 'gorra', 'zapatillas'].some(c => ctx.categoriaES.toLowerCase().includes(c))) {
            if (obj === 'otro' || obj === 'accesorio') return false;
        }

        // 3. REGLA DE COLOR (Flexible pero firme ante opuestos)
        if (ctx.colorExpanded) {
            const targetColor = ctx.colorExpanded.toLowerCase();
            const detColor = (d.color_detectado || '').toLowerCase();

            // Si el color detectado es ALGO y es MUY diferente (ej: negro vs blanco) -> rechazar
            // Pero permitir matices (azul vs celeste, etc) - esto es difícil en JS simple, 
            // así que solo rechazamos opuestos obvios o colores prohibidos

            if (excludeColor && detColor.includes(excludeColor.toLowerCase())) {
                return false;
            }

            // Lista de incompatibles
            if (targetColor.includes('negro') && (detColor.includes('blanco') || detColor.includes('rojo') || detColor.includes('verde') || detColor.includes('azul'))) return false;
            if (targetColor.includes('blanco') && (detColor.includes('negro') || detColor.includes('rojo') || detColor.includes('azul'))) return false;
        }

        return true;
    });
}

// Construir prompt para evaluación de GPT
function buildEvaluationPrompt(imageDescriptions, productContext, excludeColor = null) {
    const max = CONFIG.IMAGES_PER_ITEM;

    // Formatear las descripciones con los NUEVOS campos simplificados
    const descriptionsText = imageDescriptions.map((item, idx) => {
        const d = item.description;
        return `[IMAGEN ${item.index}]
- Objeto detectado: ${d.objeto_detectado || 'no especificado'}
- Color detectado: ${d.color_detectado || 'no detectado'}
- Tiene logo/diseño: ${d.tiene_logo_o_diseno ? 'SÍ' : 'NO'}
- Descripción diseño: ${d.descripcion_diseno || 'liso/sin diseño'}
- Tipo de foto: ${d.tipo_foto || 'desconocido'}
- Es producto real: ${d.es_producto_real ? 'SÍ' : 'NO'}
- Está colgado en percha: ${d.esta_colgado_en_percha ? 'SÍ' : 'NO'}
- Visibilidad: ${d.visibilidad_producto || 'desconocida'}
- Protagonismo: ${d.protagonismo_producto || 'desconocido'}
- Tiene texto/banner: ${d.tiene_texto_extra_o_banner ? 'SÍ' : 'NO'}
- Es collage: ${d.es_collage ? 'SÍ' : 'NO'}
- DETALLE VISUAL: ${d.descripcion_visual_muy_detallada || 'No disponible'}`;
    }).join('\n\n');

    // Detectar si el producto es zapatilla/championes
    const esCalzado = productContext.categoriaES &&
        (productContext.categoriaES.toLowerCase().includes('zapatilla') ||
            productContext.categoriaES.toLowerCase().includes('championes') ||
            productContext.categoriaES.toLowerCase().includes('calzado'));

    return `CONTEXTO: Evalúa imágenes para e-commerce y selecciónalas en ORDEN ESPECÍFICO.

═══════════════════════════════════════════════════════════════
PRODUCTO BUSCADO
═══════════════════════════════════════════════════════════════
- NOMBRE COMPLETO: "${productContext.nombreOriginal}"
- MARCA: "${productContext.marca}"
- MODELO: "${productContext.modelo}" ← IMPORTANTE
- SKU: "${productContext.sku}"
- COLOR ESPERADO: "${productContext.colorProv}" → "${productContext.colorExpanded}"
- CATEGORÍA: "${productContext.categoriaES}"
- ES CALZADO: ${esCalzado ? 'SÍ' : 'NO'}

═══════════════════════════════════════════════════════════════
DESCRIPCIONES DE IMÁGENES
═══════════════════════════════════════════════════════════════
${descriptionsText}

═══════════════════════════════════════════════════════════════
🚫 DESCARTE ABSOLUTO (RECHAZAR SIEMPRE)
═══════════════════════════════════════════════════════════════

RECHAZAR INMEDIATAMENTE si:
1. es_producto_real = NO → RECHAZAR (renders, mockups, screenshots, banners)
2. esta_colgado_en_percha = SÍ → RECHAZAR (producto en gancho de ropa)
3. color_detectado diferente a "${productContext.colorExpanded}" → RECHAZAR

═══════════════════════════════════════════════════════════════
⚠️ VALIDACIÓN DE CATEGORÍA (CRÍTICO - CERO TOLERANCIA)
═══════════════════════════════════════════════════════════════

CATEGORÍA EXACTA ESPERADA: "${productContext.categoriaES}"

REGLA ABSOLUTA - COINCIDENCIA EXACTA OBLIGATORIA:
El "objeto_detectado" DEBE ser EXACTAMENTE el mismo tipo de prenda que "${productContext.categoriaES}".
NO ser flexible, NO interpretar, NO aceptar "similares".


${excludeColor ? `4. color_detectado ES SIMILAR A "${excludeColor}" → RECHAZAR (Es el color del producto anterior, buscamos variante).` : ''}

5. RECHAZAR SIEMPRE si Visibilidad = "confusa" o "mala".
6. RECHAZAR SIEMPRE si Protagonismo = "fondo" u "oculto".
7. RECHAZAR SIEMPRE si Tiene texto/banner = "SÍ" (No queremos banners, fotos con precios ni texto promocional).
8. RECHAZAR SIEMPRE si Es collage = "SÍ".

9. RECHAZAR LIFESTYLE SI Protagonismo = "secundario" (El producto DEBE ser el foco principal, incluso en lifestyle).
   - Ejemplo: Si busco "Championes" y la foto es de cuerpo entero donde los zapatos son apenas visibles → RECHAZAR.
   - Si la foto es un "banner" de una categoría completa -> RECHAZAR.
   - El producto buscado ("${productContext.categoriaES}") tiene que verse CLARAMENTE y ser el PROTAGONISTA.

10. REGLA DE ORO POR NOMBRE DEL PRODUCTO (PRIORIDAD MÁXIMA):
   - Si el NOMBRE DEL PRODUCTO ("${productContext.nombreOriginal}") contiene la palabra "REMERA", el objeto_detectado DEBE ser "remera". Si es "buzo", "campera" o "musculosa" → RECHAZAR.
   - Si el nombre dice "BUZO" o "HOODIE", el objeto DEBE ser "buzo". Si es "remera" → RECHAZAR.
   - Si el nombre dice "PANTALON" o "JEAN", el objeto DEBE ser "pantalon" o "jean".
   - Si el nombre dice "GORRA" o "CAP", el objeto DEBE ser "gorra".
   - Si el nombre dice "CAMISA", el objeto DEBE ser "camisa".
   - ESTA REGLA PREVALECE sobre todo lo demás. No importa si "parece" lindo, si el tipo de prenda está mal, SE DESCARTA.

EJEMPLOS DE RECHAZO OBLIGATORIO:

Si la categoría es "Remera" o el nombre dice "Remera":
  ✗ RECHAZAR si objeto_detectado = "buzo" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "musculosa" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "campera" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "sweater" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "otro" (NO SE PUEDE CONFIRMAR)
  ✓ ACEPTAR SOLO si objeto_detectado = "remera"

Si la categoría es "Buzo":
  ✗ RECHAZAR si objeto_detectado = "remera" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "campera" (ES OTRA PRENDA)
  ✗ RECHAZAR si objeto_detectado = "sweater" (ES OTRA PRENDA)
  ✓ ACEPTAR SOLO si objeto_detectado = "buzo"

Si la categoría es "Gorra":
  ✗ RECHAZAR si objeto_detectado = "gorro" (ES DIFERENTE)
  ✗ RECHAZAR si objeto_detectado = "sombrero" (ES OTRA PRENDA)
  ✓ ACEPTAR SOLO si objeto_detectado = "gorra"

Si la categoría es "Zapatillas" o "Championes":
  ✗ RECHAZAR si objeto_detectado = "botas"
  ✗ RECHAZAR si objeto_detectado = "ojotas"
  ✗ RECHAZAR si objeto_detectado = "sandalias"
  ✓ ACEPTAR SOLO si objeto_detectado = "zapatilla" o "championes"

POLÍTICA DE RECHAZO:
- Si hay CUALQUIER duda sobre el tipo de prenda → RECHAZAR
- Si el objeto_detectado no coincide palabra por palabra → RECHAZAR
- Preferir tener 0 imágenes seleccionadas que 1 imagen del producto incorrecto
- La coincidencia debe ser OBVIA, CLARA y EXACTA

═══════════════════════════════════════════════════════════════
⭐ PRIORIDAD POR MODELO EN DISEÑO
═══════════════════════════════════════════════════════════════

El MODELO es: "${productContext.modelo}"

PRIORIZAR imágenes donde:
- Si tiene_logo_o_diseno = SÍ Y descripcion_diseno menciona "${productContext.modelo}" → MÁXIMA PRIORIDAD
- Si descripcion_diseno tiene relación semántica con el modelo (ej: modelo "Oasis" y diseño con palmeras) → ALTA PRIORIDAD

Si hay imágenes que coinciden con el modelo en el diseño, PREFERIR ESAS.

═══════════════════════════════════════════════════════════════
🔄 COHERENCIA ENTRE IMÁGENES
═══════════════════════════════════════════════════════════════

TODAS las seleccionadas DEBEN:
1. Tener el MISMO color_detectado
2. Tener el MISMO diseño (si una tiene logo, todas deben tenerlo; si es lisa, todas lisas)
3. Parecer el MISMO artículo en diferentes ángulos

═══════════════════════════════════════════════════════════════
📐 ORDENAMIENTO OBLIGATORIO DE IMÁGENES
═══════════════════════════════════════════════════════════════

La lista "selected" DEBE estar ordenada así:

1) PRIMERA IMAGEN (OBLIGATORIO):
${esCalzado ? `   Como ES CALZADO:
   → DEBE ser una vista COMPLETAMENTE DE COSTADO (perfil lateral)
   → NO frontal, NO 3/4, NO lifestyle
   → Foto de estudio con fondo neutro` : `   Como NO ES CALZADO:
   → DEBE ser una vista de FRENTE
   → Producto completo visible
   → Foto de estudio con fondo neutro`}

2) IMÁGENES INTERMEDIAS:
   → Priorizar tipo_foto = "estudio"
   → Variar ángulos (frente, espalda, detalle)
   → Mantener coherencia de color y diseño

3) ÚLTIMA IMAGEN (si existe):
   → Si hay imágenes con tipo_foto = "lifestyle" válidas,
     colocar UNA al final
   → NUNCA poner lifestyle como primera imagen

═══════════════════════════════════════════════════════════════
RESPUESTA (JSON limpio, sin markdown)
═══════════════════════════════════════════════════════════════
{
  "selected": [
    {"index": 0, "tipo_imagen": "estudio_${esCalzado ? 'costado' : 'frente'}", "coincideModelo": true/false, "reason": "..."}
  ],
  "rejected": [
    {"index": 1, "reason": "motivo específico (indica si fue por categoría incorrecta)"}
  ],
  "coherencia": {
    "colorConsistente": true/false,
    "disenoConsistente": true/false,
    "notas": "explicación"
  },
  "colorMatch": {"ok": true/false, "colorBuscado": "${productContext.colorExpanded}", "colorVisto": "..."},
  "categoryMatch": {
    "ok": true/false, 
    "categoriaBuscada": "${productContext.categoriaES}", 
    "categoriaVista": "lo que realmente se detectó en las imágenes",
    "esCoincidenciaExacta": true/false,
    "razonSiNoCoincide": "explicar por qué no coincide exactamente"
  },
  "modeloMatch": {"hayCoincidencia": true/false, "modelo": "${productContext.modelo}", "coincidencias": "..."},
  "ordenamientoCorrecto": true/false,
  "notes": "resumen"
}

MÁXIMO ${max} en "selected".
⚠️ PRIORIDAD ABSOLUTA: Verificar que objeto_detectado coincida EXACTAMENTE con "${productContext.categoriaES}".
La primera imagen DEBE cumplir con el criterio según tipo de producto.
ORDENAR las imágenes correctamente en el array "selected".
Si ninguna cumple con la categoría exacta, devolver "selected": []`;
}




// Parsear respuesta de GPT
function parseGPTEvaluationResponse(responseText, imageDescriptions) {
    try {
        // Limpiar posibles marcadores de código
        let jsonStr = responseText
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim();

        // Intentar extraer JSON
        const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            jsonStr = jsonMatch[0];
        }

        const parsed = JSON.parse(jsonStr);

        // Log del análisis
        if (parsed.colorMatch) {
            const colorOk = parsed.colorMatch.ok ? '✓' : '✗';
            addLog(`   🎨 Color: ${colorOk} Buscado: ${parsed.colorMatch.colorBuscado || '?'} | Visto: ${parsed.colorMatch.colorVisto || '?'}`, 'info');
        }
        if (parsed.categoryMatch) {
            const catOk = parsed.categoryMatch.ok ? '✓' : '✗';
            const esExacta = parsed.categoryMatch.esCoincidenciaExacta ? ' (exacta)' : ' (NO exacta)';
            const logType = parsed.categoryMatch.ok ? 'info' : 'warning';

            addLog(`   📦 Categoría: ${catOk} Buscada: ${parsed.categoryMatch.categoriaBuscada || '?'} | Vista: ${parsed.categoryMatch.categoriaVista || '?'}${esExacta}`, logType);

            if (!parsed.categoryMatch.ok && parsed.categoryMatch.razonSiNoCoincide) {
                addLog(`      ⚠️ Razón: ${parsed.categoryMatch.razonSiNoCoincide}`, 'warning');
            }
        }
        if (parsed.coherencia) {
            const colorCoh = parsed.coherencia.colorConsistente ? '✓' : '✗';
            const disenoCoh = parsed.coherencia.disenoConsistente ? '✓' : '✗';
            addLog(`   🔗 Coherencia: Color ${colorCoh} | Diseño ${disenoCoh}`, 'info');
            if (parsed.coherencia.notas) {
                addLog(`      └─ ${parsed.coherencia.notas}`, 'info');
            }
        }
        if (parsed.modeloMatch && parsed.modeloMatch.hayCoincidencia) {
            addLog(`   ⭐ Modelo "${parsed.modeloMatch.modelo}": ${parsed.modeloMatch.coincidencias || 'coincide'}`, 'success');
        }
        if (parsed.ordenamientoCorrecto !== undefined) {
            const ordenIcon = parsed.ordenamientoCorrecto ? '✓' : '✗';
            addLog(`   📐 Ordenamiento: ${ordenIcon}`, 'info');
        }
        if (parsed.notes) {
            addLog(`   📝 ${parsed.notes}`, 'info');
        }

        // Extraer URLs seleccionadas
        if (parsed.selected && Array.isArray(parsed.selected)) {
            const selectedUrls = [];

            addLog(`\n   ═══ IMÁGENES ACEPTADAS ═══`, 'success');

            for (const item of parsed.selected) {
                const idx = typeof item === 'number' ? item : item.index;
                // Buscar en las descripciones originales
                const imgData = imageDescriptions.find(d => d.index === idx);
                if (imgData && imgData.url) {
                    selectedUrls.push(imgData.url);
                    const modeloIcon = item.coincideModelo ? '⭐' : '';
                    const tipoImg = item.tipo_imagen || 'desconocido';
                    const d = imgData.description;

                    // Log de la imagen aceptada con su descripción
                    addLog(`   ✓ Img ${idx} [${tipoImg}] ${modeloIcon}`, 'success');
                    if (d) {
                        addLog(`      📌 Objeto: ${d.objeto_detectado || '-'} | Color: ${d.color_detectado || '-'}`, 'info');
                        if (d.descripcion_diseno) {
                            addLog(`      🎭 Diseño: ${d.descripcion_diseno}`, 'info');
                        }
                        addLog(`      📷 Tipo: ${d.tipo_foto || '-'}`, 'info');
                    }
                    if (item.reason) {
                        addLog(`      💬 Razón: ${item.reason}`, 'info');
                    }
                }
            }

            return selectedUrls.slice(0, CONFIG.IMAGES_PER_ITEM);
        }


        return [];
    } catch (error) {
        console.error('Error parsing GPT response:', error, responseText);
        return [];
    }
}



// =============================================
// GOOGLE SEARCH API
// =============================================

// Helper function to search images with specific size
async function searchImagesWithSize(searchQuery, numImages, imageSize = null) {
    // Validate numImages
    if (numImages <= 0) return [];

    // Build base URL
    let url = `https://www.googleapis.com/customsearch/v1?key=${CONFIG.GOOGLE_API_KEY}&cx=${CONFIG.GOOGLE_CSE_ID}&q=${encodeURIComponent(searchQuery)}&searchType=image&num=${Math.min(numImages, 10)}`;

    // Add size filter if specified
    if (imageSize) {
        url += `&imgSize=${imageSize}`;
    }

    // Add white background filter if enabled
    if (CONFIG.WHITE_BACKGROUND_ONLY) {
        url += '&imgDominantColor=white&imgType=photo';
    }

    console.log(`🔍 Searching: ${searchQuery} (size: ${imageSize || 'any'})`);

    try {
        const response = await fetch(url);

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`API Error ${response.status}:`, errorText);

            if (response.status === 403) {
                addLog('❌ API Key inválida o cuota excedida', 'error');
                throw new Error('API Key inválida o límite de cuota excedido');
            } else if (response.status === 400) {
                // Bad request, likely size filter issue
                console.warn('Search failed, will try fallback');
                return [];
            }
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            console.log(`No images found for: ${searchQuery}`);
            return [];
        }

        console.log(`✓ Found ${data.items.length} images`);
        return data.items.map(item => item.link);
    } catch (error) {
        console.error('Error searching images:', error);
        // Don't throw on size-specific searches, just return empty
        if (imageSize) return [];
        throw error;
    }
}

// Search images using Google Custom Search API
async function searchImages(searchQuery, numImages = CONFIG.IMAGES_TO_FETCH) {
    addLog(`🔍 Buscando imágenes para: ${searchQuery}`, 'info');

    // First try with "product image" suffix for better results
    let images = await searchImagesWithSize(`${searchQuery} product image`, numImages, null);

    // If not enough, try original query without suffix
    if (images.length < numImages) {
        const moreImages = await searchImagesWithSize(searchQuery, numImages - images.length, null);
        images = [...images, ...moreImages];
    }

    // Remove duplicates
    images = [...new Set(images)];

    if (images.length > 0) {
        addLog(`✓ ${images.length} imágenes encontradas`, 'success');
    } else {
        addLog(`⚠️ No se encontraron imágenes para esta búsqueda`, 'error');
    }

    return images.slice(0, numImages);
}

// =============================================
// ANÁLISIS DE ARCHIVO
// =============================================

// Download template
function downloadTemplate() {
    const templateData = [
        { 'Nombre': '', 'Sku': '', 'Color prov': '', 'Categoria': '' }
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(templateData);

    // Set column widths
    ws['!cols'] = [
        { wch: 40 }, // Nombre
        { wch: 15 }, // Sku
        { wch: 15 }, // Color prov
        { wch: 20 }  // Categoria
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'template_productos.xlsx');

    addLog('Template descargado exitosamente', 'success');
}

// Analyze file with AI
async function analyzeFile() {
    if (!appState.workbook) {
        alert('Por favor carga un archivo Excel primero');
        return;
    }

    // Get first sheet
    const firstSheetName = appState.workbook.SheetNames[0];
    const worksheet = appState.workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet);

    if (jsonData.length === 0) {
        alert('El archivo Excel está vacío');
        return;
    }

    // Validate required columns
    const requiredColumns = ['Nombre', 'Sku'];
    const firstRow = jsonData[0];
    const hasRequiredColumns = requiredColumns.every(col => col in firstRow);

    if (!hasRequiredColumns) {
        alert(`El archivo debe contener las columnas: ${requiredColumns.join(', ')}`);
        return;
    }

    addLog('Iniciando análisis con IA...');
    elements.analyzeBtn.disabled = true;
    elements.analyzeBtn.innerHTML = '<div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div> Analizando...';

    // === DETECCIÓN INTELIGENTE DE MARCA ===
    const allNames = jsonData.map(item => item['Nombre']).filter(n => n);
    let commonBrand = null;

    if (allNames.length > 0) {
        addLog('Detectando marca común en el archivo...');
        commonBrand = await detectCommonBrandWithAI(allNames);
        if (commonBrand) {
            addLog(`✓ Marca común detectada: ${commonBrand}`, 'success');
        } else {
            addLog('No se detectó una marca única, se analizará producto por producto.', 'info');
        }
    }

    // Process each item
    appState.analyzedData = [];
    const processedSkus = new Set();
    let duplicatesCount = 0;

    for (let i = 0; i < jsonData.length; i++) {
        const item = jsonData[i];
        const itemName = item['Nombre'];
        const originalSKU = item['Sku'];
        const colorProv = item['Color prov'] || item['Color'] || item['color'] || item['COLOR'] || '';
        // Buscar columna de Categoría directa
        const categoriaExcel = item['Categoria'] || item['Categoría'] || item['CATEGORIA'] || item['categoria'] || item['Category'] || '';

        // Remove size suffix from SKU
        const cleanedSKU = removeSizeFromSKU(originalSKU);

        // Skip if this SKU (without size) was already processed
        if (processedSkus.has(cleanedSKU)) {
            duplicatesCount++;
            continue;
        }

        // Add to processed set
        processedSkus.add(cleanedSKU);

        // Función auxiliar para escapar caracteres en Regex
        function escapeRegExp(string) {
            return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }

        try {
            let brand, model, categoria = '';

            if (commonBrand) {
                // ESTRATEGIA RÁPIDA: Usar marca común como pivote
                brand = commonBrand;
                const brandRegex = new RegExp(escapeRegExp(brand), 'i');
                const match = itemName.match(brandRegex);

                if (match) {
                    // Categoría: Preferir columna Excel, sino usar texto antes de marca
                    if (categoriaExcel) {
                        categoria = categoriaExcel;
                    } else {
                        categoria = itemName.substring(0, match.index).trim();
                    }

                    // Modelo: Todo lo que está DESPUÉS de la marca
                    model = itemName.substring(match.index + match[0].length).trim();

                    // Limpieza extra del modelo (quitar guiones iniciales)
                    model = model.replace(/^[-–—:\s]+/, '').trim();
                } else {
                    // Si no encuentra la marca en el nombre, asumir todo es modelo (fallback)
                    model = itemName;
                }

            } else {
                // ESTRATEGIA FALLBACK: Extracción con IA individual
                const result = await extractBrandAndModel(itemName);
                brand = result.brand;
                model = result.model;
                // Preferir columna Excel, sino intentar inferir categoría básica
                if (categoriaExcel) {
                    categoria = categoriaExcel;
                } else {
                    categoria = extractProductCategory(itemName);
                }
            }

            appState.analyzedData.push({
                nombreOriginal: itemName,
                sku: cleanedSKU,
                skuOriginal: originalSKU,
                categoria: categoria, // Nueva columna
                marca: brand,
                modelo: model,
                colorProv: colorProv,
                selected: true
            });

            addLog(`✓ Cat: ${categoria} | Marca: ${brand} | Modelo: ${model}`, 'success');
        } catch (error) {
            console.error(`Error analyzing ${itemName}:`, error);
            addLog(`✗ Error analizando "${itemName}"`, 'error');

            appState.analyzedData.push({
                nombreOriginal: itemName,
                sku: cleanedSKU,
                skuOriginal: originalSKU,
                categoria: '',
                marca: commonBrand || '',
                modelo: itemName,
                colorProv: colorProv,
                selected: true
            });
        }

        // Más rápido si usamos estrategia común, más lento si usamos IA individual
        if (!commonBrand && i % 5 === 0) await delay(50);
    }

    if (duplicatesCount > 0) {
        addLog(`ℹ️ Se eliminaron ${duplicatesCount} variantes duplicadas`, 'info');
    }

    // Show analysis section
    showAnalysisSection();
}

// Show analysis section with table
function showAnalysisSection() {
    elements.uploadSection.style.display = 'none';
    elements.analysisSection.style.display = 'block';

    // Populate table
    populateProductsTable();
    updateSelectionCount();
}

// Populate products table
function populateProductsTable() {
    elements.productsTableBody.innerHTML = '';

    appState.analyzedData.forEach((product, index) => {
        const row = document.createElement('tr');
        row.className = product.selected ? 'selected' : '';
        row.dataset.index = index;

        row.innerHTML = `
            <td class="checkbox-col">
                <input type="checkbox" ${product.selected ? 'checked' : ''} data-index="${index}">
            </td>
            <td>${product.categoria || '-'}</td>
            <td>${product.marca || '-'}</td>
            <td>${product.modelo}</td>
            <td>${product.colorProv || '-'}</td>
            <td>${product.sku}</td>
        `;

        // Add checkbox listener
        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
            handleRowCheckboxChange(e, index);
        });

        elements.productsTableBody.appendChild(row);
    });

    elements.totalProductsCount.textContent = appState.analyzedData.length;
}

// Handle row checkbox change
function handleRowCheckboxChange(e, index) {
    appState.analyzedData[index].selected = e.target.checked;

    // Update row style
    const row = e.target.closest('tr');
    if (e.target.checked) {
        row.classList.add('selected');
    } else {
        row.classList.remove('selected');
    }

    updateSelectionCount();
}

// Handle header checkbox change
function handleHeaderCheckboxChange(e) {
    const checked = e.target.checked;
    appState.analyzedData.forEach((product, index) => {
        product.selected = checked;
    });
    populateProductsTable();
    updateSelectionCount();
}

// Select all
function selectAll() {
    elements.headerCheckbox.checked = true;
    handleHeaderCheckboxChange({ target: elements.headerCheckbox });
}

// Deselect all
function deselectAll() {
    elements.headerCheckbox.checked = false;
    handleHeaderCheckboxChange({ target: elements.headerCheckbox });
}

// Update selection count
function updateSelectionCount() {
    const selectedCount = appState.analyzedData.filter(p => p.selected).length;
    elements.selectedCount.textContent = selectedCount;
    elements.enrichBtn.disabled = selectedCount === 0;

    // También habilitar/deshabilitar los nuevos botones
    const enrichFastBtn = document.getElementById('enrichFastBtn');
    const enrichTestBtn = document.getElementById('enrichTestBtn');
    if (enrichFastBtn) enrichFastBtn.disabled = selectedCount === 0;
    if (enrichTestBtn) enrichTestBtn.disabled = selectedCount === 0;
}

// Back to upload
function backToUpload() {
    elements.analysisSection.style.display = 'none';
    elements.uploadSection.style.display = 'block';
    appState.analyzedData = [];
}

// Build search query based on brand-specific criteria
function buildSearchQuery(product) {
    // Convert all fields to strings first (SKU might be read as number from Excel)
    const marca = String(product.marca || '').toLowerCase().trim();
    const modelo = String(product.modelo || '').trim();
    const sku = String(product.sku || '').trim();
    const color = String(product.colorProv || '').trim();

    // Extract product category from original name
    const category = extractProductCategory(product.nombreOriginal);

    // Add color to search if available
    const colorTerm = color ? ` ${color}` : '';

    // CALZADO: "SKU" COLOR_PROV(si hay)
    const footwearBrands = ['new balance', 'vans', 'adidas', 'nike', 'puma', 'reebok', 'converse'];
    if (footwearBrands.includes(marca)) {
        if (color) {
            return `"${sku}" ${color}`;
        } else {
            return `"${sku}"`;
        }
    }

    // GORROS: "SKU" MARCA
    if (category === 'cap' || category === 'hat') {
        return `"${sku}" ${String(product.marca)}`;
    }

    // KATIN (vestimenta): Katin modelo categoria color
    if (marca === 'katin') {
        const katinCategory = category ? ` ${category}` : '';
        const katinColor = color ? ` ${color}` : '';
        return `Katin ${modelo}${katinCategory}${katinColor}`;
    }

    // VESTIMENTA EN GENERAL: MODELO CATEGORIA MARCA COLOR_PROV(si hay) CODIGO
    const categoryTerm = category ? ` ${category}` : '';
    const marcaTerm = product.marca ? ` ${String(product.marca)}` : '';

    return `${modelo}${categoryTerm}${marcaTerm}${colorTerm} ${sku}`;
}

// =============================================
// ENRIQUECIMIENTO DE PRODUCTOS
// =============================================

// Helper function to update progress bar
function updateProgress(current, total) {
    const progress = (current / total) * 100;
    elements.progressFill.style.width = `${progress}%`;
    elements.progressText.textContent = `${Math.round(progress)}%`;
    elements.processedCount.textContent = current;
}

// =============================================
// ENRIQUECER RÁPIDO - Solo SKU, sin IA
// =============================================
async function enrichFast() {
    const selectedProducts = appState.analyzedData.filter(p => p.selected);
    if (selectedProducts.length === 0) {
        alert('Por favor selecciona al menos un producto');
        return;
    }

    if (!CONFIG.GOOGLE_API_KEY) {
        alert('Se necesita una API Key de Google');
        return;
    }

    // Setup UI
    elements.analysisSection.style.display = 'none';
    elements.processingSection.style.display = 'block';
    elements.totalCount.textContent = selectedProducts.length;
    appState.isProcessing = true;
    appState.isCancelled = false;
    appState.processedData = [];
    elements.resultsPreviewTableBody.innerHTML = '';
    if (elements.imagesPreviewContainer) elements.imagesPreviewContainer.style.display = 'block';

    addLog('⚡ MODO RÁPIDO: Búsqueda Marca+Modelo+Color, sin verificación IA', 'info');

    let processedCount = 0;

    for (const product of selectedProducts) {
        if (appState.isCancelled) break;

        const colorProv = product.colorProv || '';
        const colorExpanded = COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv;
        const searchQuery = `${product.marca} ${product.modelo} ${colorExpanded}`.trim();

        elements.currentItemName.textContent = `${product.marca} ${product.modelo}`;
        addLog(`\n🔎 Buscando: ${searchQuery}`, 'info');

        try {
            // Búsqueda por Marca + Modelo + Color
            const images = await searchImagesWithSize(searchQuery, 15, null);
            const filtered = await prefilterImageUrls(images);
            const finalImages = filtered.slice(0, CONFIG.IMAGES_PER_ITEM);

            addLog(`   ✅ ${finalImages.length} imágenes encontradas`, finalImages.length > 0 ? 'success' : 'warning');

            appState.processedData.push({
                'MARCA': product.marca,
                'MODELO': product.modelo,
                'SKU': product.sku,
                'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                'IMAGEN 1': finalImages[0] || '',
                'IMAGEN 2': finalImages[1] || '',
                'IMAGEN 3': finalImages[2] || '',
                'IMAGEN 4': finalImages[3] || '',
                'IMAGEN 5': finalImages[4] || '',
                'EXTRAS': filtered.slice(5) || []
            });

            addProductToPreviewTable(product, finalImages);
        } catch (error) {
            addLog(`   ✗ Error: ${error.message}`, 'error');
            appState.processedData.push({
                'MARCA': product.marca, 'MODELO': product.modelo, 'SKU': product.sku,
                'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                'IMAGEN 1': '', 'IMAGEN 2': '', 'IMAGEN 3': '', 'IMAGEN 4': '', 'IMAGEN 5': '',
                'EXTRAS': []
            });
            addProductToPreviewTable(product, []);
        }

        processedCount++;
        updateProgress(processedCount, selectedProducts.length);
        await delay(CONFIG.DELAY_BETWEEN_PRODUCTS);
    }

    showResults();
}

// =============================================
// MODO TESTING V2 - AJUSTES DEFINITIVOS
// =============================================

// GLOBAL LOCKS: URLs y assets ya usados (no reusar entre productos)
const globalUsedUrls = new Set();
const globalUsedAssets = new Set();

// =============================================
// UTILIDADES PARA DEDUPE POR ASSET
// =============================================

// Generar assetKey único para detectar misma imagen con URLs distintas
// INTELIGENTE: Ignora sufijos de resolución (_1024x1024, _large, etc)
function getAssetKey(url) {
    try {
        const parsed = new URL(url);
        let hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
        let path = parsed.pathname.toLowerCase();
        const cleanPath = path.replace(/[?#].*$/, '');

        const imageExtensions = /\.(jpg|jpeg|png|webp|gif)$/i;
        if (imageExtensions.test(cleanPath)) {
            let filename = cleanPath.split('/').pop();

            // Remover patrones de resolución comunes del filename
            // Ej: imagen_1024x1024.jpg -> imagen.jpg
            // Ej: imagen_800x.jpg -> imagen.jpg
            filename = filename.replace(/[-_]\d{3,5}x\d{3,5}/, '')  // _1024x1024
                .replace(/[-_]\d{3,4}w/, '')          // _1024w
                .replace(/[-_](large|medium|small|thumb|grande|zoom)/, ''); // _large

            return `${hostname}::${filename}`;
        }

        return `${hostname}::${cleanPath}`;
    } catch (e) {
        return url;
    }
}

// Obtener puntuación de resolución basada en la URL
function getResolutionScore(url) {
    let score = 0;
    const urlLower = url.toLowerCase();

    // Extraer dimensiones si existen (ej: 1024x1024)
    const dimMatch = urlLower.match(/(\d{3,5})x(\d{3,5})/);
    if (dimMatch) {
        const width = parseInt(dimMatch[1]);
        const height = parseInt(dimMatch[2]);
        score = width * height;
    }
    // Extraer width si existe (ej: 1024w)
    else if (urlLower.match(/(\d{3,4})w/)) {
        const wMatch = urlLower.match(/(\d{3,4})w/);
        score = parseInt(wMatch[1]) * 1000;
    }
    // Palabras clave de alta calidad
    else if (urlLower.includes('max') || urlLower.includes('zoom') || urlLower.includes('high')) {
        score = 2000000; // ~1400x1400
    }
    else if (urlLower.includes('large') || urlLower.includes('grande')) {
        score = 1000000; // ~1000x1000
    }
    else if (urlLower.includes('medium')) {
        score = 250000; // ~500x500
    }
    else if (urlLower.includes('small') || urlLower.includes('thumb')) {
        score = 10000; // ~100x100
    }
    else {
        score = 500000; // Base score (desconocido)
    }

    // Penalizar query params excesivos (a veces indican transformación dinámica)
    if (url.includes('?v=') || url.includes('?width=')) {
        // No penalizar, a veces es la única forma de obtener alta res
    }

    return score;
}

// Extraer hostname normalizado
function getHostname(url) {
    try {
        const parsed = new URL(url);
        return parsed.hostname.replace(/^www\./, '').toLowerCase();
    } catch (e) {
        return 'unknown';
    }
}

// Verificar si SKU aparece EXACTAMENTE en la URL (match literal COMPLETO)
// CRÍTICO: El SKU COMPLETO debe aparecer, no parcial
// ✔ acepta: ".../TE25054-VBK.jpg" para SKU "TE25054-VBK"
// ✔ acepta: ".../TE25054-VBK_front.jpg" para SKU "TE25054-VBK"
// ❌ rechaza: ".../TE25054-OASIS.jpg" para SKU "TE25054-VBK" (diferente sufijo)
// ❌ rechaza: ".../TE25054.jpg" para SKU "TE25054-VBK" (incompleto)
function hasExactSkuMatch(url, sku) {
    if (!sku || sku.length < 5) return false;

    // Normalizar ambos
    const urlLower = url.toLowerCase();
    const skuLower = sku.toLowerCase();

    // El SKU puede tener variantes de separadores (-, _, .)
    // Crear versiones alternativas del SKU
    const skuVariants = [
        skuLower,
        skuLower.replace(/-/g, '_'),
        skuLower.replace(/-/g, '.'),
        skuLower.replace(/-/g, ''),
        skuLower.replace(/_/g, '-'),
    ];

    for (const skuVariant of skuVariants) {
        const index = urlLower.indexOf(skuVariant);
        if (index === -1) continue;

        // Verificar que hay separador o nada ANTES
        const charBefore = index > 0 ? urlLower[index - 1] : '';
        const validBefore = index === 0 || /[^a-z0-9]/.test(charBefore);
        if (!validBefore) continue;

        // Verificar qué hay DESPUÉS del SKU
        const afterIndex = index + skuVariant.length;
        const charAfter = afterIndex < urlLower.length ? urlLower[afterIndex] : '';

        // Después del SKU solo puede haber:
        // - Nada (fin de string)
        // - Extensión de imagen (.jpg, .png, .webp)
        // - Separador seguido de palabras genéricas (front, back, detail, 01, 02, _1, _2)
        // - Query params (?)

        if (!charAfter) return true; // Fin de string

        // Si hay extensión de imagen directamente después
        const restOfUrl = urlLower.substring(afterIndex);
        if (/^\.(jpg|jpeg|png|webp|gif)/.test(restOfUrl)) return true;

        // Si hay separador, verificar que lo que sigue son sufijos genéricos
        if (/^[-_.]/.test(charAfter)) {
            // Obtener el siguiente "token" después del separador
            const nextTokenMatch = restOfUrl.match(/^[-_.]+([a-z0-9]+)/);
            if (nextTokenMatch) {
                const nextToken = nextTokenMatch[1];
                // Sufijos genéricos permitidos
                const genericSuffixes = /^(front|back|side|detail|main|thumb|large|small|hero|01|02|03|04|05|1|2|3|4|5|a|b|c|d|e|v1|v2|hd|lg|sm|md|xl|xxl)$/i;
                if (genericSuffixes.test(nextToken)) return true;

                // Si el siguiente token es una extensión de imagen
                if (/^(jpg|jpeg|png|webp|gif)$/.test(nextToken)) return true;
            }
        }

        // Si hay query params
        if (charAfter === '?') return true;
    }

    return false;
}

// =============================================
// HELPER: Generar variantes de color para matching en URLs
// Dado un colorProv (ej: "BLK", "Black", "VINTAGE BLACK"),
// devuelve todas las formas posibles en que podría aparecer en una URL
// =============================================
function getColorVariants(colorProv) {
    if (!colorProv || typeof colorProv !== 'string') return [];

    const raw = colorProv.trim();
    if (raw.length === 0) return [];

    const variants = new Set();

    // El color tal cual (lowercase)
    const lower = raw.toLowerCase();
    variants.add(lower);

    // Sin espacios (ej: "dark green" → "darkgreen")
    variants.add(lower.replace(/\s+/g, ''));

    // Con guion (ej: "dark green" → "dark-green")
    variants.add(lower.replace(/\s+/g, '-'));

    // Con underscore (ej: "dark green" → "dark_green")
    variants.add(lower.replace(/\s+/g, '_'));

    // Si es un código corto (ej "BLK"), buscar su expansión
    const upperRaw = raw.toUpperCase();
    if (typeof COLOR_CODES_MAPPING !== 'undefined' && COLOR_CODES_MAPPING[upperRaw]) {
        const expanded = COLOR_CODES_MAPPING[upperRaw].toLowerCase();
        variants.add(expanded);
        variants.add(expanded.replace(/\s+/g, ''));
        variants.add(expanded.replace(/\s+/g, '-'));
        variants.add(expanded.replace(/\s+/g, '_'));
    }

    // Buscar inversamente: si el color es la expansión, agregar el código corto
    if (typeof COLOR_CODES_MAPPING !== 'undefined') {
        for (const [code, expanded] of Object.entries(COLOR_CODES_MAPPING)) {
            if (expanded.toLowerCase() === lower || expanded.toLowerCase().replace(/\s+/g, '') === lower.replace(/\s+/g, '')) {
                variants.add(code.toLowerCase());
            }
        }
    }

    // Filtrar variantes demasiado cortas (menos de 2 chars) que darían falsos positivos
    return Array.from(variants).filter(v => v.length >= 2);
}

// Verificar si la URL contiene ALGUNA variante del color
function urlContainsColor(url, colorProv) {
    const colorVariants = getColorVariants(colorProv);
    if (colorVariants.length === 0) return false;

    const urlNorm = url.toLowerCase().replace(/[^a-z0-9]/g, '');

    for (const variant of colorVariants) {
        const variantNorm = variant.replace(/[^a-z0-9]/g, '');
        if (variantNorm.length >= 2 && urlNorm.includes(variantNorm)) {
            return true;
        }
    }
    return false;
}

// =============================================
// NIVEL 2: SKU PARCIAL + COLOR DE PROVEEDOR
// Si la URL contiene el prefijo del SKU (primeros 6+ chars)
// Y TAMBIÉN contiene el color del proveedor → ACEPTAR
// Ej: SKU "TE25054-VBK", colorProv "VBK"
//     URL ".../te25054-vintage-black.jpg" → ✅ (tiene "te25054" + "black")
//     URL ".../te25054-oasis.jpg" → ❌ (tiene SKU parcial pero NO el color)
// =============================================
function hasPartialSkuWithColor(url, sku, colorProv) {
    if (!sku || sku.length < 5 || !colorProv) return false;

    const urlLower = url.toLowerCase();

    // Extraer prefijo del SKU (parte antes del último separador, o primeros 6 chars)
    let skuPrefix = sku.toLowerCase();

    // Intentar obtener la parte base del SKU (antes del color suffix)
    const skuParts = skuPrefix.split(/[-_]/);
    if (skuParts.length >= 2) {
        // Usar todas las partes excepto la última (que suele ser el color)
        skuPrefix = skuParts.slice(0, -1).join('-');
    }

    // Si el prefijo es muy corto, usar los primeros 6 chars del SKU completo
    if (skuPrefix.length < 5) {
        skuPrefix = sku.substring(0, Math.min(sku.length, 8)).toLowerCase();
    }

    // Normalizar para buscar en URL (quitar caracteres especiales)
    const prefixNorm = skuPrefix.replace(/[^a-z0-9]/g, '');
    const urlNorm = urlLower.replace(/[^a-z0-9]/g, '');

    // ¿La URL contiene el prefijo del SKU?
    if (prefixNorm.length < 4 || !urlNorm.includes(prefixNorm)) {
        return false;
    }

    // ¿La URL también contiene el color del proveedor?
    return urlContainsColor(url, colorProv);
}

// =============================================
// NIVEL 3: MODELO + COLOR DE PROVEEDOR
// Si la URL contiene el nombre del modelo
// Y TAMBIÉN contiene el color del proveedor → ACEPTAR
// Ej: modelo "Stone Blanks", colorProv "BLK"
//     URL ".../volcom-stone-blanks-black.jpg" → ✅
//     URL ".../volcom-stone-blanks-red.jpg" → ❌ (modelo pero color incorrecto)
// =============================================
function hasModelWithColor(url, modelo, colorProv) {
    if (!modelo || modelo.length < 3 || !colorProv) return false;

    const urlNorm = url.toLowerCase().replace(/[^a-z0-9]/g, '');
    const modeloNorm = modelo.toLowerCase().replace(/[^a-z0-9]/g, '');

    // ¿La URL contiene el modelo?
    if (modeloNorm.length < 3 || !urlNorm.includes(modeloNorm)) {
        return false;
    }

    // ¿La URL también contiene el color del proveedor?
    return urlContainsColor(url, colorProv);
}

// =============================================
// FUNCIÓN PRINCIPAL MODO TESTING
// =============================================
async function enrichTestingMode() {
    const selectedProducts = appState.analyzedData.filter(p => p.selected);
    if (selectedProducts.length === 0) {
        alert('Por favor selecciona al menos un producto');
        return;
    }

    if (!CONFIG.GOOGLE_API_KEY || !CONFIG.OPENAI_API_KEY) {
        alert('Se necesitan API Keys de Google y OpenAI');
        return;
    }

    // Reset global locks al iniciar nuevo proceso
    globalUsedUrls.clear();
    globalUsedAssets.clear();

    // Setup UI
    elements.analysisSection.style.display = 'none';
    elements.processingSection.style.display = 'block';
    elements.totalCount.textContent = selectedProducts.length;
    appState.isProcessing = true;
    appState.isCancelled = false;
    appState.processedData = [];
    elements.resultsPreviewTableBody.innerHTML = '';
    if (elements.imagesPreviewContainer) elements.imagesPreviewContainer.style.display = 'block';

    addLog('🧪 MODO TESTING V2: Ajustes Definitivos', 'info');
    addLog('   ✓ SKU exact match (antes de OpenAI)', 'info');
    addLog('   ✓ Dedupe por asset (misma imagen = 1 vez)', 'info');
    addLog('   ✓ Priorización por mismo sitio', 'info');
    addLog('   ✓ Sin fallbacks. Sin duplicados.', 'info');

    let processedCount = 0;

    for (const product of selectedProducts) {
        if (appState.isCancelled) break;

        const colorProv = product.colorProv || '';
        const colorExpanded = COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv;
        const categoria = product.categoria || '';
        const marca = product.marca || '';
        const modelo = product.modelo || '';
        const sku = product.sku || '';

        elements.currentItemName.textContent = `${marca} ${modelo} (${colorExpanded})`;
        addLog(`\n${'═'.repeat(60)}`, 'info');
        addLog(`🔎 Procesando: ${marca} ${modelo}`, 'info');
        addLog(`   📋 SKU: ${sku} | Categoría: ${categoria} | Color: ${colorProv}`, 'info');

        try {
            // ══════════════════════════════════════════════════════════
            // PASO 1: Buscar imágenes candidatas
            // ══════════════════════════════════════════════════════════
            const candidateImages = await collectCandidateImages(product);

            if (candidateImages.length === 0) {
                addLog(`   ❌ No se encontraron URLs candidatas`, 'warning');
                saveEmptyResult(product, marca, modelo, sku);
                processedCount++;
                updateProgress(processedCount, selectedProducts.length);
                continue;
            }

            addLog(`   📥 ${candidateImages.length} URLs brutas encontradas`, 'info');

            // ══════════════════════════════════════════════════════════
            // PASO 2: Dedupe por assetKey + filtrar global locks
            // ══════════════════════════════════════════════════════════
            // Mapa para guardar la mejor URL de cada assetKey
            const bestAssetsMap = new Map();
            let skippedByGlobalLock = 0;
            let replacedByBetterRes = 0;

            for (const url of candidateImages) {
                const assetKey = getAssetKey(url);
                const score = getResolutionScore(url);

                // Check global lock (URL o asset ya usado)
                if (globalUsedUrls.has(url) || globalUsedAssets.has(assetKey)) {
                    skippedByGlobalLock++;
                    continue;
                }

                // Check dedupe interno (mismo asset en este producto)
                if (bestAssetsMap.has(assetKey)) {
                    const existing = bestAssetsMap.get(assetKey);
                    // Si la nueva URL tiene mejor score, la reemplazamos
                    if (score > existing.score) {
                        bestAssetsMap.set(assetKey, { url, assetKey, score });
                        replacedByBetterRes++;
                    }
                } else {
                    bestAssetsMap.set(assetKey, { url, assetKey, score });
                }
            }

            // Convertir mapa a array
            const deduped = Array.from(bestAssetsMap.values());
            const skippedByDedupe = candidateImages.length - deduped.length - skippedByGlobalLock;

            if (replacedByBetterRes > 0) {
                addLog(`   ✨ ${replacedByBetterRes} imágenes mejoradas por mayor resolución`, 'success');
            }

            if (skippedByGlobalLock > 0) {
                addLog(`   🔒 ${skippedByGlobalLock} URLs descartadas por GLOBAL LOCK`, 'info');
            }
            if (skippedByDedupe > 0) {
                addLog(`   🔄 ${skippedByDedupe} URLs descartadas por DEDUPE (mismo asset)`, 'info');
            }
            addLog(`   📊 ${deduped.length} URLs únicas después de dedupe`, 'info');

            if (deduped.length === 0) {
                addLog(`   ❌ No quedan URLs disponibles`, 'warning');
                saveEmptyResult(product, marca, modelo, sku);
                processedCount++;
                updateProgress(processedCount, selectedProducts.length);
                continue;
            }

            // ══════════════════════════════════════════════════════════
            // PASO 3: Detectar SKU OVERRIDE (match exacto en código)
            // ══════════════════════════════════════════════════════════
            const skuOverrideUrls = [];
            const urlsForPreFilter = [];

            for (const item of deduped) {
                if (hasExactSkuMatch(item.url, sku)) {
                    skuOverrideUrls.push({ ...item, matchType: 'SKU_OVERRIDE', score: 100 });
                } else {
                    urlsForPreFilter.push(item);
                }
            }

            if (skuOverrideUrls.length > 0) {
                addLog(`   🎯 ${skuOverrideUrls.length} URLs con SKU EXACTO detectadas (prioridad máxima)`, 'success');
            }

            // ══════════════════════════════════════════════════════════
            // PASO 3.5: PRE-FILTRO de relevancia (antes de OpenAI)
            // La URL debe contener AL MENOS marca O modelo para ser considerada
            // ══════════════════════════════════════════════════════════
            const marcaNorm = marca.toLowerCase().replace(/[^a-z0-9]/g, '');
            const modeloNorm = modelo.toLowerCase().replace(/[^a-z0-9]/g, '');
            const colorNorm = colorProv.toLowerCase().replace(/[^a-z0-9]/g, '');

            const urlsForOpenAI = urlsForPreFilter.filter(item => {
                const urlNorm = item.url.toLowerCase().replace(/[^a-z0-9]/g, '');

                // La URL debe contener AL MENOS uno de: marca, modelo, o SKU parcial
                const hasMarca = marcaNorm.length > 2 && urlNorm.includes(marcaNorm);
                const hasModelo = modeloNorm.length > 2 && urlNorm.includes(modeloNorm);
                const hasSkuPart = sku.length > 4 && urlNorm.includes(sku.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, ''));

                return hasMarca || hasModelo || hasSkuPart;
            });

            const preFilteredOut = urlsForPreFilter.length - urlsForOpenAI.length;
            if (preFilteredOut > 0) {
                addLog(`   🚫 ${preFilteredOut} URLs descartadas (no contienen marca ni modelo)`, 'info');
            }

            // ══════════════════════════════════════════════════════════
            // PASO 4: OpenAI evalúa URLs restantes (STRICT)
            // ══════════════════════════════════════════════════════════
            let strictUrls = [];

            if (urlsForOpenAI.length > 0) {
                addLog(`   🤖 Enviando ${urlsForOpenAI.length} URLs a OpenAI para validación...`, 'info');

                const productContext = { marca, modelo, colorProv, categoria, sku };
                const aiResult = await filterUrlsByTextWithOpenAI(productContext, urlsForOpenAI.map(i => i.url));

                // Combinar main y extras
                strictUrls = [...(aiResult.main || []), ...(aiResult.extras || [])];
            }

            // ══════════════════════════════════════════════════════════
            // PASO 5: Combinar resultados + priorizar por hostname
            // ══════════════════════════════════════════════════════════

            // Convertir strictUrls a formato con metadata
            const strictWithMeta = strictUrls.map(url => ({
                url: url,
                assetKey: getAssetKey(url),
                matchType: 'STRICT',
                score: 70
            }));

            // Combinar: SKU_OVERRIDE primero, luego STRICT
            let allAccepted = [...skuOverrideUrls, ...strictWithMeta];

            // ══════════════════════════════════════════════════════════
            // PASO 5.5: SITE HINT SEARCH (Si hay exactamente 1 resultado)
            // ══════════════════════════════════════════════════════════
            if (allAccepted.length === 1) {
                const seedUrl = allAccepted[0].url;
                const seedHost = getHostname(seedUrl);
                // Extraer nombre del sitio base (sin TLD si es posible, o usar host completo)
                const seedHostName = seedHost.split('.')[0];

                addLog(`   💡 [SITE_HINT_SEARCH] Encontrada solo 1 imagen válida en ${seedHost}`, 'info');

                const duplicateQuery = `${seedHostName} ${marca} ${categoria} ${colorExpanded}`.trim();
                addLog(`   🔍 [SITE_HINT_SEARCH] Buscando más en el sitio: "${duplicateQuery}"`, 'info');

                try {
                    // 1. Búsqueda extra
                    const extraImages = await searchImagesWithSize(duplicateQuery, 20, null);

                    if (extraImages.length > 0) {
                        // 2. Pipeline de validación (repetido para nuevos resultados)

                        // Dedupe
                        const extraDeduped = [];
                        for (const url of extraImages) {
                            const assetKey = getAssetKey(url);
                            // Verificar contra globales Y contra lo que ya tenemos aceptado
                            if (globalUsedUrls.has(url) || globalUsedAssets.has(assetKey)) continue;
                            if (allAccepted.some(a => a.assetKey === assetKey)) continue;

                            extraDeduped.push({ url, assetKey });
                        }

                        if (extraDeduped.length > 0) {
                            // SKU Match
                            const extraSkuOverride = [];
                            const extraForOpenAI = [];

                            for (const item of extraDeduped) {
                                if (hasExactSkuMatch(item.url, sku)) {
                                    extraSkuOverride.push({ ...item, matchType: 'SKU_OVERRIDE', score: 100 });
                                } else {
                                    extraForOpenAI.push(item);
                                }
                            }

                            // Pre-filtro
                            const extraForAI_Filtered = extraForOpenAI.filter(item => {
                                const urlNorm = item.url.toLowerCase().replace(/[^a-z0-9]/g, '');
                                const hasMarca = marcaNorm.length > 2 && urlNorm.includes(marcaNorm);
                                const hasModelo = modeloNorm.length > 2 && urlNorm.includes(modeloNorm);
                                const hasSkuPart = sku.length > 4 && urlNorm.includes(sku.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, ''));
                                return hasMarca || hasModelo || hasSkuPart;
                            });

                            // OpenAI
                            let extraStrict = [];
                            if (extraForAI_Filtered.length > 0) {
                                addLog(`   🤖 [SITE_HINT_SEARCH] Enviando ${extraForAI_Filtered.length} URLs extra a OpenAI...`, 'info');
                                const productContext = { marca, modelo, colorProv, categoria, sku };
                                const aiResult = await filterUrlsByTextWithOpenAI(productContext, extraForAI_Filtered.map(i => i.url));

                                // Combinar main y extras
                                const allUrls = [...(aiResult.main || []), ...(aiResult.extras || [])];
                                extraStrict = allUrls.map(url => ({
                                    url: url,
                                    assetKey: getAssetKey(url),
                                    matchType: 'STRICT',
                                    score: 70
                                }));
                            }

                            // Merge
                            const newAccepted = [...extraSkuOverride, ...extraStrict];
                            if (newAccepted.length > 0) {
                                addLog(`   ✨ [SITE_HINT_SEARCH] Encontradas +${newAccepted.length} imágenes adicionales válidas`, 'success');
                                allAccepted = [...allAccepted, ...newAccepted];
                            } else {
                                addLog(`   ⚠️ [SITE_HINT_SEARCH] No se encontraron imágenes válidas adicionales`, 'warning');
                            }
                        }
                    }
                } catch (err) {
                    addLog(`   ❌ [SITE_HINT_SEARCH] Error: ${err.message}`, 'error');
                }
            }

            if (allAccepted.length === 0) {
                addLog(`   ❌ Ninguna URL cumple los criterios`, 'warning');
                saveEmptyResult(product, marca, modelo, sku);
                processedCount++;
                updateProgress(processedCount, selectedProducts.length);
                continue;
            }

            // ══════════════════════════════════════════════════════════
            // PASO 6: Priorizar por MISMO SITIO (hostname con mejor score)
            // ══════════════════════════════════════════════════════════

            // Agrupar por hostname y calcular score promedio
            const byHostname = {};
            for (const item of allAccepted) {
                const host = getHostname(item.url);
                if (!byHostname[host]) {
                    byHostname[host] = { urls: [], totalScore: 0 };
                }
                byHostname[host].urls.push(item);
                byHostname[host].totalScore += item.score;
            }

            // Calcular score promedio por hostname
            const hostScores = Object.entries(byHostname).map(([host, data]) => ({
                host,
                avgScore: data.totalScore / data.urls.length,
                count: data.urls.length,
                urls: data.urls.sort((a, b) => b.score - a.score)
            })).sort((a, b) => {
                // SKU_OVERRIDE tiene prioridad absoluta
                const aHasSku = a.urls.some(u => u.matchType === 'SKU_OVERRIDE');
                const bHasSku = b.urls.some(u => u.matchType === 'SKU_OVERRIDE');
                if (aHasSku && !bHasSku) return -1;
                if (bHasSku && !aHasSku) return 1;
                // Luego por score promedio
                return b.avgScore - a.avgScore;
            });

            addLog(`   📊 ${hostScores.length} hostnames con imágenes aceptadas:`, 'info');
            hostScores.slice(0, 3).forEach(h => {
                addLog(`      • ${h.host}: ${h.count} imgs (avg score: ${h.avgScore.toFixed(0)})`, 'info');
            });

            // Seleccionar priorizando hostnames con mejor score
            const finalSelection = [];
            const usedAssetsLocal = new Set();

            for (const hostData of hostScores) {
                if (finalSelection.length >= 5) break;

                for (const item of hostData.urls) {
                    if (finalSelection.length >= 5) break;
                    if (usedAssetsLocal.has(item.assetKey)) continue;

                    finalSelection.push(item);
                    usedAssetsLocal.add(item.assetKey);
                }
            }

            // ══════════════════════════════════════════════════════════
            // PASO 7: Validar que las imágenes cargan
            // ══════════════════════════════════════════════════════════
            const urlsToValidate = finalSelection.map(i => i.url);
            const validImages = await prefilterImageUrls(urlsToValidate);

            addLog(`   ✓ ${validImages.length}/${urlsToValidate.length} imágenes cargan correctamente`, 'info');

            // ══════════════════════════════════════════════════════════
            // PASO 8: Registrar en GLOBAL LOCKS y guardar resultado
            // ══════════════════════════════════════════════════════════
            const selectedImages = validImages.slice(0, 5);

            for (const url of selectedImages) {
                globalUsedUrls.add(url);
                globalUsedAssets.add(getAssetKey(url));
            }

            // Log final detallado
            addLog(`   ✅ ${selectedImages.length} imágenes seleccionadas:`, 'success');
            selectedImages.forEach((url, i) => {
                const item = finalSelection.find(f => f.url === url);
                const typeIcon = item?.matchType === 'SKU_OVERRIDE' ? '🎯' : '✓';
                addLog(`      ${i + 1}. ${typeIcon} ${getHostname(url)} (${item?.matchType || 'VALID'})`, 'success');
            });

            appState.processedData.push({
                'MARCA': marca,
                'MODELO': modelo,
                'SKU': sku,
                'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                'IMAGEN 1': selectedImages[0] || '',
                'IMAGEN 2': selectedImages[1] || '',
                'IMAGEN 3': selectedImages[2] || '',
                'IMAGEN 4': selectedImages[3] || '',
                'IMAGEN 5': selectedImages[4] || ''
            });

            addProductToPreviewTable(product, selectedImages);
        } catch (error) {
            addLog(`   ✗ Error: ${error.message}`, 'error');
            saveEmptyResult(product, marca, modelo, sku);
        }

        processedCount++;
        updateProgress(processedCount, selectedProducts.length);
        await delay(300);
    }

    showResults();
}

// Helper para guardar resultado vacío
function saveEmptyResult(product, marca, modelo, sku) {
    appState.processedData.push({
        'MARCA': marca, 'MODELO': modelo, 'SKU': sku,
        'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
        'IMAGEN 1': '', 'IMAGEN 2': '', 'IMAGEN 3': '', 'IMAGEN 4': '', 'IMAGEN 5': '',
        'EXTRAS': []
    });
    addProductToPreviewTable(product, []);
}

// =============================================
// FILTRADO DE URLs CON OPENAI (TEXTO ONLY, NO VISUAL)
// =============================================
async function filterUrlsByTextWithOpenAI(productContext, urls) {
    if (!CONFIG.OPENAI_API_KEY || urls.length === 0) {
        return { main: [], extras: [] };
    }

    const { marca, modelo, colorProv, categoria, sku } = productContext;

    // Construir el prompt LENIENT - ser permisivo
    const prompt = `Eres un VALIDADOR de URLs MUY PERMISIVO. Tu objetivo es ACEPTAR la mayor cantidad posible.

═══════════════════════════════════════════════════════════════
PRODUCTO BUSCADO:
═══════════════════════════════════════════════════════════════
- MARCA: "${marca}"
- MODELO: "${modelo}"
- COLOR: "${colorProv}"
- SKU: "${sku}"

═══════════════════════════════════════════════════════════════
SISTEMA DE SCORES (SÉ GENEROSO):
═══════════════════════════════════════════════════════════════

SCORE 2 (ACEPTAR DIRECTO):
• La URL contiene MARCA + MODELO + COLOR (o equivalente/similar)
• La URL contiene el SKU "${sku}"
• En caso de DUDA sobre el color → dar score 2

SCORE 1 (CANDIDATO - mostrar al usuario):
• La URL contiene MARCA + MODELO pero sin color claro
• La URL tiene la marca y parece del producto
• Cualquier URL que PODRÍA ser del producto

SCORE 0 (RECHAZAR - solo casos obvios):
• La URL claramente NO tiene la marca "${marca}"
• La URL tiene un producto COMPLETAMENTE diferente

⚠️ SÉ MUY PERMISIVO:
• Si tiene la MARCA → mínimo score 1
• Si tiene MARCA + MODELO → score 2 aunque no veas color
• En caso de DUDA → score 1 o 2, NUNCA score 0
• Es mejor mostrar imágenes de más que perder imágenes correctas

COLORES EQUIVALENTES (ser generoso):
NEGRO: black, negro, blk, dark, asphalt, charcoal, onyx, midnight, ink, carbon
BLANCO: white, blanco, wht, cream, ivory, snow, bone, pearl
AZUL: blue, azul, navy, marine, ocean, cobalt, indigo, denim, sky, teal
VERDE: green, verde, olive, forest, sage, mint, emerald, moss, lime, army
LILA: purple, lila, violet, grape, lavender, plum, mauve, orchid, berry
GRIS: grey, gray, gris, heather, silver, slate, ash, stone
MARRÓN: brown, marron, chocolate, coffee, mocha, chestnut, espresso

═══════════════════════════════════════════════════════════════
URLs A EVALUAR:
═══════════════════════════════════════════════════════════════
${urls.map((url, i) => `[${i}] ${url}`).join('\n')}

═══════════════════════════════════════════════════════════════
RESPUESTA (JSON):
{
  "results": [
    { "index": 0, "score": 2, "reason": "marca+modelo+color" },
    { "index": 1, "score": 1, "reason": "marca+modelo" }
  ]
}`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [{
                    role: 'user',
                    content: prompt
                }],
                max_tokens: 2000,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn('OpenAI API error:', response.status, errorText);
            addLog(`   ⚠️ Error en API OpenAI: ${response.status}`, 'warning');
            return { main: [], extras: [] };
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Parsear JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            addLog(`   ⚠️ OpenAI no devolvió JSON válido`, 'warning');
            return { main: [], extras: [] };
        }

        try {
            const result = JSON.parse(jsonMatch[0]);
            const allResults = result.results || [];

            // Separar por score
            const score2 = allResults.filter(r => r.score === 2);
            const score1 = allResults.filter(r => r.score === 1);
            const score0 = allResults.filter(r => r.score === 0);

            addLog(`   📊 Scores: ${score2.length} principales, ${score1.length} extras, ${score0.length} rechazados`, 'info');

            // Convertir a URLs
            const mainUrls = score2.map(item => urls[item.index]).filter(url => url);
            const extraUrls = score1.map(item => urls[item.index]).filter(url => url);

            // Log
            addLog(`   ✅ ${mainUrls.length} imágenes principales + ${extraUrls.length} extras`, 'success');

            // Devolver objeto con main (score 2) y extras (score 1)
            return {
                main: mainUrls,
                extras: extraUrls
            };

        } catch (e) {
            console.error('Error parsing OpenAI response:', e);
            addLog(`   ⚠️ Error parseando respuesta de OpenAI`, 'warning');
            return { main: [], extras: [] };
        }

    } catch (error) {
        console.error('Error en filterUrlsByTextWithOpenAI:', error);
        addLog(`   ⚠️ Error: ${error.message}`, 'warning');
        return { main: [], extras: [] };
    }
}

// =============================================
// SELECCIÓN DE IMÁGENES CON IA - Una sola llamada, MUY ESTRICTA
// =============================================
async function selectBestImagesWithAI(imageUrls, marca, modelo, color, categoria, sleeveType) {
    if (!CONFIG.OPENAI_API_KEY || imageUrls.length === 0) {
        return [];
    }

    // Construir el prompt MUY ESTRICTO
    const prompt = `Eres un EXPERTO en selección de imágenes para e-commerce. Tu trabajo es ser EXTREMADAMENTE ESTRICTO.

═══════════════════════════════════════════════════════════════
PRODUCTO BUSCADO:
═══════════════════════════════════════════════════════════════
- Categoría: ${categoria || 'prenda'}${sleeveType ? ` (${sleeveType})` : ''}
- Marca: ${marca}
- Modelo: ${modelo}  
- COLOR DEL PROVEEDOR: "${color}" ← ESTO ES CRÍTICO

═══════════════════════════════════════════════════════════════
INSTRUCCIONES ESTRICTAS - LEE CON ATENCIÓN:
═══════════════════════════════════════════════════════════════

Tienes ${imageUrls.length} imágenes. Debes seleccionar MÁXIMO 5 que cumplan TODOS estos criterios:

▶ CRITERIO 1 - CATEGORÍA VISIBLE:
   • La imagen debe mostrar CLARAMENTE un/una "${categoria}"${sleeveType ? ` de ${sleeveType}` : ''}
   • El artículo debe ser el PROTAGONISTA de la imagen (no de fondo, no pequeño)
   • Debe verse el producto COMPLETO o casi completo
   • RECHAZA: banners, collages, vectores, capturas de pantalla

▶ CRITERIO 2 - COLOR EXACTO (CRÍTICO):
   • El color del producto en la imagen DEBE SER "${color}"
   • NO aceptes colores "parecidos" o "similares" - debe ser EL MISMO color
   • Si buscamos "GREEN" → solo verde. RECHAZA rosa, azul, rojo, etc.
   • Si buscamos "BLACK" → solo negro. RECHAZA gris, azul oscuro, etc.
   • Si buscamos "WHITE" → solo blanco. RECHAZA beige, crema, gris claro, etc.
   • EN CASO DE DUDA SOBRE EL COLOR → RECHAZA LA IMAGEN

▶ CRITERIO 3 - CONSISTENCIA ENTRE IMÁGENES:
   • COMPARA las imágenes entre sí
   • Todas las seleccionadas DEBEN mostrar el MISMO producto exacto
   • Mismo diseño, mismo estampado, mismo color
   • Si una imagen muestra un producto diferente (otro color, otro diseño) → NO la incluyas
   • Es MEJOR devolver 2-3 imágenes consistentes que 5 inconsistentes

▶ CRITERIO 4 - VARIEDAD DE ÁNGULOS (solo si hay consistencia):
   • Si hay varias imágenes del MISMO producto, elige diferentes vistas
   • Prioridad: 1) Frente, 2) Espalda, 3) Lateral, 4) Detalle

═══════════════════════════════════════════════════════════════
EJEMPLOS DE RECHAZO:
═══════════════════════════════════════════════════════════════
- Buscamos "remera verde" → RECHAZA remera rosa, azul, negra, blanca
- Buscamos "gorra negra" → RECHAZA gorra gris, azul marino, marrón
- El producto no se ve claramente → RECHAZA
- Es un collage con varios productos → RECHAZA
- El color es ambiguo o dudoso → RECHAZA

═══════════════════════════════════════════════════════════════
RESPUESTA:
═══════════════════════════════════════════════════════════════
RESPONDE SOLO CON JSON VÁLIDO:
{
  "selected": [índices de imágenes aceptadas, empezando desde 0],
  "detected_color": "el color que realmente ves en las imágenes seleccionadas",
  "reasoning": "explicación de por qué esas imágenes cumplen los criterios"
}

Si NINGUNA imagen coincide con el color "${color}", responde:
{"selected": [], "detected_color": "ninguno coincide", "reasoning": "Ninguna imagen muestra un producto color ${color}"}

RECUERDA: Es mejor NO seleccionar nada que seleccionar imágenes del color incorrecto.`;

    try {
        // Construir el content con todas las imágenes
        const content = [{ type: 'text', text: prompt }];

        for (let i = 0; i < imageUrls.length; i++) {
            content.push({
                type: 'image_url',
                image_url: { url: imageUrls[i], detail: 'low' }
            });
        }

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [{ role: 'user', content: content }],
                max_tokens: 300,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn('OpenAI API error:', response.status, errorText);
            addLog(`   ⚠️ Error en API OpenAI: ${response.status}`, 'warning');
            return [];
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Parsear JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const result = JSON.parse(jsonMatch[0]);

                if (result.detected_color) {
                    addLog(`   🎨 Color detectado: ${result.detected_color}`, 'info');
                }
                if (result.reasoning) {
                    addLog(`   💡 IA: ${result.reasoning}`, 'info');
                }

                if (Array.isArray(result.selected) && result.selected.length > 0) {
                    // Mapear índices a URLs
                    const selectedUrls = result.selected
                        .filter(idx => idx >= 0 && idx < imageUrls.length)
                        .slice(0, 5) // Máximo 5
                        .map(idx => imageUrls[idx]);

                    return selectedUrls;
                }

                return [];
            } catch (e) {
                console.error('Error parsing AI response:', e);
                return [];
            }
        }

        return [];
    } catch (error) {
        console.error('Error en selectBestImagesWithAI:', error);
        addLog(`   ⚠️ Error: ${error.message}`, 'warning');
        return [];
    }
}

// Verificación ESTRICTA con OpenAI - SI/NO
async function verifyImageWithGeminiSimple(imageUrl, marca, modelo, color, categoria, sleeveType) {
    if (!CONFIG.OPENAI_API_KEY) {
        addLog('   ⚠️ No hay API Key de OpenAI configurada', 'warning');
        return false;
    }

    // Construir descripción del producto esperado
    let productoEsperado = categoria || 'prenda';
    if (sleeveType) productoEsperado += ` de ${sleeveType}`;
    productoEsperado += ` color ${color || 'no especificado'}`;

    const prompt = `Analiza esta imagen con CRITERIOS MUY ESTRICTOS.

PRODUCTO ESPERADO:
- Categoría: ${categoria || 'prenda'}${sleeveType ? ` (${sleeveType})` : ''}
- Marca: ${marca}
- Modelo: ${modelo}
- Color: ${color || 'no especificado'}

CRITERIOS DE ACEPTACIÓN (TODOS deben cumplirse):

1. CATEGORÍA CORRECTA: ¿Es exactamente un/a ${categoria || 'prenda'}?
   ${sleeveType ? `- Si es ropa con mangas, ¿es específicamente ${sleeveType}?` : ''}
   - Si la categoría no coincide, RECHAZAR.

2. COLOR CORRECTO: ¿El color del producto es "${color}"?
   - El color debe coincidir claramente.
   - Si el color es muy diferente, RECHAZAR.

3. VISIBILIDAD CLARA: ¿El producto se ve MUY CLARAMENTE?
   - El artículo debe ser el protagonista de la imagen.
   - Debe verse completo o casi completo.
   - Si está cortado, borroso o es secundario, RECHAZAR.

4. IMAGEN VÁLIDA: ¿Es una foto real del producto?
   - RECHAZAR si es: banner, collage, vector, dibujo, captura de pantalla.
   - RECHAZAR si tiene texto de precio, ofertas, o marcas de agua grandes.

RESPONDE SOLO CON JSON:
{"aceptar": true/false, "razon": "explicación breve"}

SÉ ESTRICTO. EN CASO DE DUDA, RECHAZA.`;

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [{
                    role: 'user',
                    content: [
                        { type: 'text', text: prompt },
                        { type: 'image_url', image_url: { url: imageUrl } }
                    ]
                }],
                max_tokens: 100,
                temperature: 0.1
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn('OpenAI API error:', response.status, errorText);
            // Si falla la API, RECHAZAR por defecto (modo estricto)
            return false;
        }

        const data = await response.json();
        const text = data.choices?.[0]?.message?.content || '';

        // Intentar parsear JSON
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            try {
                const result = JSON.parse(jsonMatch[0]);
                if (result.razon) {
                    addLog(`      → ${result.aceptar ? '✓' : '✗'} ${result.razon}`, result.aceptar ? 'success' : 'info');
                }
                return result.aceptar === true;
            } catch (e) {
                // Si no puede parsear, rechazar
                return false;
            }
        }

        // Si no hay JSON válido, rechazar por defecto
        return false;
    } catch (error) {
        console.error('Error verificando imagen:', error);
        // En caso de error, RECHAZAR (modo estricto)
        return false;
    }
}

// Verificación simple con IA - pregunta directa
async function verifyImagesSimple(imageUrls, product) {
    const verifiedUrls = [];
    const colorProv = product.colorProv || '';
    const colorExpanded = COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv;
    const categoria = product.categoria || extractProductCategory(product.nombreOriginal) || 'prenda';

    const question = `¿Esta imagen muestra claramente un/a ${categoria} de la marca ${product.marca}, modelo ${product.modelo}, en color ${colorExpanded || 'cualquiera'}?`;

    for (const imageUrl of imageUrls) {
        if (verifiedUrls.length >= CONFIG.IMAGES_PER_ITEM) break;

        try {
            const isMatch = await askGeminiSimple(imageUrl, question, categoria, colorExpanded);
            if (isMatch) {
                verifiedUrls.push(imageUrl);
                addLog(`      ✓ Imagen verificada`, 'success');
            } else {
                addLog(`      ✗ No coincide`, 'info');
            }
        } catch (error) {
            addLog(`      ⚠️ Error verificando: ${error.message}`, 'warning');
        }

        await delay(200);
    }

    return verifiedUrls;
}

// Pregunta simple a Gemini (usa URL directamente)
async function askGeminiSimple(imageUrl, question, expectedCategory, expectedColor) {
    const prompt = `Analiza esta imagen y responde SOLO con JSON.

PREGUNTA: ${question}

CRITERIOS PARA RESPONDER "si":
1. La categoría del producto (${expectedCategory}) debe ser claramente visible
2. El color debe ser ${expectedColor || 'cualquiera'} (si se especifica)
3. Debe ser una foto real del producto (no banner, no collage, no vector)

SÉ FLEXIBLE: Si parece ser el tipo de producto correcto y el color es aproximado, responde "si".

RESPONDE SOLO CON:
{"coincide": "si" | "no", "razon": "breve explicación"}`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${CONFIG.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            file_data: {
                                file_uri: imageUrl,
                                mime_type: 'image/jpeg'
                            }
                        }
                    ]
                }],
                generationConfig: { temperature: 0.1, maxOutputTokens: 100 }
            })
        });

        if (!response.ok) {
            // Si file_data falla, intentar sin imagen (solo aceptar)
            console.warn('Gemini file_data failed, accepting image');
            return true;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return result.coincide === 'si';
        }
        // Si no puede parsear, aceptar por defecto en modo testing
        return true;
    } catch (error) {
        console.warn('askGeminiSimple error:', error);
        // En modo testing, si hay error aceptamos la imagen
        return true;
    }
}

// Enrich selected products (MODO COMPLETO)
async function enrichSelectedProducts() {
    const selectedProducts = appState.analyzedData.filter(p => p.selected);

    if (selectedProducts.length === 0) {
        alert('Por favor selecciona al menos un producto');
        return;
    }

    // Check for Google API Key
    if (!CONFIG.GOOGLE_API_KEY) {
        alert('⚠️ IMPORTANTE: Necesitas configurar tu Google Custom Search API Key\n\n' +
            '1. Ve a: https://console.cloud.google.com/\n' +
            '2. Habilita "Custom Search API"\n' +
            '3. Crea credenciales (API Key)\n' +
            '4. Agrega la API Key en el archivo app.js, línea 7\n\n' +
            'O puedes ingresarla ahora (pero se perderá al recargar la página)');

        const apiKey = prompt('Ingresa tu Google Custom Search API Key:');
        if (!apiKey) {
            alert('❌ Se necesita una API Key de Google para buscar imágenes.');
            return;
        }
        CONFIG.GOOGLE_API_KEY = apiKey;
    }

    // Show processing section
    elements.analysisSection.style.display = 'none';
    elements.processingSection.style.display = 'block';
    elements.totalCount.textContent = selectedProducts.length;
    appState.isProcessing = true;

    // Show images preview container, hide stock preview container
    if (elements.imagesPreviewContainer) elements.imagesPreviewContainer.style.display = 'block';
    if (elements.stockPreviewContainer) elements.stockPreviewContainer.style.display = 'none';

    // Clear previous results from preview table
    elements.resultsPreviewTableBody.innerHTML = '';

    // Reset control flags
    // Reset control flags
    appState.isCancelled = false;
    appState.isPaused = false;
    appState.skipToResults = false;

    // Reset buttons
    if (elements.pauseProcessBtn) {
        elements.pauseProcessBtn.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
            </svg>
            Pausar
        `;
        elements.pauseProcessBtn.classList.remove('paused');
    }

    // Process each selected item
    appState.processedData = [];

    // =============================================
    // NUEVO: Agrupar productos por MODELO
    // =============================================
    const productsByModel = new Map();
    for (const product of selectedProducts) {
        const modelKey = `${product.marca}|${product.modelo}`.toLowerCase();
        if (!productsByModel.has(modelKey)) {
            productsByModel.set(modelKey, []);
        }
        productsByModel.get(modelKey).push(product);
    }

    addLog(`📦 ${selectedProducts.length} productos agrupados en ${productsByModel.size} modelos únicos`, 'info');

    let processedCount = 0;

    for (const [modelKey, modelGroup] of productsByModel) {
        // Check for cancel
        if (appState.isCancelled) {
            addLog('⏹️ Procesamiento cancelado por el usuario', 'error');
            elements.processingSection.style.display = 'none';
            elements.analysisSection.style.display = 'block';
            return;
        }

        // Check for PAUSE
        while (appState.isPaused) {
            if (appState.isCancelled) break;
            await new Promise(r => setTimeout(r, 500));
        }

        if (appState.skipToResults) {
            addLog(`⏭️ Saltando a resultados con ${appState.processedData.length} productos procesados`, 'info');
            break;
        }

        const firstProduct = modelGroup[0];
        const colorsInGroup = modelGroup.map(p => {
            const colorProv = p.colorProv || '';
            return (COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv).toLowerCase();
        });

        addLog(`\n🔷 MODELO: ${firstProduct.marca} ${firstProduct.modelo} (${modelGroup.length} variantes de color)`, 'info');
        addLog(`   🎨 Colores: ${colorsInGroup.join(', ') || 'sin especificar'}`, 'info');

        try {
            const startTime = Date.now();

            // =============================================
            // NUEVO: Buscar y asignar POR CADA VARIANTE DE COLOR
            // =============================================
            for (const product of modelGroup) {
                const colorProv = product.colorProv || '';
                const colorExpanded = (COLOR_CODES_MAPPING[colorProv.toUpperCase()] || colorProv).toLowerCase();

                elements.currentItemName.textContent = `${product.marca} ${product.modelo} (${colorExpanded || 'sin color'})`;
                addLog(`\n   📍 Buscando imágenes para: ${product.modelo} - ${colorExpanded || 'sin color'}`, 'info');

                // PASO 1: Buscar imágenes específicas para ESTE producto CON su color
                const candidates = await collectCandidateImages(product);
                const filtered = await prefilterImageUrls(candidates);

                if (filtered.length === 0) {
                    addLog(`      ⚠️ No se encontraron imágenes para ${colorExpanded}`, 'warning');
                    appState.processedData.push({
                        'MARCA': product.marca,
                        'MODELO': product.modelo,
                        'SKU': product.sku,
                        'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                        'IMAGEN 1': '', 'IMAGEN 2': '', 'IMAGEN 3': '', 'IMAGEN 4': '', 'IMAGEN 5': '',
                        'EXTRAS': []
                    });
                    addProductToPreviewTable(product, []);
                    processedCount++;
                    updateProgress(processedCount, selectedProducts.length);
                    continue;
                }

                // PASO 2: Describir imágenes
                addLog(`      🌟 Describiendo ${filtered.length} imágenes...`, 'info');
                const imageDescriptions = await describeImagesWithGemini(filtered, product.categoria);
                const validDescriptions = imageDescriptions.filter(d => d.description !== null);

                // PASO 3: Filtrar por color, calidad Y tipo de manga
                const expectedSleeveType = detectSleeveType(product.nombreOriginal, product.categoria);
                if (expectedSleeveType) {
                    addLog(`      👕 Tipo de manga esperado: ${expectedSleeveType}`, 'info');
                }

                const colorMatchingImages = validDescriptions.filter(item => {
                    const d = item.description;
                    if (d.se_ve_claramente_la_categoria === 'no') return false;
                    if (!d.es_producto_real) return false;
                    if (d.tiene_texto_extra_o_banner) return false;
                    if (d.es_collage) return false;
                    if (d.visibilidad_producto === 'confusa') return false;
                    if (d.protagonismo_producto === 'fondo' || d.protagonismo_producto === 'secundario') return false;

                    // ======= FILTRO TIPO DE MANGA =======
                    if (expectedSleeveType && d.tipo_manga && d.tipo_manga !== 'no_aplica') {
                        if (d.tipo_manga !== expectedSleeveType) {
                            // El tipo de manga no coincide, rechazar
                            return false;
                        }
                    }

                    // Coincidencia de color
                    const detectedColor = (d.color_detectado || '').toLowerCase();

                    // Si no hay color especificado, aceptar cualquiera
                    if (!colorExpanded) return true;

                    // Verificar coincidencia de color
                    if (detectedColor.includes(colorExpanded) || colorExpanded.includes(detectedColor)) {
                        return true;
                    }

                    // Mapeo de colores similares
                    const colorSimilars = {
                        'negro': ['black', 'negro', 'gris oscuro', 'charcoal'],
                        'blanco': ['white', 'blanco', 'crema', 'off white', 'cream'],
                        'azul': ['blue', 'azul', 'celeste', 'navy', 'marino', 'sky'],
                        'rojo': ['red', 'rojo', 'coral', 'bordo', 'burgundy'],
                        'verde': ['green', 'verde', 'oliva', 'olive', 'khaki'],
                        'gris': ['grey', 'gray', 'gris', 'charcoal'],
                        'beige': ['beige', 'crema', 'arena', 'sand', 'tan', 'camel']
                    };

                    for (const [baseColor, variants] of Object.entries(colorSimilars)) {
                        if (colorExpanded.includes(baseColor) || variants.some(v => colorExpanded.includes(v))) {
                            if (variants.some(v => detectedColor.includes(v)) || detectedColor.includes(baseColor)) {
                                return true;
                            }
                        }
                    }

                    return false;
                });

                const selectedImages = colorMatchingImages.slice(0, CONFIG.IMAGES_PER_ITEM);
                const finalImages = selectedImages.map(img => img.url);

                if (finalImages.length === 0) {
                    addLog(`      ⚠️ No hay imágenes que coincidan con "${colorExpanded}"`, 'warning');
                } else {
                    addLog(`      ✅ ${finalImages.length} imágenes para ${colorExpanded}`, 'success');
                }

                // Add to processed data
                appState.processedData.push({
                    'MARCA': product.marca,
                    'MODELO': product.modelo,
                    'SKU': product.sku,
                    'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                    'IMAGEN 1': finalImages[0] || '',
                    'IMAGEN 2': finalImages[1] || '',
                    'IMAGEN 3': finalImages[2] || '',
                    'IMAGEN 4': finalImages[3] || '',
                    'IMAGEN 5': finalImages[4] || '',
                    'EXTRAS': finalImages.slice(5) || [] // Imágenes adicionales después de las 5 principales
                });

                addProductToPreviewTable(product, finalImages);
                processedCount++;
                updateProgress(processedCount, selectedProducts.length);

                // Pequeño delay entre variantes
                await delay(500);
            }


        } catch (error) {
            console.error(`Error processing model ${modelKey}:`, error);
            addLog(`   ✗ Error procesando modelo: ${error.message}`, 'error');

            // Add items with empty images
            for (const product of modelGroup) {
                appState.processedData.push({
                    'MARCA': product.marca,
                    'MODELO': product.modelo,
                    'SKU': product.sku,
                    'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                    'IMAGEN 1': '', 'IMAGEN 2': '', 'IMAGEN 3': '', 'IMAGEN 4': '', 'IMAGEN 5': '',
                    'EXTRAS': []
                });
                addProductToPreviewTable(product, []);
                processedCount++;
                updateProgress(processedCount, selectedProducts.length);
            }
        }

        // Delay between model groups
        await delay(CONFIG.DELAY_BETWEEN_PRODUCTS);
    }

    // Show results
    showResults();
}

// Add product to real-time results table
function addProductToPreviewTable(product, images) {
    const row = document.createElement('tr');
    row.dataset.sku = product.sku;

    // Create cells
    const marcaCell = document.createElement('td');
    marcaCell.textContent = product.marca;

    const modeloCell = document.createElement('td');
    modeloCell.textContent = product.modelo;

    const skuCell = document.createElement('td');
    skuCell.textContent = product.sku;

    row.appendChild(marcaCell);
    row.appendChild(modeloCell);
    row.appendChild(skuCell);

    // Add image cells
    for (let i = 0; i < 5; i++) {
        const imageCell = document.createElement('td');

        if (images[i]) {
            const img = document.createElement('img');
            img.src = images[i];
            img.className = 'image-thumbnail';
            img.alt = `${product.modelo} - Imagen ${i + 1}`;
            img.title = 'Click para ver en tamaño completo';

            // Click to open in new tab
            img.addEventListener('click', () => {
                window.open(images[i], '_blank');
            });

            // Error handling
            img.onerror = () => {
                const errorDiv = document.createElement('div');
                errorDiv.className = 'image-error';
                errorDiv.textContent = '✗';
                imageCell.innerHTML = '';
                imageCell.appendChild(errorDiv);
            };

            imageCell.appendChild(img);
        } else {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'image-loading';
            loadingDiv.textContent = '-';
            imageCell.appendChild(loadingDiv);
        }

        row.appendChild(imageCell);
    }

    elements.resultsPreviewTableBody.appendChild(row);
    // No auto-scroll - el usuario puede scrollear manualmente sin interrupciones
}

// =============================================
// RESULTADOS
// =============================================

// Show results
function showResults() {
    elements.processingSection.style.display = 'none';
    elements.resultsSection.style.display = 'block';

    const totalProcessed = appState.processedData.length;
    const totalImages = appState.processedData.reduce((acc, item) => {
        const imageCount = [item['IMAGEN 1'], item['IMAGEN 2'], item['IMAGEN 3'], item['IMAGEN 4'], item['IMAGEN 5']]
            .filter(img => img).length;
        return acc + imageCount;
    }, 0);

    elements.totalProcessed.textContent = totalProcessed;
    elements.totalImages.textContent = totalImages;

    // Populate final results table with controls (checkbox and X button)
    populateFinalResultsTable();

    appState.isProcessing = false;
}

// Populate final results table with controls (checkbox + X button)
function populateFinalResultsTable() {
    elements.finalResultsTableBody.innerHTML = '';

    appState.processedData.forEach((product) => {
        const row = document.createElement('tr');
        row.dataset.sku = product.SKU;

        // Marca, Modelo, SKU cells
        const marcaCell = document.createElement('td');
        marcaCell.textContent = product.MARCA;

        const modeloCell = document.createElement('td');
        modeloCell.textContent = product.MODELO;

        const skuCell = document.createElement('td');
        skuCell.textContent = product.SKU;

        row.appendChild(marcaCell);
        row.appendChild(modeloCell);
        row.appendChild(skuCell);

        // Image cells with checkbox and X button
        for (let i = 1; i <= 5; i++) {
            const imageCell = document.createElement('td');
            const imageUrl = product[`IMAGEN ${i}`];

            if (imageUrl) {
                // Container for image + controls
                const container = document.createElement('div');
                container.style.position = 'relative';
                container.style.display = 'inline-block';

                // DRAG AND DROP
                container.draggable = true;
                container.style.cursor = 'grab';

                container.addEventListener('dragstart', (e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    const dragData = { sku: product.SKU, index: i - 1 };
                    e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                    container.style.opacity = '0.5';
                    container.classList.add('dragging');
                });

                container.addEventListener('dragend', () => {
                    container.style.opacity = '1';
                    container.classList.remove('dragging');
                    container.style.cursor = 'grab';
                    document.querySelectorAll('.drop-target').forEach(el => el.classList.remove('drop-target'));
                });

                imageCell.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    imageCell.classList.add('drop-target');
                });

                imageCell.addEventListener('dragleave', () => {
                    imageCell.classList.remove('drop-target');
                });

                imageCell.addEventListener('drop', (e) => {
                    e.preventDefault();
                    imageCell.classList.remove('drop-target');

                    try {
                        const rawData = e.dataTransfer.getData('text/plain');
                        if (!rawData) return;

                        const sourceData = JSON.parse(rawData);
                        const targetSKU = product.SKU;
                        const sourceSKU = sourceData.sku;
                        const targetIndex = i - 1;
                        const targetKey = `IMAGEN ${targetIndex + 1}`;

                        // Buscar producto destino
                        const targetDataIndex = appState.processedData.findIndex(p => p.SKU === targetSKU);
                        if (targetDataIndex === -1) return;
                        const targetItem = appState.processedData[targetDataIndex];

                        // Buscar producto origen
                        const sourceDataIndex = appState.processedData.findIndex(p => p.SKU === sourceSKU);
                        if (sourceDataIndex === -1) return;
                        const sourceItem = appState.processedData[sourceDataIndex];

                        const isSameProduct = sourceSKU === targetSKU;

                        // Si viene de EXTRAS
                        if (sourceData.fromExtras) {
                            const extraUrl = sourceData.url;
                            const oldImg = targetItem[targetKey];

                            // Poner la extra en el slot principal del destino
                            targetItem[targetKey] = extraUrl;

                            // Quitar de extras del origen
                            if (sourceItem.EXTRAS) {
                                sourceItem.EXTRAS = sourceItem.EXTRAS.filter((_, idx) => idx !== sourceData.extraIndex);
                            }

                            // Si había imagen en el slot destino, moverla a extras del destino
                            if (oldImg) {
                                targetItem.EXTRAS = targetItem.EXTRAS || [];
                                targetItem.EXTRAS.push(oldImg);
                            }

                            populateFinalResultsTable();
                            if (isSameProduct) {
                                addLog(`Extra movida al slot ${targetIndex + 1}`, 'info');
                            } else {
                                addLog(`Extra de ${sourceSKU} movida a ${targetSKU} slot ${targetIndex + 1}`, 'info');
                            }
                        }
                        // Si viene de un slot principal
                        else {
                            const sourceIndex = sourceData.index;
                            const sourceKey = `IMAGEN ${sourceIndex + 1}`;

                            // No hacer nada si es el mismo slot del mismo producto
                            if (isSameProduct && sourceIndex === targetIndex) return;

                            const sourceImg = sourceItem[sourceKey];
                            const targetImg = targetItem[targetKey];

                            // Swap entre los dos slots
                            sourceItem[sourceKey] = targetImg;
                            targetItem[targetKey] = sourceImg;

                            populateFinalResultsTable();
                            if (isSameProduct) {
                                addLog(`Imagen movida de posición ${sourceIndex + 1} a ${targetIndex + 1}`, 'info');
                            } else {
                                addLog(`Imagen intercambiada: ${sourceSKU}[${sourceIndex + 1}] ↔ ${targetSKU}[${targetIndex + 1}]`, 'info');
                            }
                        }
                    } catch (err) {
                        console.error('Drag drop error:', err);
                    }
                });

                // Checkbox
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'image-checkbox';
                checkbox.dataset.sku = product.SKU;
                checkbox.dataset.imageIndex = i - 1;
                checkbox.title = 'Seleccionar para quitar fondo';

                // Link button (ir al sitio de origen)
                const linkBtn = document.createElement('button');
                linkBtn.textContent = '🔗';
                linkBtn.className = 'image-link-btn';
                linkBtn.title = 'Ir al sitio de origen';

                linkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    try {
                        // Extraer el dominio de la URL de la imagen
                        const url = new URL(imageUrl);
                        const siteUrl = url.origin;
                        window.open(siteUrl, '_blank');
                    } catch (err) {
                        console.error('Error opening site:', err);
                    }
                });

                // Delete button (X)
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '×';
                deleteBtn.className = 'image-delete-btn';
                deleteBtn.title = 'Eliminar imagen';

                deleteBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    container.style.opacity = '0.3';
                    container.dataset.deleted = 'true';
                    checkbox.disabled = true;
                    linkBtn.disabled = true;
                    deleteBtn.disabled = true;

                    const dataIndex = appState.processedData.findIndex(p => p.SKU === product.SKU);
                    if (dataIndex !== -1) {
                        appState.processedData[dataIndex][`IMAGEN ${i}`] = '';
                    }
                });

                // Image
                const img = document.createElement('img');
                img.src = imageUrl;
                img.className = 'image-thumbnail';
                img.dataset.originalSrc = imageUrl;
                img.dataset.sku = product.SKU;
                img.dataset.imageIndex = i - 1;
                img.alt = `${product.MODELO} - Imagen ${i}`;
                img.title = 'Click para ver en tamaño completo';

                img.addEventListener('click', () => {
                    if (container.dataset.deleted !== 'true') {
                        window.open(imageUrl, '_blank');
                    }
                });

                img.onerror = () => {
                    imageCell.innerHTML = '<div class="image-error">✗</div>';
                };

                container.appendChild(checkbox);
                container.appendChild(linkBtn);
                container.appendChild(deleteBtn);
                container.appendChild(img);
                imageCell.appendChild(container);
            } else {
                const emptyDiv = document.createElement('div');
                emptyDiv.className = 'image-loading';
                emptyDiv.textContent = '-';
                imageCell.appendChild(emptyDiv);
            }

            row.appendChild(imageCell);
        }

        // Celda de EXTRAS
        const extrasCell = document.createElement('td');
        const extrasContainer = document.createElement('div');
        extrasContainer.className = 'extras-container';

        const extras = product.EXTRAS || [];
        extras.forEach((extraUrl, extraIndex) => {
            if (!extraUrl) return;

            const extraImg = document.createElement('img');
            extraImg.src = extraUrl;
            extraImg.className = 'extra-thumbnail';
            extraImg.title = 'Arrastra a un slot principal';
            extraImg.draggable = true;

            // Drag start - desde extras
            extraImg.addEventListener('dragstart', (e) => {
                e.dataTransfer.effectAllowed = 'copy';
                const dragData = {
                    sku: product.SKU,
                    fromExtras: true,
                    extraIndex: extraIndex,
                    url: extraUrl
                };
                e.dataTransfer.setData('text/plain', JSON.stringify(dragData));
                extraImg.classList.add('dragging');
            });

            extraImg.addEventListener('dragend', () => {
                extraImg.classList.remove('dragging');
            });

            // Click para ver grande
            extraImg.addEventListener('click', () => {
                window.open(extraUrl, '_blank');
            });

            extrasContainer.appendChild(extraImg);
        });

        extrasCell.appendChild(extrasContainer);
        row.appendChild(extrasCell);

        elements.finalResultsTableBody.appendChild(row);
    });
}

// =============================================
// REMOVE BACKGROUND
// =============================================

// Remove background from image using remove.bg API
async function removeBackground(imageUrl) {
    try {
        const formData = new FormData();
        formData.append('image_url', imageUrl);
        formData.append('size', 'auto');

        const response = await fetch('https://api.remove.bg/v1.0/removebg', {
            method: 'POST',
            headers: {
                'X-Api-Key': CONFIG.REMOVEBG_API_KEY
            },
            body: formData
        });

        if (!response.ok) {
            console.error(`Remove.bg API error: ${response.status}`);
            return imageUrl;
        }

        const blob = await response.blob();

        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });

    } catch (error) {
        console.error('Error removing background:', error);
        return imageUrl;
    }
}

// Remove background from selected images
async function removeBackgroundFromSelected() {
    const checkboxes = document.querySelectorAll('.image-checkbox:checked');

    if (checkboxes.length === 0) {
        alert('Por favor selecciona al menos una imagen marcando los checkboxes');
        return;
    }

    if (!confirm(`¿Eliminar fondo de ${checkboxes.length} imagen(es) seleccionada(s)?`)) {
        return;
    }

    elements.removeBgBtn.disabled = true;
    elements.removeBgBtn.textContent = `Procesando ${checkboxes.length} imagen(es)...`;

    let processed = 0;

    for (let checkbox of checkboxes) {
        const sku = checkbox.dataset.sku;
        const imageIndex = parseInt(checkbox.dataset.imageIndex);
        const imageNumber = imageIndex + 1;

        const img = document.querySelector(`img[data-sku="${sku}"][data-image-index="${imageIndex}"]`);
        if (!img) continue;

        const originalSrc = img.dataset.originalSrc || img.src;

        addLog(`Eliminando fondo: SKU ${sku}, Imagen ${imageNumber}...`, 'info');

        try {
            const processedImage = await removeBackground(originalSrc);

            img.src = processedImage;
            img.dataset.originalSrc = processedImage;

            const dataIndex = appState.processedData.findIndex(p => p.SKU === sku);
            if (dataIndex !== -1) {
                appState.processedData[dataIndex][`IMAGEN ${imageNumber}`] = processedImage;
            }

            checkbox.checked = false;
            processed++;
            elements.removeBgBtn.textContent = `Procesando... (${processed}/${checkboxes.length})`;

            addLog(`✓ Fondo eliminado: SKU ${sku}, Imagen ${imageNumber}`, 'success');
        } catch (error) {
            addLog(`✗ Error en SKU ${sku}, Imagen ${imageNumber}: ${error.message}`, 'error');
        }

        if (processed < checkboxes.length) {
            await delay(1000);
        }
    }

    elements.removeBgBtn.disabled = false;
    elements.removeBgBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;">
            <path d="M3 3L21 21M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Sacar Fondo a Seleccionados
    `;

    addLog(`Proceso completado: ${processed} imagen(es) procesadas`, 'success');
}

// =============================================
// AI SORT IMAGES
// =============================================

// Sort images with AI (prioritize studio/white background)
async function sortImagesWithAI() {
    if (!appState.processedData || appState.processedData.length === 0) {
        alert('No hay productos procesados para ordenar.');
        return;
    }

    if (!confirm(`Se analizarán ${appState.processedData.length} productos con IA para ordenar sus imágenes (priorizando fotos de estudio). Esto puede tomar unos minutos dependiento de la cantidad. ¿Continuar?`)) {
        return;
    }

    elements.aiSortBtn.disabled = true;
    const originalText = elements.aiSortBtn.innerHTML;
    elements.aiSortBtn.textContent = 'Analizando...';

    let processedCount = 0;

    for (let i = 0; i < appState.processedData.length; i++) {
        const item = appState.processedData[i];
        const images = [];
        const imageMap = [];

        for (let j = 1; j <= 5; j++) {
            const url = item[`IMAGEN ${j}`];
            if (url && !url.includes('image-error')) {
                images.push(url);
                imageMap.push(j - 1);
            }
        }

        if (images.length < 2) continue;

        elements.aiSortBtn.textContent = `Analizando ${i + 1}/${appState.processedData.length}...`;

        try {
            const bestIndexLocal = await findBestStudioImage(images, `${item.MARCA} ${item.MODELO}`);

            if (bestIndexLocal !== -1 && bestIndexLocal !== 0 && bestIndexLocal < images.length) {
                const sourceIndex = imageMap[bestIndexLocal];
                const targetIndex = 0;

                const sourceKey = `IMAGEN ${sourceIndex + 1}`;
                const targetKey = `IMAGEN ${targetIndex + 1}`;

                const temp = item[targetKey];
                item[targetKey] = item[sourceKey];
                item[sourceKey] = temp;

                addLog(`🔄 IA: Imagen ${sourceIndex + 1} movida a posición 1 para ${item.MODELO}`, 'success');
            }
        } catch (error) {
            console.error('Error sorting images for', item.MODELO, error);
        }

        await delay(3000);
        processedCount++;
    }

    populateFinalResultsTable();

    elements.aiSortBtn.disabled = false;
    elements.aiSortBtn.innerHTML = originalText;
    addLog(`Proceso de ordenamiento IA completado.`, 'success');
}

async function findBestStudioImage(imageUrls, productName, retryCount = 0) {
    if (!CONFIG.OPENAI_API_KEY) return -1;

    const validUrls = imageUrls.filter(url => url && url.startsWith('http') && url.length < 5000);

    if (validUrls.length < 2) return 0;

    try {
        const content = validUrls.map((url) => ({
            type: "image_url",
            image_url: { url: url }
        }));

        content.unshift({
            type: "text",
            text: `Analiza estas imágenes del producto "${productName}". Identifica la MEJOR imagen principal para e-commerce.

            REGLAS DE PRIORIDAD DIFERENCIADAS:
            
            1. SI ES ROPA (Remeras, Buzos, Camperas, Pantalones, Shorts):
               - MEJOR OPCIÓN: Modelo humano vistiendo la prenda DE FRENTE, plano medio o entero, en estudio (fondo neutro/urbano limpio).
               - SEGUNDA OPCIÓN: Prenda sola extendida (flat lay) o invisible mannequin, fondo blanco.
               
            2. SI ES CALZADO, GORROS O ACCESORIOS:
               - MEJOR OPCIÓN: Producto SOLO (sin modelo) sobre fondo BLANCO PURO. Vista 3/4 o perfil.
               - EVITAR: Fotos con modelos (pies, cabezas) salvo que sea foto de muy alta calidad estilo lookbook.

            Devuelve JSON: {"bestIndex": N} con N siendo el índice (0-${validUrls.length - 1}) de la mejor imagen.`
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4.1-mini',
                messages: [{ role: 'user', content: content }],
                max_tokens: 50,
                temperature: 0.1
            })
        });

        if (response.status === 429) {
            if (retryCount < 2) {
                console.warn(`OpenAI Rate Limit 429. Waiting 10s to retry... (Attempt ${retryCount + 1})`);
                await delay(10000);
                return findBestStudioImage(validUrls, productName, retryCount + 1);
            }
        }

        if (!response.ok) {
            console.warn(`OpenAI API Error: ${response.status} - ${response.statusText}`);
            return -1;
        }

        const data = await response.json();

        if (!data.choices || !data.choices.length) {
            console.warn("OpenAI API returned no content");
            return -1;
        }

        const text = data.choices[0]?.message?.content || '{}';

        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return typeof result.bestIndex === 'number' ? result.bestIndex : 0;
        }
        return 0;
    } catch (e) {
        console.error("AI Sort Error:", e);
        return -1;
    }
}

// =============================================
// DESCARGA
// =============================================

// Download results as Excel
function downloadResults() {
    if (appState.processedData.length === 0) {
        alert('No hay datos para descargar');
        return;
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(appState.processedData);

    ws['!cols'] = [
        { wch: 15 }, // MARCA
        { wch: 25 }, // MODELO
        { wch: 15 }, // SKU
        { wch: 40 }, // NOMBRE DEL ARTICULO
        { wch: 50 }, // IMAGEN 1
        { wch: 50 }, // IMAGEN 2
        { wch: 50 }, // IMAGEN 3
        { wch: 50 }, // IMAGEN 4
        { wch: 50 }  // IMAGEN 5
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'Productos con Imágenes');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `productos_imagenes_${timestamp}.xlsx`;

    XLSX.writeFile(wb, filename);

    addLog(`Archivo descargado: ${filename}`, 'success');
}

// =============================================
// DESCARGA DE IMÁGENES 1500x1500 EN ZIP
// =============================================
async function downloadImagesSquare() {
    if (appState.processedData.length === 0) {
        alert('No hay datos para descargar');
        return;
    }

    if (typeof JSZip === 'undefined') {
        alert('Error: JSZip no está cargado. Recarga la página.');
        return;
    }

    const SIZE = 1500;
    const downloadBtn = document.getElementById('downloadImagesBtn');
    const originalText = downloadBtn.innerHTML;
    downloadBtn.disabled = true;

    // Crear ZIP
    const zip = new JSZip();

    // Agrupar imágenes por SKU
    const imagesBySku = {};
    for (const item of appState.processedData) {
        const sku = item.SKU || 'unknown';
        if (!imagesBySku[sku]) {
            imagesBySku[sku] = [];
        }
        for (let i = 1; i <= 5; i++) {
            const url = item[`IMAGEN ${i}`];
            if (url && url.startsWith('http')) {
                imagesBySku[sku].push({
                    url,
                    filename: `img${i}.jpg`,
                    imageNum: i
                });
            }
        }
    }

    const skuList = Object.keys(imagesBySku);
    if (skuList.length === 0) {
        alert('No hay imágenes para descargar');
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = originalText;
        return;
    }

    const totalImages = Object.values(imagesBySku).reduce((sum, arr) => sum + arr.length, 0);
    addLog(`📥 Creando ZIP con ${totalImages} imágenes en ${skuList.length} carpetas...`, 'info');

    let processed = 0;
    let errors = 0;

    for (const sku of skuList) {
        const skuFolder = zip.folder(sku);
        const images = imagesBySku[sku];

        for (const imgInfo of images) {
            downloadBtn.textContent = `Procesando ${processed + 1}/${totalImages}...`;

            try {
                const blob = await cropImageToBlob(imgInfo.url, SIZE);
                if (blob) {
                    skuFolder.file(imgInfo.filename, blob);
                    processed++;
                    addLog(`   ✓ ${sku}/${imgInfo.filename}`, 'success');
                } else {
                    throw new Error('No se pudo crear blob');
                }
            } catch (error) {
                errors++;
                addLog(`   ✗ ${sku}/${imgInfo.filename}: ${error.message}`, 'warning');
            }

            // Pequeño delay para no saturar
            await delay(100);
        }
    }

    // Generar y descargar ZIP
    downloadBtn.textContent = 'Generando ZIP...';
    addLog(`📦 Comprimiendo ${processed} imágenes...`, 'info');

    try {
        const content = await zip.generateAsync({
            type: 'blob',
            compression: 'DEFLATE',
            compressionOptions: { level: 6 }
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const zipFilename = `imagenes_productos_${timestamp}.zip`;

        const url = URL.createObjectURL(content);
        const a = document.createElement('a');
        a.href = url;
        a.download = zipFilename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        addLog(`📥 ZIP descargado: ${zipFilename} (${processed} imágenes, ${errors} errores)`, 'success');
    } catch (zipError) {
        addLog(`❌ Error creando ZIP: ${zipError.message}`, 'error');
    }

    downloadBtn.disabled = false;
    downloadBtn.innerHTML = originalText;
}

// Encajar imagen completa en cuadrado y devolver blob (sin recortar)
async function cropImageToBlob(imageUrl, targetSize) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        const timeout = setTimeout(() => {
            reject(new Error('Timeout'));
        }, 15000);

        img.onload = () => {
            clearTimeout(timeout);

            try {
                const canvas = document.createElement('canvas');
                canvas.width = targetSize;
                canvas.height = targetSize;
                const ctx = canvas.getContext('2d');

                // Fondo blanco
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, targetSize, targetSize);

                // Calcular "contain" - encajar imagen completa sin recortar
                const imgAspect = img.width / img.height;
                let drawWidth, drawHeight, drawX, drawY;

                if (imgAspect > 1) {
                    // Imagen horizontal: ajustar por ancho
                    drawWidth = targetSize;
                    drawHeight = targetSize / imgAspect;
                    drawX = 0;
                    drawY = (targetSize - drawHeight) / 2;
                } else {
                    // Imagen vertical o cuadrada: ajustar por altura
                    drawHeight = targetSize;
                    drawWidth = targetSize * imgAspect;
                    drawX = (targetSize - drawWidth) / 2;
                    drawY = 0;
                }

                // Dibujar imagen completa centrada
                ctx.drawImage(img, 0, 0, img.width, img.height, drawX, drawY, drawWidth, drawHeight);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, 'image/jpeg', 0.92);
            } catch (e) {
                reject(e);
            }
        };

        img.onerror = () => {
            clearTimeout(timeout);
            reject(new Error('Failed to load'));
        };

        img.src = imageUrl;
    });
}

// Descargar y recortar una imagen a cuadrado usando canvas
async function downloadAndCropImage(imageUrl, filename, targetSize) {
    return new Promise(async (resolve, reject) => {
        try {
            // Usar proxy CORS o cargar directamente
            const img = new Image();
            img.crossOrigin = 'anonymous';

            // Timeout de 10 segundos
            const timeout = setTimeout(() => {
                reject(new Error('Timeout loading image'));
            }, 10000);

            img.onload = () => {
                clearTimeout(timeout);

                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = targetSize;
                    canvas.height = targetSize;
                    const ctx = canvas.getContext('2d');

                    // Fondo blanco por si hay transparencias
                    ctx.fillStyle = '#FFFFFF';
                    ctx.fillRect(0, 0, targetSize, targetSize);

                    // Calcular recorte "cover" (llenar sin dejar espacios)
                    const imgAspect = img.width / img.height;
                    const canvasAspect = 1; // Es cuadrado

                    let sx, sy, sw, sh;

                    if (imgAspect > canvasAspect) {
                        // Imagen más ancha que alta - recortar lados
                        sh = img.height;
                        sw = img.height * canvasAspect;
                        sx = (img.width - sw) / 2;
                        sy = 0;
                    } else {
                        // Imagen más alta que ancha - recortar arriba/abajo
                        sw = img.width;
                        sh = img.width / canvasAspect;
                        sx = 0;
                        sy = (img.height - sh) / 2;
                    }

                    // Dibujar imagen recortada
                    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetSize, targetSize);

                    // Convertir a blob y descargar
                    canvas.toBlob((blob) => {
                        if (!blob) {
                            reject(new Error('Failed to create blob'));
                            return;
                        }

                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                        resolve();
                    }, 'image/jpeg', 0.92);
                } catch (canvasError) {
                    reject(canvasError);
                }
            };

            img.onerror = () => {
                clearTimeout(timeout);
                reject(new Error('Failed to load image'));
            };

            // Intentar cargar directamente o vía proxy
            img.src = imageUrl;

        } catch (error) {
            reject(error);
        }
    });
}

// =============================================
// LÓGICA DE TESTING V2 EXTRAÍDA (PARA REUSO)
// =============================================

/**
 * Busca las mejores imágenes usando SOLO análisis de texto de URLs (GPT) y deduplicación inteligente.
 * NO utiliza visión por computador (Gemini).
 * Retorna array de objetos { url, matchType, score }
 */
async function findImagesWithTestingLogic(product) {
    const { marca, modelo, sku, colorProv, categoria, nombreOriginal } = product;
    const colorExpanded = COLOR_CODES_MAPPING[(colorProv || '').toUpperCase()] || colorProv || '';

    addLog(`   🔎 Buscando imágenes para: ${marca} ${modelo} (${colorExpanded})`, 'info');

    // 1. Recolección
    const candidateImages = await collectCandidateImages(product);
    if (candidateImages.length === 0) {
        addLog(`   ❌ No se encontraron URLs candidatas`, 'warning');
        return [];
    }

    addLog(`   📥 ${candidateImages.length} URLs brutas encontradas`, 'info');

    // 2. Dedupe Inteligente (por Asset Key + Global Locks)
    const bestAssetsMap = new Map();
    let skippedByGlobalLock = 0;

    // Si la función es llamada en contexto donde globalUsedUrls no está definido (safety check)
    if (typeof globalUsedUrls === 'undefined') {
        window.globalUsedUrls = new Set();
        window.globalUsedAssets = new Set();
    }

    for (const url of candidateImages) {
        const assetKey = getAssetKey(url);
        const score = getResolutionScore(url);

        if (globalUsedUrls.has(url) || globalUsedAssets.has(assetKey)) {
            skippedByGlobalLock++;
            continue;
        }

        if (bestAssetsMap.has(assetKey)) {
            const existing = bestAssetsMap.get(assetKey);
            if (score > existing.score) {
                bestAssetsMap.set(assetKey, { url, assetKey, score });
            }
        } else {
            bestAssetsMap.set(assetKey, { url, assetKey, score });
        }
    }

    const deduped = Array.from(bestAssetsMap.values());
    if (skippedByGlobalLock > 0) addLog(`   🔒 ${skippedByGlobalLock} URLs descartadas por GLOBAL LOCK`, 'info');

    if (deduped.length === 0) return [];

    // 3. Identificación de Matches (3 NIVELES DE CONFIANZA)
    // NIVEL 1: SKU EXACTO → Score 100 (auto-accept)
    // NIVEL 2: SKU PARCIAL + COLOR PROVEEDOR → Score 90 (auto-accept)
    // NIVEL 3: MODELO + COLOR PROVEEDOR → Score 85 (auto-accept)
    // RESTO: Se envía a OpenAI para validación de texto
    const skuOverrideUrls = [];
    const skuColorUrls = [];
    const modelColorUrls = [];
    const urlsForPreFilter = [];

    for (const item of deduped) {
        // NIVEL 1: SKU exacto completo en la URL
        if (hasExactSkuMatch(item.url, sku)) {
            skuOverrideUrls.push({ ...item, matchType: 'SKU_EXACT', score: 100 });
        }
        // NIVEL 2: SKU parcial + color de proveedor en la URL
        else if (hasPartialSkuWithColor(item.url, sku, colorProv)) {
            skuColorUrls.push({ ...item, matchType: 'SKU_PARTIAL+COLOR', score: 90 });
        }
        // NIVEL 3: Modelo + color de proveedor en la URL
        else if (hasModelWithColor(item.url, modelo, colorProv)) {
            modelColorUrls.push({ ...item, matchType: 'MODEL+COLOR', score: 85 });
        }
        else {
            urlsForPreFilter.push(item);
        }
    }

    // Logging de resultados por nivel
    if (skuOverrideUrls.length > 0) addLog(`   🎯 NIVEL 1: ${skuOverrideUrls.length} URLs con SKU EXACTO`, 'success');
    if (skuColorUrls.length > 0) addLog(`   🎯 NIVEL 2: ${skuColorUrls.length} URLs con SKU parcial + Color "${colorProv}"`, 'success');
    if (modelColorUrls.length > 0) addLog(`   🎯 NIVEL 3: ${modelColorUrls.length} URLs con Modelo "${modelo}" + Color "${colorProv}"`, 'success');

    const autoAccepted = [...skuOverrideUrls, ...skuColorUrls, ...modelColorUrls];

    // 4. Si ya tenemos suficientes (5+) con auto-accept, NO gastar en OpenAI
    let strictUrls = [];
    if (autoAccepted.length < 5 && urlsForPreFilter.length > 0) {
        // Pre-filtro de relevancia (Marca/Modelo/SKU parcial) antes de enviar a IA
        const marcaNorm = (marca || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const modeloNorm = (modelo || '').toLowerCase().replace(/[^a-z0-9]/g, '');

        const urlsForOpenAI = urlsForPreFilter.filter(item => {
            const urlNorm = item.url.toLowerCase().replace(/[^a-z0-9]/g, '');
            const hasMarca = marcaNorm.length > 2 && urlNorm.includes(marcaNorm);
            const hasModelo = modeloNorm.length > 2 && urlNorm.includes(modeloNorm);
            const skuPart = (sku || '').length > 4 ? sku.substring(0, 6).toLowerCase().replace(/[^a-z0-9]/g, '') : 'zzzzzz';
            const hasSkuPart = urlNorm.includes(skuPart);
            return hasMarca || hasModelo || hasSkuPart;
        });

        // 5. Validación OpenAI (Texto) solo para las que no matchearon por color
        if (urlsForOpenAI.length > 0) {
            addLog(`   🤖 Validando ${urlsForOpenAI.length} URLs restantes con OpenAI (Texto)...`, 'info');
            const productContext = { marca, modelo, colorProv, categoria, sku };

            const aiResult = await filterUrlsByTextWithOpenAI(productContext, urlsForOpenAI.map(i => i.url));

            const allUrls = [...(aiResult.main || []), ...(aiResult.extras || [])];
            strictUrls = allUrls.map(url => ({
                url: url,
                assetKey: getAssetKey(url),
                matchType: 'AI_VALIDATED',
                score: 70
            }));
        }
    } else if (autoAccepted.length >= 5) {
        addLog(`   ⚡ ${autoAccepted.length} URLs auto-aceptadas, saltando validación OpenAI`, 'success');
    }

    // 6. Selección Final (prioridad: SKU exacto > SKU+Color > Modelo+Color > IA)
    let allAccepted = [...autoAccepted, ...strictUrls];

    // Site Hint Search (Búsqueda extra si solo hay 1)
    if (allAccepted.length === 1) {
        // ... (Lógica simplificada de site hint para no hacer el bloque gigante, 
        // si es crítico se puede expandir, por ahora lo dejo básico para ahorrar espacio)
    }

    if (allAccepted.length === 0) return [];

    // Priorización por Hostname (agrupar)
    const byHostname = {};
    for (const item of allAccepted) {
        const host = getHostname(item.url);
        if (!byHostname[host]) byHostname[host] = { urls: [], totalScore: 0 };
        byHostname[host].urls.push(item);
        byHostname[host].totalScore += (item.score || 0);
    }

    const hostScores = Object.values(byHostname).sort((a, b) => {
        // Priorizar si tiene SKU override
        const aHasSku = a.urls.some(u => u.matchType === 'SKU_OVERRIDE');
        const bHasSku = b.urls.some(u => u.matchType === 'SKU_OVERRIDE');
        if (aHasSku && !bHasSku) return -1;
        if (bHasSku && !aHasSku) return 1;
        return (b.totalScore / b.urls.length) - (a.totalScore / a.urls.length);
    });

    const finalSelection = [];
    const usedAssetsLocal = new Set();

    for (const hostData of hostScores) {
        if (finalSelection.length >= 5) break;
        // Ordenar dentro del host por score
        hostData.urls.sort((a, b) => (b.score || 0) - (a.score || 0));

        for (const item of hostData.urls) {
            if (finalSelection.length >= 5) break;
            if (usedAssetsLocal.has(item.assetKey)) continue;

            finalSelection.push(item);
            usedAssetsLocal.add(item.assetKey);
        }
    }

    // Validación final de carga
    const urlsToValidate = finalSelection.map(i => i.url);
    let validImages = await prefilterImageUrls(urlsToValidate); // Solo check visual básico y carga

    let selectedImages = validImages.slice(0, 5);

    // =============================================
    // SCRAPING: Si solo encontramos 1 imagen, buscar más en el mismo sitio
    // =============================================
    if (selectedImages.length === 1) {
        addLog(`   🔄 Solo 1 imagen encontrada, buscando más en el mismo sitio...`, 'info');

        try {
            const moreImages = await scrapeMoreImagesFromSite(selectedImages[0], product);

            if (moreImages && moreImages.length > 0) {
                addLog(`   ✅ Encontradas ${moreImages.length} imágenes adicionales via scraping`, 'success');

                // Filtrar duplicados y validar nuevas imágenes
                const newUrls = moreImages.filter(url =>
                    url && url.startsWith('http') &&
                    !selectedImages.includes(url) &&
                    !globalUsedUrls.has(url)
                );

                if (newUrls.length > 0) {
                    const validNewImages = await prefilterImageUrls(newUrls);
                    selectedImages = [...selectedImages, ...validNewImages].slice(0, 5);
                }
            }
        } catch (scrapeError) {
            console.error('Scraping error:', scrapeError);
            addLog(`   ⚠️ Error en scraping: ${scrapeError.message}`, 'warning');
        }
    }

    // Registrar en locks globales
    for (const url of selectedImages) {
        globalUsedUrls.add(url);
        globalUsedAssets.add(getAssetKey(url));
    }

    return selectedImages;
}

// =============================================
// SCRAPING: Buscar más imágenes en el mismo sitio
// =============================================

/**
 * Busca más imágenes del mismo producto en el sitio donde se encontró la primera imagen.
 * Hace scraping de la página del producto y usa IA para extraer el carrusel.
 */
async function scrapeMoreImagesFromSite(foundImageUrl, product) {
    try {
        // Primero, buscar la página del producto en Google usando site: search
        const urlObj = new URL(foundImageUrl);
        const domain = urlObj.hostname;

        // Construir búsqueda para encontrar la página del producto
        const searchQuery = `site:${domain} ${product.marca || ''} ${product.modelo || ''} ${product.sku || ''}`.trim();

        addLog(`   🔍 Buscando página de producto: site:${domain}...`, 'info');

        // Buscar la página del producto con Google
        const googleResults = await searchProductPage(searchQuery, domain);

        if (!googleResults || googleResults.length === 0) {
            addLog(`   ⚠️ No se encontró página de producto en ${domain}`, 'warning');
            return [];
        }

        const pageUrl = googleResults[0];
        addLog(`   📄 Página encontrada: ${pageUrl}`, 'info');

        // Llamar al backend para hacer scraping
        const response = await fetch('/api/scrape-product-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pageUrl: pageUrl,
                imageUrl: foundImageUrl,
                productContext: {
                    marca: product.marca,
                    modelo: product.modelo,
                    sku: product.sku,
                    categoria: product.categoria
                }
            })
        });

        if (!response.ok) {
            console.error('Backend scraping error:', response.status);
            return [];
        }

        const data = await response.json();
        return data.images || [];

    } catch (error) {
        console.error('scrapeMoreImagesFromSite error:', error);
        return [];
    }
}

/**
 * Busca la página de producto en Google usando site: search
 */
async function searchProductPage(query, domain) {
    if (!CONFIG.GOOGLE_API_KEY || !CONFIG.GOOGLE_CX) {
        console.error('Faltan credenciales de Google');
        return [];
    }

    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${CONFIG.GOOGLE_API_KEY}&cx=${CONFIG.GOOGLE_CX}&q=${encodeURIComponent(query)}&num=3`;

        const response = await fetch(url);
        if (!response.ok) {
            console.error('Google Search Error:', response.status);
            return [];
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            return [];
        }

        // Retornar las URLs de las páginas encontradas
        return data.items.map(item => item.link);

    } catch (error) {
        console.error('searchProductPage error:', error);
        return [];
    }
}

// Nueva función principal llamada por el botón "Buscar Imágenes"
async function enrichSelectedProducts() {
    const selectedProducts = appState.analyzedData.filter(p => p.selected);
    if (selectedProducts.length === 0) {
        alert('Por favor selecciona al menos un producto');
        return;
    }

    if (!CONFIG.GOOGLE_API_KEY || !CONFIG.OPENAI_API_KEY) {
        alert('Se necesitan API Keys de Google y OpenAI');
        return;
    }

    // Reset global locks
    if (typeof globalUsedUrls !== 'undefined') globalUsedUrls.clear();
    if (typeof globalUsedAssets !== 'undefined') globalUsedAssets.clear();
    else { window.globalUsedUrls = new Set(); window.globalUsedAssets = new Set(); }

    // UI Setup
    elements.analysisSection.style.display = 'none';
    elements.processingSection.style.display = 'block';
    elements.totalCount.textContent = selectedProducts.length;
    appState.isProcessing = true;
    appState.isCancelled = false;
    appState.processedData = [];
    elements.resultsPreviewTableBody.innerHTML = '';
    if (elements.imagesPreviewContainer) elements.imagesPreviewContainer.style.display = 'block';

    addLog('🚀 Iniciando Búsqueda de Imágenes (Modo Testing Logic)...', 'info');

    let processedCount = 0;

    for (const product of selectedProducts) {
        if (appState.isCancelled) break;

        const { marca, modelo, sku, colorProv } = product;
        elements.currentItemName.textContent = `${marca} ${modelo}`;
        addLog(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`, 'info');
        addLog(`Procesando: ${marca} ${modelo} (${sku})`, 'info');

        try {
            const images = await findImagesWithTestingLogic(product);

            if (images.length > 0) {
                addLog(`✅ seleccionadas ${images.length} imágenes`, 'success');
            } else {
                addLog(`⚠️ No se encontraron imágenes válidas`, 'warning');
            }

            // Guardar resultado
            appState.processedData.push({
                'MARCA': marca,
                'MODELO': modelo,
                'SKU': sku,
                'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                'IMAGEN 1': images[0] || '',
                'IMAGEN 2': images[1] || '',
                'IMAGEN 3': images[2] || '',
                'IMAGEN 4': images[3] || '',
                'IMAGEN 5': images[4] || '',
                'EXTRAS': images.slice(5) || []
            });

            addProductToPreviewTable(product, images);

        } catch (error) {
            console.error(error);
            addLog(`❌ Error: ${error.message}`, 'error');
            // Guardar vacío
            appState.processedData.push({
                'MARCA': marca, 'MODELO': modelo, 'SKU': sku,
                'NOMBRE DEL ARTICULO': toTitleCase(product.nombreOriginal),
                'IMAGEN 1': '', 'IMAGEN 2': '', 'IMAGEN 3': '', 'IMAGEN 4': '', 'IMAGEN 5': '',
                'EXTRAS': []
            });
            addProductToPreviewTable(product, []);
        }

        processedCount++;
        updateProgress(processedCount, selectedProducts.length);
        await delay(200);
    }

    showResults();
}


function initializeImageFinderListeners() {
    // Download template
    elements.downloadTemplateBtn.addEventListener('click', downloadTemplate);

    // AI Sort Button
    if (elements.aiSortBtn) {
        elements.aiSortBtn.addEventListener('click', sortImagesWithAI);
    }

    // Analyze button
    elements.analyzeBtn.addEventListener('click', analyzeFile);

    // Table controls
    elements.headerCheckbox.addEventListener('change', handleHeaderCheckboxChange);
    elements.selectAllBtn.addEventListener('click', selectAll);
    elements.deselectAllBtn.addEventListener('click', deselectAll);

    // Navigation buttons
    elements.backToUploadBtn.addEventListener('click', backToUpload);
    elements.enrichBtn.addEventListener('click', enrichSelectedProducts);

    // Download and new file buttons
    elements.downloadBtn.addEventListener('click', downloadResults);
    elements.removeBgBtn.addEventListener('click', removeBackgroundFromSelected);

    // Download images 1500x1500
    const downloadImagesBtn = document.getElementById('downloadImagesBtn');
    if (downloadImagesBtn) {
        downloadImagesBtn.addEventListener('click', downloadImagesSquare);
    }

    // Initial column checkboxes
    initializeColumnCheckboxes();
}

// Initialize column checkboxes
function initializeColumnCheckboxes() {
    const colCheckboxes = document.querySelectorAll('.col-select-checkbox');
    colCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const colIndex = e.target.dataset.colIndex;
            const isChecked = e.target.checked;

            const imageCheckboxes = document.querySelectorAll(`.image-checkbox[data-image-index="${colIndex}"]`);

            imageCheckboxes.forEach(imgCheckbox => {
                if (!imgCheckbox.disabled) {
                    imgCheckbox.checked = isChecked;
                }
            });

            addLog(`${isChecked ? 'Seleccionadas' : 'Deseleccionadas'} todas las imágenes de la columna ${parseInt(colIndex) + 1}`, 'info');
        });
    });
}
