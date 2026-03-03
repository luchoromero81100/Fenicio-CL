/**
 * OPENAI CLIENT - Cliente para OpenAI con Web Search
 * Implementa fallbacks automáticos si un método falla
 */

// Cargar dotenv directamente por si acaso
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Debug: verificar que la key existe
console.log('🔑 OpenAI API Key en openaiClient:', OPENAI_API_KEY ? `✅ ${OPENAI_API_KEY.substring(0, 20)}...` : '❌ NO ENCONTRADA');

/**
 * Chat Completions con modelo gpt-4o-search-preview
 */
async function callChatCompletionsSearch(prompt) {
    console.log('');
    console.log('🔍 Chat Completions con gpt-4o-search-preview');

    const payload = {
        model: 'gpt-4o-search-preview',
        messages: [{ role: 'user', content: prompt }],
        web_search_options: { search_context_size: 'medium' }
    };

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        console.log('📡 Status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error:', errorText);
            return { ok: false, status: response.status, error: errorText };
        }

        const data = await response.json();
        console.log('✅ Chat Completions Search OK');

        return { ok: true, data };

    } catch (error) {
        console.error('❌ Fetch error:', error.message);
        return { ok: false, status: 0, error: error.message };
    }
}

/**
 * Fallback: Chat Completions sin búsqueda web
 */
async function callChatCompletionsNoSearch(prompt) {
    console.log('');
    console.log('⚠️ Fallback: gpt-4o-mini sin búsqueda');

    const payload = {
        model: 'gpt-4o-mini',
        messages: [
            {
                role: 'system',
                content: 'Eres un redactor técnico de fichas de producto. Generas descripciones objetivas con formato de ficha técnica (Material: X | Capacidad: Y). NO uses frases de marketing. NO inventes datos específicos. Usa español uruguayo (cierre, buzo, campera, championes).'
            },
            { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 1500
    };

    try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error final:', errorText);
            return { ok: false, status: response.status, error: errorText };
        }

        const data = await response.json();
        console.log('✅ Fallback OK');

        return { ok: true, data };

    } catch (error) {
        return { ok: false, status: 0, error: error.message };
    }
}

/**
 * Función principal exportada
 */
export async function generateProductDescriptions(product) {
    const { marca, modelo, color, categoria, nombreOriginal } = product;

    const searchQuery = `${marca || ''} ${modelo || ''} ${nombreOriginal || ''}`.trim();

    console.log('');
    console.log('🚀 ═══════════════════════════════════════════');
    console.log(`🚀 Generando descripciones para: ${searchQuery}`);
    console.log('🚀 ═══════════════════════════════════════════');

    const prompt = `Buscá en internet información sobre el producto: "${searchQuery}"
Categoría: ${categoria || 'Ropa/Moda'}
Color: ${color || 'No especificado'}

INSTRUCCIONES GENERALES:
Vas a escribir descripciones para una tienda online. Las descripciones van de cara al público, tienen que ser naturales y fáciles de entender para cualquier persona, incluso alguien que no sabe nada del tema. Escribí como habla un uruguayo: simple, directo, sin rebusques.

DESCRIPCIÓN CORTA (máximo 255 caracteres):
Escribí un texto redactado, fluido, que describa el producto de forma natural. NO uses formato de lista ni bullets. Contá lo que encontraste sobre el producto en una o dos oraciones cortas. Si encontraste información de materiales, incluila de forma entendible. Si no encontraste nada específico, describí brevemente qué es el producto y para qué sirve.

DESCRIPCIÓN LARGA:
SOLO escribí descripción larga SI tenés información adicional que NO pusiste en la corta. Si ya dijiste todo en la descripción corta, dejá la larga VACÍA (string vacío ""). La descripción larga debe sumar algo nuevo, no repetir lo mismo con más palabras.

REGLAS IMPORTANTES:
- Escribí redactado, en párrafos, NO en formato de lista ni bullets
- Si no encontraste información real del producto, dejá las descripciones VACÍAS
- NO inventes datos, materiales o características
- NO pongas "no especifica", "no disponible", "sin información" - simplemente no pongas nada
- NO incluyas referencias a las fuentes ni de dónde sacaste la info
- NO uses frases de marketing como "increíble", "premium", "el mejor"
- NO pongas emojis
- NO repitas el nombre del producto

VOCABULARIO URUGUAYO (OBLIGATORIO):
Usá estas palabras en vez de las de otros países:
- Decí "cierre" en vez de cremallera
- Decí "buzo" en vez de sudadera  
- Decí "campera" en vez de chaqueta
- Decí "championes" en vez de zapatillas
- Decí "musculosa" en vez de camiseta sin mangas
- Decí "medias" en vez de calcetines
- Decí "bermudas" o "shorts" en vez de pantalones cortos
- Decí "malla" en vez de bañador o traje de baño
- Decí "remera" en vez de camiseta
- Decí "pollera" en vez de falda
- Decí "lentes de sol" en vez de gafas de sol

SI MENCIONÁS MATERIALES (solo si los encontraste), escribilos de forma entendible:
- En vez de solo "Cordura", poné "tela resistente tipo cordura"
- En vez de solo "Poliéster", poné "tela de poliéster liviana" o "tela que seca rápido" 
- En vez de solo "Neopreno", poné "neopreno para agua fría"
- En vez de solo "Mesh", poné "malla que respira"
- En vez de "GBS", poné "costuras selladas"
- En vez de solo "DWR", poné "repele el agua"

EVITÁ palabras rebuscadas:
- No digas "confeccionado", decí "hecho de"
- No digas "presenta", decí "tiene"
- No digas "proporciona", decí "da" u "ofrece"
- No digas "altamente transpirable", decí "muy fresco" o "respira bien"
- En vez de "Ha sido" decí "Fue"

RESPUESTA (SOLO JSON, nada más):
{
  "descripcion_255": "Texto redactado máximo 255 caracteres. Si no encontraste info, dejá vacío ''",
  "descripcion_larga": "Solo si aporta algo nuevo a la corta. Sino, dejá vacío ''"
}`;

    let result = null;
    let outputText = null;

    // INTENTO 1: Chat Completions con search-preview
    result = await callChatCompletionsSearch(prompt);
    if (result.ok) {
        outputText = result.data.choices?.[0]?.message?.content;
    }

    // INTENTO 2: Fallback sin búsqueda
    if (!outputText) {
        result = await callChatCompletionsNoSearch(prompt);
        if (result.ok) {
            outputText = result.data.choices?.[0]?.message?.content;
        }
    }

    // Si todo falló
    if (!outputText) {
        console.error('❌ Todos los métodos fallaron');
        return {
            descripcion_255: '',
            descripcion_larga: '',
            caracteristicas: [],
            materiales: [],
            cuidados: [],
            fuentes: [],
            warnings: ['Todos los métodos de generación fallaron']
        };
    }

    // Parsear JSON
    try {
        const jsonMatch = outputText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            console.log('✅ Descripción parseada correctamente');
            return parsed;
        }
    } catch (e) {
        console.error('❌ Error parseando JSON:', e.message);
    }

    // Retornar como texto plano
    return {
        descripcion_255: outputText.substring(0, 255),
        descripcion_larga: outputText,
        caracteristicas: [],
        materiales: [],
        cuidados: [],
        fuentes: [],
        warnings: ['Respuesta no estructurada como JSON']
    };
}
