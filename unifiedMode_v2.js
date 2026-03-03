// =============================================
// UNIFIED MODE - Modo Unificado (Stock + Imágenes)
// Requiere: shared.js, stockGenerator.js, imageFinder.js
// =============================================

// =============================================
// CONSTANTES
// =============================================

const UNIFIED_FINAL_HEADERS = [
    'CODIGO_PRODUCTO', 'CODIGO_VARIANTE', 'CATEGORIA', 'DESCRIPCION_CORTA', 'DESCRIPCION-LARGA',
    'FECHA_AGREGADO', 'SEXO', 'MARCA', 'NOMBRE_PRODUCTO', 'COLOR', 'HABILITADO',
    'LARGO-DEL-TRAJE', 'GUIA_TALLES', 'FIN-SET-UP', 'FIN-SYSTEM', 'TIPO-DE-BERMUDA',
    'TIPO-DE-LENTES', 'TAMANO', 'TIPOS-DE-TABLAS'
];

const UNIFIED_VALID_COLORS = [
    'beige', 'amarillo', 'naranja', 'rojo', 'rosa', 'violeta', 'azul', 'verde',
    'gris', 'blanco', 'negro', 'multicolor', 'patron', 'celeste', 'marron',
    'mostaza', 'bordeaux', 'carey', 'lila'
];

// Estado global del modo unificado
const unifiedState = {
    rows: [],           // Array de RowState
    stockCache: {},     // Caché para descripciones: "Marca|Modelo" -> descriptions
    isProcessing: false,
    isCancelled: false
};

/**
 * @typedef {Object} RowState
 * @property {number} index - Índice de la fila
 * @property {string} originalSku - SKU original del Excel
 * @property {string} cleanSku - SKU sin talle
 * @property {string} originalName - Nombre original del Excel
 * @property {string} excelColor - Color del Excel (si existe)
 * @property {Object} csvRowBase - Fila CSV base (sin color final)
 * @property {Array} imageUrlsFinal - URLs de imágenes seleccionadas
 * @property {string} colorFinal - Color determinado por las imágenes
 * @property {string} nombreFinal - Nombre del producto con color
 * @property {string} statusStock - 'pending' | 'processing' | 'done' | 'error'
 * @property {string} statusImages - 'pending' | 'processing' | 'done' | 'error'
 * @property {string} errorMessage - Mensaje de error si hay
 */

// =============================================
// NORMALIZACIÓN DE COLORES
// =============================================

function normalizeToValidColor(inputColor) {
    if (!inputColor) return '';
    const lower = inputColor.toLowerCase().trim();

    // 1. Si ya es válido, devolverlo
    if (UNIFIED_VALID_COLORS.includes(lower)) return lower;

    // 2. Mapeos directos (Inglés/Variantes/Códigos de proveedor -> Español válido)
    const map = {
        // Inglés -> Español
        'green': 'verde', 'olive': 'verde', 'khaki': 'verde', 'mint': 'verde', 'lime': 'verde',
        'blue': 'azul', 'navy': 'azul', 'teal': 'azul', 'indigo': 'azul', 'denim': 'azul',
        'red': 'rojo', 'crimson': 'rojo', 'brick': 'rojo', 'cherry': 'rojo', 'ruby': 'rojo',
        'pink': 'rosa', 'coral': 'rosa', 'fuchsia': 'rosa', 'peach': 'rosa', 'salmon': 'rosa',
        'purple': 'violeta', 'mauve': 'violeta', 'plum': 'violeta',
        'yellow': 'amarillo', 'gold': 'amarillo', 'lemon': 'amarillo',
        'orange': 'naranja', 'rust': 'naranja', 'apricot': 'naranja',
        'brown': 'marron', 'chocolate': 'marron', 'tan': 'marron', 'camel': 'marron', 'coffee': 'marron', 'cafe': 'marron',
        'white': 'blanco', 'ivory': 'blanco', 'cream': 'beige', 'off white': 'blanco', 'bone': 'beige',
        'ecru': 'beige', 'crudo': 'beige', 'natural': 'beige', 'arena': 'beige', 'sand': 'beige',
        'black': 'negro', 'noir': 'negro',
        'gray': 'gris', 'grey': 'gris', 'silver': 'gris', 'charcoal': 'gris', 'smoke': 'gris', 'graphite': 'gris',
        'burgundy': 'bordeaux', 'wine': 'bordeaux', 'vino': 'bordeaux', 'bordó': 'bordeaux',
        'lightblue': 'celeste', 'sky': 'celeste', 'baby blue': 'celeste',
        'lilac': 'lila', 'lavender': 'lila',
        'mustard': 'mostaza', 'tortoise': 'carey',
        'pattern': 'patron', 'print': 'patron', 'estampado': 'patron',
        'multi': 'multicolor', 'colorful': 'multicolor', 'varios': 'multicolor',
        // Códigos cortos de proveedor (3 letras)
        'blk': 'negro', 'wht': 'blanco', 'nvy': 'azul', 'gry': 'gris', 'grn': 'verde',
        'dgrn': 'verde', 'olv': 'verde', 'blu': 'azul', 'ablu': 'azul', 'ylw': 'amarillo',
        'org': 'naranja', 'pnk': 'rosa', 'beg': 'beige', 'brn': 'marron', 'cam': 'marron',
        'snd': 'beige', 'sil': 'gris', 'gld': 'amarillo', 'mul': 'multicolor', 'ecr': 'beige',
        'off': 'blanco', 'vbk': 'negro', 'viw': 'blanco', 'lil': 'lila',
        // Nombres compuestos
        'dark green': 'verde', 'air blue': 'celeste', 'sky blue': 'celeste',
        'vintage black': 'negro', 'vintage white': 'blanco'
    };

    // Check mapeo directo
    if (map[lower]) return map[lower];

    // 3. Buscar si contiene algún color válido (prioridad a palabras más largas)
    const sortedValid = [...UNIFIED_VALID_COLORS].sort((a, b) => b.length - a.length);
    for (const valid of sortedValid) {
        if (lower.includes(valid)) return valid;
    }

    // 4. Buscar palabras clave del mapa en el texto
    for (const [key, val] of Object.entries(map)) {
        if (lower.includes(key)) return val;
    }

    // 5. Sin match → vacío (NO devolver colores no válidos)
    console.log(`[Color] No se pudo normalizar: "${inputColor}" -> devolviendo vacío`);
    return '';
}

// =============================================
// UTILIDADES DE SKU Y NOMBRE
// =============================================

/**
 * Extrae el prefijo del modelo del SKU (sin código de color/talle)
 * Ej: "ABC123-BLU-M" -> "ABC123"
 *     "PROD456RED"   -> "PROD456"
 */
function extractModelPrefix(sku) {
    if (!sku || typeof sku !== 'string') return '';

    const cleanSku = sku.trim().toUpperCase();

    const colorCodes = [
        'BLK', 'WHT', 'RED', 'BLU', 'GRN', 'YEL', 'ORG', 'PNK', 'PUR', 'GRY', 'BRN', 'BGE',
        'NEGRO', 'BLANCO', 'ROJO', 'AZUL', 'VERDE', 'AMARILLO', 'NARANJA', 'ROSA', 'VIOLETA',
        'GRIS', 'MARRON', 'BEIGE', 'CELESTE', 'BORDEAUX', 'NAVY', 'TEAL', 'OLIVE'
    ];

    // Intentar separar por guión o underscore
    const parts = cleanSku.split(/[-_]/);

    if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1];
        const secondLast = parts.length > 2 ? parts[parts.length - 2] : '';

        const isTalle = /^(XS|S|M|L|XL|XXL|XXXL|\d{1,2})$/i.test(lastPart);
        const isColor = colorCodes.some(c => lastPart.includes(c) || secondLast.includes(c));

        if (isTalle || isColor) {
            let prefixParts = [...parts];
            if (isTalle) prefixParts.pop();
            if (isColor && prefixParts.length > 1) prefixParts.pop();
            return prefixParts.join('-');
        }
    }

    // Patrón letras + números
    const match = cleanSku.match(/^([A-Z]+\d+)/);
    if (match) return match[1];

    // Fallback: buscar código de color en el medio
    for (const code of colorCodes) {
        const idx = cleanSku.indexOf(code);
        if (idx > 3) {
            return cleanSku.substring(0, idx).replace(/[-_]$/, '');
        }
    }

    return cleanSku;
}

/**
 * Remueve colores del nombre del producto para obtener el modelo base
 * Ej: "Remera Surf Model X - Azul" -> "Remera Surf Model X"
 */
function removeColorFromName(name) {
    if (!name || typeof name !== 'string') return '';

    let cleanName = name.trim();

    // 1. Quitar sufijos tipo " - Color"
    cleanName = cleanName.replace(/ - [^-]+$/, '');

    // 2. Lista de colores a remover del final
    const colorsToRemove = [
        'negro', 'blanco', 'rojo', 'azul', 'verde', 'amarillo', 'naranja', 'rosa',
        'violeta', 'gris', 'marron', 'beige', 'celeste', 'bordeaux', 'mostaza',
        'carey', 'lila', 'multicolor', 'black', 'white', 'red', 'blue', 'green',
        'navy', 'teal', 'olive', 'khaki', 'charcoal'
    ];

    for (const color of colorsToRemove) {
        const regex = new RegExp(`\\s+${color}\\s*$`, 'i');
        cleanName = cleanName.replace(regex, '');
    }

    return cleanName.trim();
}

// =============================================
// PROCESAMIENTO UNIFICADO (PRINCIPAL)
// =============================================

async function processUnifiedFile() {
    if (!appState.workbook) {
        alert('Por favor sube un archivo Excel primero');
        return;
    }

    // Activar modo pantalla completa
    document.body.classList.add('mode-unified');
    const container = document.querySelector('.container');
    if (container) container.classList.add('expanded');

    // Reset estado
    unifiedState.rows = [];
    unifiedState.isProcessing = true;
    unifiedState.isCancelled = false;
    unifiedState.stockCache = {};

    // Mostrar sección de procesamiento
    const uploadSection = document.getElementById('uploadSection');
    const processingSection = document.getElementById('processingSection');
    const unifiedResultsSection = document.getElementById('unifiedResultsSection');

    if (uploadSection) uploadSection.style.display = 'none';
    if (processingSection) processingSection.style.display = 'block';
    if (unifiedResultsSection) unifiedResultsSection.style.display = 'none';

    elements.processingLog.innerHTML = '';
    addLog('🚀 Iniciando Modo Unificado (Vista Hoja de Cálculo)', 'info');

    try {
        // Leer datos del Excel
        const sheetName = appState.workbook.SheetNames[0];
        const sheet = appState.workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(sheet, {
            defval: '',
            raw: false,
            blankrows: false
        });

        if (jsonData.length === 0) {
            addLog('❌ El archivo está vacío', 'error');
            return;
        }

        const headersInFile = Object.keys(jsonData[0]);
        addLog(`📊 ${jsonData.length} filas detectadas`, 'info');

        // Detectar columnas con IA
        addLog('🤖 Detectando columnas con IA...', 'info');
        const columnMapping = await detectColumnsWithAI(headersInFile);

        if (!columnMapping || !columnMapping.nombre) {
            addLog('❌ No se pudo detectar la columna NOMBRE', 'error');
            return;
        }

        addLog(`✅ Columnas: SKU="${columnMapping.sku || '?'}", Nombre="${columnMapping.nombre}", Color="${columnMapping.color || '?'}"`, 'success');

        // Inicializar tabla
        initializeSpreadsheetTable(UNIFIED_FINAL_HEADERS);

        const processedSkus = new Set();
        let duplicadosCount = 0;

        // Inicializar estado por fila
        for (let i = 0; i < jsonData.length; i++) {
            const row = jsonData[i];

            const originalSku = columnMapping.sku && row[columnMapping.sku] ? String(row[columnMapping.sku]).trim() : '';
            const originalName = columnMapping.nombre && row[columnMapping.nombre] ? String(row[columnMapping.nombre]).trim() : '';
            const excelColor = columnMapping.color && row[columnMapping.color] ? String(row[columnMapping.color]).trim() : '';

            if (!originalName && !originalSku) continue;

            const cleanSku = removeSizeFromSKU(originalSku);

            // Deduplicación por SKU base
            if (cleanSku && processedSkus.has(cleanSku)) {
                duplicadosCount++;
                continue;
            }
            if (cleanSku) processedSkus.add(cleanSku);

            // Pre-llenar fila base
            const csvRowBase = {};
            UNIFIED_FINAL_HEADERS.forEach(h => csvRowBase[h] = '');
            csvRowBase['CODIGO_PRODUCTO'] = cleanSku;
            csvRowBase['NOMBRE_PRODUCTO'] = toTitleCase(originalName);
            csvRowBase['COLOR'] = excelColor; // Temporal hasta confirmar

            unifiedState.rows.push({
                index: unifiedState.rows.length,
                originalSku,
                cleanSku,
                originalName,
                excelColor,
                csvRowBase,
                imageUrlsFinal: [],
                colorFinal: '',
                nombreFinal: '',
                statusStock: 'pending',
                statusImages: 'pending',
                errorMessage: ''
            });

            addUnifiedRowToTable(unifiedState.rows[unifiedState.rows.length - 1], UNIFIED_FINAL_HEADERS);
        }

        if (duplicadosCount > 0) {
            addLog(`🧹 Se eliminaron ${duplicadosCount} variantes/duplicados`, 'warning');
        }

        document.getElementById('unifiedPreviewContainer').style.display = 'block';

        // Procesar cada fila
        for (let i = 0; i < unifiedState.rows.length; i++) {
            if (unifiedState.isCancelled) {
                addLog('⏹️ Procesamiento cancelado', 'error');
                break;
            }

            const rowState = unifiedState.rows[i];
            addLog(`📦 [${i + 1}/${unifiedState.rows.length}] Procesando: ${rowState.originalName}`, 'info');

            try {
                await processUnifiedStock(rowState);
                await processUnifiedImages(rowState);
                await finalizeColorFromImages(rowState);
                updateUnifiedRowInTable(rowState);
            } catch (error) {
                console.error('Error procesando fila:', error);
                rowState.errorMessage = error.message;
                rowState.statusStock = rowState.statusStock === 'pending' ? 'error' : rowState.statusStock;
                rowState.statusImages = rowState.statusImages === 'pending' ? 'error' : rowState.statusImages;
                updateUnifiedRowInTable(rowState);
            }

            if (i < unifiedState.rows.length - 1) {
                await delay(300);
            }
        }

        unifiedState.isProcessing = false;
        showUnifiedResults();

    } catch (error) {
        console.error('Error en modo unificado:', error);
        addLog(`❌ Error: ${error.message}`, 'error');
        unifiedState.isProcessing = false;
    }
}

// =============================================
// PASO 1: GENERAR FICHA DE STOCK (con Caché)
// =============================================

async function processUnifiedStock(rowState) {
    rowState.statusStock = 'processing';
    updateUnifiedRowInTable(rowState);

    addLog(`  📝 Generando ficha de stock...`, 'info');

    try {
        const manualBrand = elements.manualBrandInput ? elements.manualBrandInput.value.trim() : '';
        const analysisResult = await analyzeProductForStock(rowState.originalName, rowState.cleanSku, manualBrand, rowState.excelColor);

        // Agrupación por modelo (sin color) para caché
        const skuPrefix = extractModelPrefix(rowState.cleanSku);
        const modelName = removeColorFromName(analysisResult.standardizedName);

        const cacheKey = skuPrefix
            ? `${analysisResult.brand}|${skuPrefix}`.toUpperCase()
            : `${analysisResult.brand}|${modelName}`.toUpperCase();

        // Generar descripciones (con caché por modelo)
        let descriptions = { short: '', long: '' };
        let fromCache = false;

        if (unifiedState.stockCache[cacheKey]) {
            descriptions = unifiedState.stockCache[cacheKey];
            fromCache = true;
            addLog(`    ♻️ Descripción reutilizada (modelo: ${skuPrefix || modelName})`, 'info');
        } else {
            try {
                descriptions = await generateProductDescriptions(modelName, analysisResult.brand);
                unifiedState.stockCache[cacheKey] = descriptions;
                addLog(`    💾 Descripción guardada en caché (modelo: ${skuPrefix || modelName})`, 'info');
            } catch (err) {
                console.error('Error generating descriptions:', err);
            }
        }

        // Fecha actual
        const today = new Date();
        const formattedDate = `${String(today.getDate()).padStart(2, '0')}-${String(today.getMonth() + 1).padStart(2, '0')}-${today.getFullYear()}`;

        // Inferir columnas adicionales
        const fullDescription = `${descriptions.short} ${descriptions.long}`;

        rowState.csvRowBase = {
            'CODIGO_PRODUCTO': rowState.cleanSku,
            'CODIGO_VARIANTE': '',
            'CATEGORIA': analysisResult.category,
            'DESCRIPCION_CORTA': descriptions.short,
            'DESCRIPCION-LARGA': descriptions.long,
            'FECHA_AGREGADO': formattedDate,
            'SEXO': analysisResult.sex,
            'MARCA': analysisResult.brand,
            'NOMBRE_PRODUCTO': toTitleCase(analysisResult.standardizedName),
            'COLOR': '', // Se determina en PASO 3
            'HABILITADO': 'No',
            'LARGO-DEL-TRAJE': inferLargoDelTraje(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'GUIA_TALLES': inferGuiaTalles(analysisResult.brand, analysisResult.category, analysisResult.sex),
            'FIN-SET-UP': inferFinSetup(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'FIN-SYSTEM': inferFinSystem(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'TIPO-DE-BERMUDA': inferTipoDeBermuda(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'TIPO-DE-LENTES': inferTipoDeLentes(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'TAMANO': inferTamanoMochila(analysisResult.category, analysisResult.standardizedName, fullDescription),
            'TIPOS-DE-TABLAS': inferTiposDeTablas(analysisResult.category, analysisResult.standardizedName, fullDescription),
            _analysisResult: analysisResult
        };

        rowState.statusStock = 'done';
        if (fromCache) {
            updateUnifiedRowInTable(rowState);
        } else {
            addLog(`  ✅ Ficha de stock generada`, 'success');
        }

    } catch (error) {
        console.error('Error en stock:', error);
        rowState.statusStock = 'error';
        rowState.errorMessage = error.message;
        addLog(`  ❌ Error en stock: ${error.message}`, 'error');
    }
}

// =============================================
// PASO 2: BUSCAR IMÁGENES
// =============================================

async function processUnifiedImages(rowState) {
    rowState.statusImages = 'processing';
    updateUnifiedRowInTable(rowState);

    addLog(`  🔍 Buscando imágenes...`, 'info');

    try {
        const analysisResult = rowState.csvRowBase._analysisResult || {};

        const productForImages = {
            marca: analysisResult.brand || rowState.csvRowBase.MARCA || '',
            modelo: analysisResult.model || '',
            sku: rowState.originalSku || rowState.cleanSku || '',
            colorProv: rowState.excelColor || analysisResult.color || '',
            categoria: analysisResult.category || rowState.csvRowBase.CATEGORIA || '',
            nombreOriginal: rowState.originalName || ''
        };

        const images = await findImagesWithTestingLogic(productForImages);
        const validImages = images.filter(url => url && url.startsWith('http'));

        rowState.imageUrlsFinal = validImages.slice(0, 5);
        rowState.statusImages = validImages.length > 0 ? 'done' : 'error';

        if (validImages.length === 0) {
            rowState.errorMessage = 'No se encontraron imágenes';
        }

        addLog(`  📸 ${validImages.length} imágenes encontradas`, validImages.length > 0 ? 'success' : 'warning');

    } catch (error) {
        console.error('Error en imágenes:', error);
        rowState.statusImages = 'error';
        rowState.errorMessage = error.message;
        addLog(`  ❌ Error en imágenes: ${error.message}`, 'error');
    }
}

// =============================================
// PASO 3: DETERMINAR COLOR FINAL
// =============================================

async function finalizeColorFromImages(rowState) {
    if (rowState.statusStock !== 'done') return;

    addLog(`  🎨 Determinando color final...`, 'info');

    try {
        let colorFinal = '';

        // Prioridad 1: Color del Excel (proveedor)
        if (rowState.excelColor && rowState.excelColor.trim()) {
            let normalized = normalizeToValidColor(rowState.excelColor.trim());

            // Si no normalizó directo, intentar expandir con COLOR_CODES_MAPPING
            if (!normalized && typeof COLOR_CODES_MAPPING !== 'undefined') {
                const expanded = COLOR_CODES_MAPPING[rowState.excelColor.trim().toUpperCase()];
                if (expanded) {
                    normalized = normalizeToValidColor(expanded);
                    addLog(`    🔄 Color expandido: "${rowState.excelColor}" → "${expanded}" → "${normalized}"`, 'info');
                }
            }

            if (normalized) {
                colorFinal = normalized;
            } else {
                addLog(`    ⚠️ Color de proveedor "${rowState.excelColor}" no se pudo mapear a una opción válida`, 'warning');
            }
        }
        // Prioridad 2: Color detectado por análisis de stock
        else if (rowState.csvRowBase._analysisResult.color) {
            colorFinal = normalizeToValidColor(rowState.csvRowBase._analysisResult.color);
        }
        // Prioridad 3: Detectar color de la primera imagen
        else if (rowState.imageUrlsFinal.length > 0) {
            try {
                const description = await describeImageWithGemini(rowState.imageUrlsFinal[0], rowState.csvRowBase.CATEGORIA);
                const colorMatch = description.match(/\bcolor[:\s]+(\w+)/i) ||
                    description.match(/\b(negro|blanco|azul|rojo|verde|gris|amarillo|naranja|rosa|morado|marrón|beige)\b/i);

                if (colorMatch) {
                    colorFinal = normalizeToValidColor(colorMatch[1]);
                }
            } catch (e) {
                console.log('No se pudo detectar color de imagen:', e);
            }
        }

        // Actualizar estado
        rowState.colorFinal = colorFinal;
        rowState.csvRowBase.COLOR = colorFinal;

        // Actualizar nombre con color si aplica
        let finalName = rowState.csvRowBase.NOMBRE_PRODUCTO;

        if (colorFinal) {
            const colorFormatted = colorFinal.charAt(0).toUpperCase() + colorFinal.slice(1);

            if (!finalName.toLowerCase().includes(colorFinal.toLowerCase())) {
                const suffixPattern = / - [^-]+$/;

                if (suffixPattern.test(finalName)) {
                    finalName = finalName.replace(suffixPattern, ` - ${colorFormatted}`);
                } else {
                    finalName = `${finalName} ${colorFormatted}`;
                }
            }
        }

        rowState.nombreFinal = toTitleCase(finalName);
        rowState.csvRowBase.NOMBRE_PRODUCTO = rowState.nombreFinal;

        addLog(`  ✅ Color final: ${colorFinal || '(sin color)'}`, 'success');

    } catch (error) {
        console.error('Error determinando color:', error);
        addLog(`  ⚠️ No se pudo determinar color: ${error.message}`, 'warning');
    }
}

// =============================================
// UI: TABLA SPREADSHEET
// =============================================

function initializeSpreadsheetTable(headers) {
    const container = document.getElementById('unifiedPreviewContainer');
    if (!container) return;

    container.className = 'spreadsheet-section';
    container.style.display = 'block';

    const headerHtml = headers.map(h => `<th class="header-${h}">${h.replace(/_/g, ' ')}</th>`).join('');
    const imgHeaders = [1, 2, 3, 4, 5].map(i => `<th class="col-img-preview">IMG ${i}</th>`).join('');

    container.innerHTML = `
        <div class="expanded-status-bar" style="padding: 10px 20px; display:flex; justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:20px;">
                <h3 style="margin:0; font-size:16px;">Hoja de Cálculo en Vivo</h3>
                <div id="unifiedStatsBar" style="font-weight:bold; color:#2563eb; font-size:14px;">Inicializando...</div>
            </div>
            <div style="display:flex; gap:10px;">
                <button id="btnDlCsv" class="btn-action" disabled style="padding:5px 15px; border-radius:4px; cursor:pointer; background:#e2e8f0; border:1px solid #cbd5e1;">⬇ CSV Stock</button>
                <button id="btnDlZip" class="btn-action" disabled style="padding:5px 15px; border-radius:4px; cursor:pointer; background:#e2e8f0; border:1px solid #cbd5e1;">⬇ ZIP Imágenes</button>
                <button id="btnUnifiedNew" class="btn-action" style="padding:5px 15px; border-radius:4px; cursor:pointer; background:#fee2e2; border:1px solid #ef4444; color:#991b1b;">↻ Nuevo Archivo</button>
            </div>
        </div>
        <div class="spreadsheet-container">
            <table class="spreadsheet-table" id="unifiedRealTimeTable">
                <thead>
                    <tr>
                        <th style="min-width: 40px; text-align:center;">#</th>
                        <th class="col-status-stock">Stock</th>
                        <th class="col-status-img">Imgs</th>
                        ${headerHtml}
                        ${imgHeaders}
                    </tr>
                </thead>
                <tbody id="unifiedRealTimeTableBody"></tbody>
            </table>
        </div>
    `;

    // Vincular eventos de botones
    setTimeout(() => {
        const btnCsv = document.getElementById('btnDlCsv');
        const btnZip = document.getElementById('btnDlZip');
        const btnNew = document.getElementById('btnUnifiedNew');

        if (btnCsv) btnCsv.onclick = () => downloadUnifiedCsv();
        if (btnZip) btnZip.onclick = () => downloadUnifiedZip();
        if (btnNew) btnNew.onclick = () => {
            if (confirm('¿Estás seguro? Se perderán los datos actuales.')) {
                resetUnifiedMode();
            }
        };
    }, 100);
}

function addUnifiedRowToTable(rowState, headers) {
    const tableBody = document.getElementById('unifiedRealTimeTableBody');
    if (!tableBody) return;

    const tr = document.createElement('tr');
    tr.id = `unified-row-${rowState.index}`;

    const statusStock = `<td class="col-status-stock" id="status-stock-${rowState.index}"><span class="mini-badge pending">...</span></td>`;
    const statusImg = `<td class="col-status-img" id="status-img-${rowState.index}"><span class="mini-badge pending">...</span></td>`;
    const dataCells = headers.map(h => `<td id="cell-${rowState.index}-${h}" class="cell-empty"></td>`).join('');
    const imgCells = [1, 2, 3, 4, 5].map(i => `<td class="col-img-preview" id="preview-${rowState.index}-${i}">-</td>`).join('');

    tr.innerHTML = `
        <td style="text-align:center; color:#94a3b8; font-size:11px;">${rowState.index + 1}</td>
        ${statusStock}
        ${statusImg}
        ${dataCells}
        ${imgCells}
    `;

    tableBody.appendChild(tr);
    updateUnifiedRowInTable(rowState);
}

function updateUnifiedRowInTable(rowState) {
    const tr = document.getElementById(`unified-row-${rowState.index}`);
    if (!tr) return;

    // Actualizar badges de estado
    const stockBadge = document.getElementById(`status-stock-${rowState.index}`);
    const imgBadge = document.getElementById(`status-img-${rowState.index}`);

    if (stockBadge) {
        let cls = 'pending', txt = '...';
        if (rowState.statusStock === 'processing') { cls = 'processing'; txt = '⏳'; }
        if (rowState.statusStock === 'done') { cls = 'success'; txt = 'OK'; }
        if (rowState.statusStock === 'error') { cls = 'error'; txt = '✖'; }
        stockBadge.innerHTML = `<span class="mini-badge ${cls}">${txt}</span>`;
    }

    if (imgBadge) {
        let cls = 'pending', txt = '...';
        if (rowState.statusImages === 'processing') { cls = 'processing'; txt = '⏳'; }
        if (rowState.statusImages === 'done') { cls = 'success'; txt = `${rowState.imageUrlsFinal.length}`; }
        if (rowState.statusImages === 'error') { cls = 'error'; txt = '0'; }
        imgBadge.innerHTML = `<span class="mini-badge ${cls}">${txt}</span>`;
    }

    // Actualizar celdas de datos
    UNIFIED_FINAL_HEADERS.forEach(h => {
        const cell = document.getElementById(`cell-${rowState.index}-${h}`);
        if (cell) {
            const val = rowState.csvRowBase[h] || '';
            if (cell.textContent !== val) {
                cell.textContent = val;
                cell.className = val ? 'cell-filled' : 'cell-empty';
                cell.classList.add('cell-updated');
                setTimeout(() => cell.classList.remove('cell-updated'), 500);
            }
        }
    });

    // Actualizar imágenes
    rowState.imageUrlsFinal.forEach((url, idx) => {
        const imgCell = document.getElementById(`preview-${rowState.index}-${idx + 1}`);
        if (imgCell && !imgCell.querySelector('img') && url) {
            imgCell.innerHTML = `<a href="${url}" target="_blank"><img src="${url}" class="img-thumb-mini" loading="lazy"></a>`;
        }
    });
}

// =============================================
// RESULTADOS Y DESCARGAS
// =============================================

function showUnifiedResults() {
    const stockDone = unifiedState.rows.filter(r => r.statusStock === 'done').length;
    const totalImages = unifiedState.rows.reduce((sum, r) => sum + r.imageUrlsFinal.length, 0);

    const statsBar = document.getElementById('unifiedStatsBar');
    if (statsBar) {
        statsBar.innerHTML = `<span style="color:#166534">✅ PROCESO COMPLETADO: ${stockDone} productos OK, ${totalImages} imágenes encontradas.</span>`;
    }

    // Habilitar botones de descarga
    const btnCsv = document.getElementById('btnDlCsv');
    const btnZip = document.getElementById('btnDlZip');

    if (btnCsv) {
        btnCsv.disabled = false;
        btnCsv.style.background = '#3b82f6';
        btnCsv.style.color = 'white';
        btnCsv.style.border = '1px solid #2563eb';
    }

    if (btnZip) {
        btnZip.disabled = false;
        btnZip.style.background = '#3b82f6';
        btnZip.style.color = 'white';
        btnZip.style.border = '1px solid #2563eb';
    }

    addLog(`🎉 Modo Unificado completado: ${stockDone} fichas, ${totalImages} imágenes`, 'success');
}

function downloadUnifiedCsv() {
    if (unifiedState.rows.length === 0) return;

    const data = unifiedState.rows.map(r => r.csvRowBase);
    const separator = ',';
    const csvRows = [];

    // Headers
    csvRows.push(UNIFIED_FINAL_HEADERS.map(h => `"${h}"`).join(separator));

    // Data rows
    data.forEach(row => {
        const values = UNIFIED_FINAL_HEADERS.map(header => {
            let val = row[header];
            if (val === null || val === undefined) {
                val = '';
            } else {
                val = String(val);
            }
            // Escapar comillas internas
            val = val.replace(/"/g, '""');
            return `"${val}"`;
        });
        csvRows.push(values.join(separator));
    });

    const csvContent = csvRows.join('\n');

    // UTF-8 BOM + contenido para compatibilidad con Fenicio y Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `Stock_Generado_Completo_${timestamp}.csv`;

    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    addLog(`⬇ CSV descargado: ${filename}`, 'success');
}

async function downloadUnifiedZip() {
    if (unifiedState.rows.length === 0) return;

    addLog('📦 Preparando ZIP...', 'info');
    const zip = new JSZip();
    const folder = zip.folder("imagenes");

    let count = 0;
    for (const row of unifiedState.rows) {
        for (let i = 0; i < row.imageUrlsFinal.length; i++) {
            const url = row.imageUrlsFinal[i];
            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const ext = url.split('.').pop().split('?')[0] || 'jpg';
                folder.file(`${row.cleanSku}_${i + 1}.${ext}`, blob);
                count++;
            } catch (e) {
                console.error('Error downloading img for zip:', e);
            }
        }
    }

    if (count === 0) {
        alert('No hay imágenes para descargar');
        return;
    }

    zip.generateAsync({ type: "blob" }).then(function (content) {
        saveAs(content, "imagenes_stock.zip");
        addLog('✅ ZIP descargado', 'success');
    });
}

function resetUnifiedMode() {
    unifiedState.rows = [];
    unifiedState.isProcessing = false;
    unifiedState.stockCache = {};

    document.getElementById('unifiedPreviewContainer').style.display = 'none';
    document.getElementById('unifiedRealTimeTableBody').innerHTML = '';

    const btnCsv = document.getElementById('btnDlCsv');
    if (btnCsv) {
        btnCsv.disabled = true;
        btnCsv.style.background = '#e2e8f0';
        btnCsv.style.color = 'black';
        btnCsv.style.border = '1px solid #cbd5e1';
    }

    const uploadSection = document.getElementById('uploadSection');
    if (uploadSection) uploadSection.style.display = 'block';

    addLog('🔄 Modo unificado reiniciado', 'info');
}

// =============================================
// INICIALIZACIÓN AL CARGAR
// =============================================

(function () {
    console.log('[UnifiedMode V2] Inicializando...');
    const btn = document.getElementById('processUnifiedBtn');
    if (btn) {
        console.log('[UnifiedMode V2] Botón encontrado, atando listener...');
        btn.addEventListener('click', processUnifiedFile);
    } else {
        console.warn('[UnifiedMode V2] Botón processUnifiedBtn NO encontrado en el DOM');
        document.addEventListener('DOMContentLoaded', function () {
            const btn = document.getElementById('processUnifiedBtn');
            if (btn) btn.addEventListener('click', processUnifiedFile);
        });
    }
})();
