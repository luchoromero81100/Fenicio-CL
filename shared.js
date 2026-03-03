// =============================================
// CONFIGURACIÓN PRINCIPAL (COMPARTIDA)
// =============================================
// Las API Keys se cargan desde el backend (/api/config)
// El backend las lee del archivo .env de forma segura

// Almacén interno de keys (se llena al iniciar)
window._API_KEYS = {};

// Cargar keys desde el backend
async function loadAPIKeys() {
    try {
        const response = await fetch('/api/config');
        if (response.ok) {
            window._API_KEYS = await response.json();
            console.log('✅ API Keys cargadas desde el servidor');
        } else {
            console.error('❌ No se pudieron cargar las API Keys del servidor');
        }
    } catch (e) {
        console.error('❌ Backend no disponible. Ejecutá: cd server && npm start');
    }
}

const CONFIG = {
    // API Keys - Se cargan desde el backend
    get GOOGLE_API_KEY() { return window._API_KEYS?.GOOGLE_API_KEY || ''; },
    get GOOGLE_CSE_ID() { return window._API_KEYS?.GOOGLE_CSE_ID || ''; },
    get OPENAI_API_KEY() { return window._API_KEYS?.OPENAI_API_KEY || ''; },
    get GEMINI_API_KEY() { return window._API_KEYS?.GEMINI_API_KEY || ''; },
    get REMOVEBG_API_KEY() { return window._API_KEYS?.REMOVEBG_API_KEY || ''; },

    // Configuración de búsqueda
    IMAGES_PER_ITEM: 5,
    IMAGES_PER_QUERY: 10,
    MAX_TOTAL_CANDIDATES: 40,
    MAX_CANDIDATES_FOR_AI: 20,
    IMAGE_LOAD_TIMEOUT: 3000,
    DELAY_BETWEEN_REQUESTS: 300,
    DELAY_BETWEEN_PRODUCTS: 1000,

    // Configuración de IA
    ENABLE_GEMINI_FALLBACK: true,
    AI_MODEL: 'gpt-4o-mini',

    // Otros
    WHITE_BACKGROUND_ONLY: false,
    REMOVE_BACKGROUND: false
};

// =============================================
// AI REQUEST QUEUE - Control de concurrencia y retry
// =============================================
const AIRequestQueue = {
    concurrency: 1,
    activeRequests: 0,
    queue: [],

    // Backoff exponencial con jitter
    async wait(attempt) {
        const baseDelay = 1000;
        const maxDelay = 30000;
        const delay = Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
        const jitter = delay * (0.5 + Math.random() * 0.5);
        await new Promise(r => setTimeout(r, jitter));
    },

    // Wrapper principal con retry
    async callWithRetry(fn, maxAttempts = 3) {
        return new Promise((resolve, reject) => {
            this.queue.push({ fn, maxAttempts, resolve, reject, attempt: 0 });
            this.processQueue();
        });
    },

    async processQueue() {
        if (this.activeRequests >= this.concurrency || this.queue.length === 0) return;

        this.activeRequests++;
        const task = this.queue.shift();
        const startTime = Date.now();

        try {
            const result = await this.executeWithRetry(task);
            const elapsed = Date.now() - startTime;
            console.log(`[AIQueue] Request completado en ${elapsed}ms`);
            task.resolve(result);
        } catch (error) {
            task.reject(error);
        } finally {
            this.activeRequests--;
            this.processQueue();
        }
    },

    async executeWithRetry(task) {
        while (task.attempt < task.maxAttempts) {
            try {
                const response = await task.fn();

                // Si es Response object, verificar status
                if (response instanceof Response) {
                    if (response.status === 429 || response.status >= 500) {
                        const retryAfter = response.headers.get('Retry-After');
                        if (retryAfter) {
                            await new Promise(r => setTimeout(r, parseInt(retryAfter) * 1000));
                        } else {
                            await this.wait(task.attempt);
                        }
                        task.attempt++;
                        continue;
                    }
                }
                return response;
            } catch (error) {
                task.attempt++;
                if (task.attempt >= task.maxAttempts) throw error;
                await this.wait(task.attempt);
            }
        }
        throw new Error('Max retry attempts reached');
    }
};

// =============================================
// CACHE EN MEMORIA CON TTL
// =============================================
const AICache = {
    brandModelCache: new Map(),
    commonBrandCache: new Map(),
    imageRankCache: new Map(),
    TTL: 30 * 60 * 1000, // 30 minutos

    set(cache, key, value) {
        cache.set(key, { value, timestamp: Date.now() });
    },

    get(cache, key) {
        const entry = cache.get(key);
        if (!entry) return null;
        if (Date.now() - entry.timestamp > this.TTL) {
            cache.delete(key);
            return null;
        }
        return entry.value;
    },

    // Generar hash simple para arrays
    hashArray(arr) {
        return arr.slice(0, 10).join('|').substring(0, 200);
    }
};

// =============================================
// UTILIDADES COMPARTIDAS
// =============================================
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Convertir texto a Title Case (primera letra de cada palabra en mayúscula)
function toTitleCase(str) {
    if (!str || typeof str !== 'string') return str || '';
    return str
        .toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

const PRODUCT_CATEGORIES = [
    'Remera', 'Musculosa', 'Polo', 'Camisa', 'Buzo', 'Sweater', 'Campera', 'Chaleco',
    'Pantalon', 'Jeans', 'Short', 'Bermuda', 'Pollera', 'Vestido',
    'Calzado', 'Zapatillas', 'Botas', 'Ojotas', 'Sandalias',
    'Gorra', 'Gorro', 'Sombrero',
    'Mochila', 'Bolso', 'Billetera', 'Cinto', 'Medias', 'Ropa Interior', 'Traje de Baño', 'Accesorios'
];

// Mapeo de categorías español → inglés para búsqueda de imágenes
const CATEGORY_TO_ENGLISH = {
    'Remera': 'tee',
    'Musculosa': 'tank top',
    'Polo': 'polo',
    'Camisa': 'shirt',
    'Buzo': 'hoodie',
    'Sweater': 'sweater',
    'Campera': 'jacket',
    'Chaleco': 'vest',
    'Pantalon': 'pants',
    'Jeans': 'jeans',
    'Short': 'shorts',
    'Bermuda': 'shorts',
    'Pollera': 'skirt',
    'Vestido': 'dress',
    'Championes': 'shoes',
    'Botas': 'boots',
    'Ojotas': 'flip flops',
    'Sandalias': 'sandals',
    'Gorra': 'cap',
    'Gorro lana': 'beanie',
    'Sombrero': 'hat',
    'Mochila': 'backpack',
    'Bolso': 'bag',
    'Billetera': 'wallet',
    'Cinto': 'belt',
    'Medias': 'socks',
    'Ropa Interior': 'underwear',
    'Traje de Baño': 'swimwear',
    'Accesorios': 'accessories'
};

// Detectar tipo de manga del nombre/categoría del producto
// MC = Manga Corta, ML = Manga Larga, SM = Sin Manga
function detectSleeveType(nombreProducto, categoria) {
    const texto = `${nombreProducto} ${categoria}`.toUpperCase();

    // Búsqueda exacta de códigos
    if (/\bMC\b/.test(texto) || /MANGA\s*CORTA/i.test(texto) || /SHORT\s*SLEEVE/i.test(texto)) {
        return 'corta';
    }
    if (/\bML\b/.test(texto) || /MANGA\s*LARGA/i.test(texto) || /LONG\s*SLEEVE/i.test(texto)) {
        return 'larga';
    }
    if (/\bSM\b/.test(texto) || /SIN\s*MANGA/i.test(texto) || /SLEEVELESS/i.test(texto) || /MUSCULOSA/i.test(texto) || /TANK/i.test(texto)) {
        return 'sin_manga';
    }

    // No se especifica tipo de manga
    return null;
}

// Mapeo de códigos de color a nombres completos en inglés para búsquedas
const COLOR_CODES_MAPPING = {
    'LIL': 'LILAC',
    'BLK': 'BLACK',
    'WHT': 'WHITE',
    'NVY': 'NAVY',
    'GRY': 'GREY',
    'GRN': 'GREEN',
    'DGRN': 'DARK GREEN',
    'OLV': 'OLIVE',
    'RED': 'RED',
    'BLU': 'BLUE',
    'ABLU': 'AIR BLUE',
    'SKY': 'SKY BLUE',
    'YLW': 'YELLOW',
    'ORG': 'ORANGE',
    'PNK': 'PINK',
    'BEG': 'BEIGE',
    'BRN': 'BROWN',
    'CAM': 'CAMEL',
    'SND': 'SAND',
    'SIL': 'SILVER',
    'GLD': 'GOLD',
    'MUL': 'MULTICOLOR',
    'ECR': 'ECRU',
    'OFF': 'OFF WHITE',
    'VBK': 'VINTAGE BLACK',
    'VIW': 'VINTAGE WHITE'
};

// Estado de la aplicación (compartido)
let appState = {
    currentFile: null,
    workbook: null,
    analyzedData: [], // Datos después del análisis con IA
    processedData: [], // Datos después del enriquecimiento (corregido de processsedData)
    isProcessing: false,
    isCancelled: false, // Flag to cancel processing
    isPaused: false,    // Flag to pause processing
    skipToResults: false, // Flag to skip remaining and go to results
    currentMode: 'images', // 'images' or 'stock'
    processedStock: []
};

// Elementos DOM (compartidos)
const elements = {
    downloadTemplateBtn: document.getElementById('downloadTemplateBtn'),
    fileInput: document.getElementById('fileInput'),
    uploadArea: document.getElementById('uploadArea'),
    fileInfo: document.getElementById('fileInfo'),
    fileName: document.getElementById('fileName'),
    fileMeta: document.getElementById('fileMeta'),
    removeFile: document.getElementById('removeFile'),
    analyzeBtn: document.getElementById('analyzeBtn'),
    uploadSection: document.getElementById('uploadSection'),
    analysisSection: document.getElementById('analysisSection'),
    processingSection: document.getElementById('processingSection'),
    resultsSection: document.getElementById('resultsSection'),
    productsTableBody: document.getElementById('productsTableBody'),
    headerCheckbox: document.getElementById('headerCheckbox'),
    selectAllBtn: document.getElementById('selectAllBtn'),
    deselectAllBtn: document.getElementById('deselectAllBtn'),
    selectedCount: document.getElementById('selectedCount'),
    totalProductsCount: document.getElementById('totalProductsCount'),
    backToUploadBtn: document.getElementById('backToUploadBtn'),
    enrichBtn: document.getElementById('enrichBtn'),
    progressFill: document.getElementById('progressFill'),
    progressText: document.getElementById('progressText'),
    processedCount: document.getElementById('processedCount'),
    totalCount: document.getElementById('totalCount'),
    currentItemName: document.getElementById('currentItemName'),
    processingLog: document.getElementById('processingLog'),
    resultsPreviewTableBody: document.getElementById('resultsPreviewTableBody'),
    finalResultsTableBody: document.getElementById('finalResultsTableBody'),
    totalProcessed: document.getElementById('totalProcessed'),
    totalImages: document.getElementById('totalImages'),
    removeBgBtn: document.getElementById('removeBgBtn'),
    aiSortBtn: document.getElementById('aiSortBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    newFileBtn: document.getElementById('newFileBtn'),
    // Stock Mode Elements
    modeTabs: document.querySelectorAll('.mode-tab'),
    processStockBtn: document.getElementById('processStockBtn'),
    stockResultsSection: document.getElementById('stockResultsSection'),
    processedStockCount: document.getElementById('processedStockCount'),
    downloadStockBtn: document.getElementById('downloadStockBtn'),
    newStockFileBtn: document.getElementById('newStockFileBtn'),
    uploadTitle: document.getElementById('uploadTitle'),
    uploadDescription: document.getElementById('uploadDescription'),
    brandInputContainer: document.getElementById('brandInputContainer'),
    manualBrandInput: document.getElementById('manualBrandInput'),
    stockPreviewTableBody: document.getElementById('stockPreviewTableBody'),
    // Real-time preview containers
    imagesPreviewContainer: document.getElementById('imagesPreviewContainer'),
    stockPreviewContainer: document.getElementById('stockPreviewContainer'),
    stockRealTimeTableBody: document.getElementById('stockRealTimeTableBody'),
    // Processing control buttons
    cancelProcessBtn: document.getElementById('cancelProcessBtn'),
    pauseProcessBtn: document.getElementById('pauseProcessBtn'),
    skipToResultsBtn: document.getElementById('skipToResultsBtn')
};

// Add log entry
function addLog(message, type = 'info') {
    // Fallback a consola siempre
    console.log(`[${type.toUpperCase()}]`, message);

    // Intentar agregar al UI si existe
    const logContainer = elements.processingLog || document.getElementById('processingLog');
    if (logContainer) {
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry ${type}`;
        logEntry.style.cssText = `padding: 2px 0; color: ${type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : type === 'warning' ? '#f59e0b' : '#94a3b8'};`;
        logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
        logContainer.appendChild(logEntry);
        // Auto-scroll al final
        logContainer.scrollTop = logContainer.scrollHeight;
    }
}

// =============================================
// FUNCIONES DE ARCHIVO (COMPARTIDAS)
// =============================================

// Handle file selection
function handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
}

// Handle file
function handleFile(file) {
    if (!file.name.match(/\.(xlsx|xls|csv)$/i)) {
        alert('Por favor selecciona un archivo válido (.xlsx, .xls o .csv)');
        return;
    }

    appState.currentFile = file;

    // Show file info
    elements.fileName.textContent = file.name;
    elements.fileMeta.textContent = `${(file.size / 1024).toFixed(2)} KB`;
    elements.fileInfo.style.display = 'flex';
    elements.uploadArea.style.display = 'none';
    elements.analyzeBtn.disabled = false;
    if (elements.processStockBtn) elements.processStockBtn.disabled = false;
    if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').disabled = false;

    // Read file
    readExcelFile(file);
}

// Read Excel file
function readExcelFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            // Opciones para forzar lectura como string/texto
            const workbook = XLSX.read(data, {
                type: 'array',
                raw: true,           // Leer valores raw
                cellText: true,      // Forzar como texto
                cellDates: false,    // No parsear fechas
                cellNF: false,       // No aplicar formatos numéricos
                cellStyles: false    // Ignorar estilos
            });
            appState.workbook = workbook;

            addLog(`Archivo cargado: ${file.name}`, 'success');
        } catch (error) {
            console.error('Error reading Excel:', error);
            alert('Error al leer el archivo Excel. Asegúrate de que sea un archivo válido.');
            resetFileUpload();
        }
    };

    reader.readAsArrayBuffer(file);
}

// Reset file upload
function resetFileUpload() {
    elements.fileInput.value = '';
    elements.fileInfo.style.display = 'none';
    elements.uploadArea.style.display = 'block';
    elements.analyzeBtn.disabled = true;
    if (elements.processStockBtn) elements.processStockBtn.disabled = true;
    if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').disabled = true;
    appState.currentFile = null;
    appState.workbook = null;
}

// Remove size suffix from SKU  
function removeSizeFromSKU(sku) {
    if (!sku || typeof sku !== 'string') return sku;

    const originalSKU = sku.trim();

    // Patrones de talles a detectar y eliminar:
    const sizePatterns = [
        /-\d+$/,                    // Números al final: -4, -425, -42
        /-U$/i,                      // -U (talla única)
        /-[SMLX]{1,4}$/i,           // -S, -M, -L, -XL, -XXL, -XXXL
        /-\d*X[LS]$/i,              // -XS, -2XL, -3XL, etc.
        /-[SMLX]{1,4}-\w+$/i,       // -L-BLUE, -M-RED (talle + color)
    ];

    let cleanedSKU = originalSKU;

    // Intentar cada patrón
    for (const pattern of sizePatterns) {
        const match = cleanedSKU.match(pattern);
        if (match) {
            cleanedSKU = cleanedSKU.replace(pattern, '');
            // Log only if something was removed
            if (cleanedSKU !== originalSKU) {
                console.log(`SKU limpiado: "${originalSKU}" → "${cleanedSKU}" (se removió talle)`);
            }
            break; // Solo remover el primer match
        }
    }

    return cleanedSKU;
}

// Reset app
function resetApp() {
    elements.resultsSection.style.display = 'none';
    elements.stockResultsSection.style.display = 'none';
    if (document.getElementById('unifiedResultsSection')) document.getElementById('unifiedResultsSection').style.display = 'none';
    elements.uploadSection.style.display = 'block';
    elements.processingLog.innerHTML = '';
    elements.progressFill.style.width = '0%';
    elements.progressText.textContent = '0%';
    elements.processedCount.textContent = '0';
    elements.totalCount.textContent = '0';

    appState.analyzedData = [];
    appState.processedData = [];
    appState.processedStock = [];
    resetFileUpload();

    // Reset analyze button
    elements.analyzeBtn.innerHTML = `
        Analizar Productos con IA
    `;

    // Ensure UI is correct for mode
    if (appState.currentMode === 'stock') {
        elements.analyzeBtn.style.display = 'none';
        elements.processStockBtn.style.display = 'block';
        if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').style.display = 'none';
        elements.downloadTemplateBtn.style.display = 'none';
        if (elements.uploadTitle) elements.uploadTitle.textContent = 'Generador de Stock';
        if (elements.brandInputContainer) elements.brandInputContainer.style.display = 'block';
    } else if (appState.currentMode === 'unified') {
        elements.analyzeBtn.style.display = 'none';
        elements.processStockBtn.style.display = 'none';
        if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').style.display = 'block';
        elements.downloadTemplateBtn.style.display = 'none';
        if (elements.uploadTitle) elements.uploadTitle.textContent = 'Modo Unificado (Stock + Imágenes)';
        if (elements.brandInputContainer) elements.brandInputContainer.style.display = 'block';
    } else {
        elements.analyzeBtn.style.display = 'block';
        elements.processStockBtn.style.display = 'none';
        if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').style.display = 'none';
        elements.downloadTemplateBtn.style.display = 'flex';
        if (elements.uploadTitle) elements.uploadTitle.textContent = 'Sube tu archivo Excel';
        if (elements.brandInputContainer) elements.brandInputContainer.style.display = 'none';
    }

    // Clear input
    if (elements.manualBrandInput) elements.manualBrandInput.value = '';
}

// =============================================
// FUNCIONES IA COMPARTIDAS
// =============================================

// Helper: Convert Blob to Base64
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// Helper: Fetch image with CORS proxy fallback
async function fetchImageAsBase64(imageUrl) {
    try {
        // Intento directo
        const response = await fetch(imageUrl);
        if (response.ok) {
            const blob = await response.blob();
            return await blobToBase64(blob);
        }
    } catch (e) {
        // Falló directo (CORS?), intentar con proxy
    }

    try {
        // Intento con Proxy
        const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(imageUrl);
        const response = await fetch(proxyUrl);
        if (response.ok) {
            const blob = await response.blob();
            return await blobToBase64(blob);
        }
    } catch (e) {
        console.error('Error fetching image for Gemini:', e);
    }
    return null;
}

// Detect common brand from a list of product names using AI
async function detectCommonBrandWithAI(productNames) {
    try {
        // Take a sample of up to 10 names to analyze
        const sampleSize = Math.min(productNames.length, 10);
        const sampleNames = productNames.slice(0, sampleSize).join('\n');

        const prompt = `Analiza esta lista de nombres de productos y detecta la MARCA COMÚN que aparece SIEMPRE al principio de cada nombre.

LISTA DE PRODUCTOS:
${sampleNames}

INSTRUCCIONES:
1. Identifica el texto constante que se repite al inicio de todos los items.
2. Esa es la MARCA.
3. Responde SOLO con el nombre de la marca exacta, sin comillas ni explicaciones.
4. Si no hay un patrón claro o marca común, responde "NINGUNA".

Ejemplo:
Input:
NIKE REMERA DRY FIT
NIKE PANTALON CORTO

Respuesta:
NIKE`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: 'Eres un experto en identificar estructuras de datos de productos. Responde solo con la marca detectada.' },
                    { role: 'user', content: prompt }
                ],
                max_tokens: 50,
                temperature: 0.1
            })
        });

        if (!response.ok) return null;

        const data = await response.json();
        let result = data.choices[0]?.message?.content?.trim();

        // Limpiar comillas si las hay
        result = result.replace(/^["']|["']$/g, '');

        if (!result || result.toUpperCase() === 'NINGUNA') return null;

        return result;

    } catch (error) {
        console.error('Error detecting common brand:', error);
        return null;
    }
}

// Extract brand and model using OpenAI (with cache)
async function extractBrandAndModel(productName) {
    // Check cache first
    const cached = AICache.get(AICache.brandModelCache, productName);
    if (cached) {
        console.log('[Cache] extractBrandAndModel hit');
        return cached;
    }

    try {
        const response = await AIRequestQueue.callWithRetry(async () => {
            return await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini',
                    messages: [
                        {
                            role: 'system',
                            content: 'Eres un experto en identificar marcas y modelos de productos. Extrae la MARCA (brand en inglés como Adidas, Nike, Vans, Puma, Rip Curl, etc) y el MODELO (como Samba, Campus, Old Skool, Air Max, etc) del nombre del producto. Responde SOLO en formato JSON: {"brand": "MARCA", "model": "MODELO"}. Si no puedes identificar claramente la marca o modelo, usa el nombre completo como modelo y deja la marca vacía.'
                        },
                        {
                            role: 'user',
                            content: `Extrae la marca y modelo de: "${productName}"`
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 100
                })
            });
        });

        if (!response.ok) {
            throw new Error(`OpenAI API error: ${response.status}`);
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content?.trim();

        // Parse JSON response
        const result = JSON.parse(content);

        const extracted = {
            brand: result.brand || '',
            model: result.model || productName
        };

        // Save to cache
        AICache.set(AICache.brandModelCache, productName, extracted);

        return extracted;
    } catch (error) {
        console.error('Error extracting brand and model:', error);
        // Fallback: use the whole product name as model
        return {
            brand: '',
            model: productName
        };
    }
}

// Extract product category from name and translate to English
function extractProductCategory(productName) {
    const name = String(productName || '').toLowerCase();

    // Categorías a detectar (español → inglés)
    const categoryMap = {
        'remera': 'tee',
        'polera': 'tee',
        'camiseta': 'tee',
        'playera': 'tee',
        't-shirt': 'tee',
        'tshirt': 'tee',
        'gorro': 'cap',
        'gorra': 'cap',
        'visera': 'cap',
        'sombrero': 'hat',
        'campera': 'jacket',
        'chaqueta': 'jacket',
        'jacket': 'jacket',
        'buzo': 'hoodie',
        'hoodie': 'hoodie',
        'sudadera': 'hoodie',
        'pantalon': 'pants',
        'jean': 'jeans',
        'short': 'shorts',
        'bermuda': 'shorts',
        'medias': 'socks',
        'calcetines': 'socks',
        'mochila': 'backpack',
        'bolso': 'bag',
        // Ignorar estas categorías (devolver null)
        'championes': null,
        'zapatillas': null,
        'zapatos': null,
        'botas': null,
        'calzado': null
    };

    // Buscar cada categoría en el nombre del producto
    for (const [spanish, english] of Object.entries(categoryMap)) {
        if (name.includes(spanish)) {
            return english; // Puede ser string o null
        }
    }

    return null; // No se encontró categoría
}
