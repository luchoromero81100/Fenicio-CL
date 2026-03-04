// =============================================
// STOCK GENERATOR - Generador de Stock
// Requiere: shared.js cargado previamente
// =============================================

// =============================================
// NUEVAS COLUMNAS - VALORES VÁLIDOS
// =============================================

// 1. LARGO-DEL-TRAJE (solo para surf/trajes/*)
const VALID_LARGO_TRAJE = [
    'corto-1-5', 'corto-2-2', 'largo-2-2', 'largo-3-2',
    'largo-4-3', 'largo-5-3', 'largo-5-4'
];

// 2. GUIA_TALLES (autocompletar con alta certeza)
const VALID_GUIA_TALLES = [
    'adidascalzadoadultos', 'birkenstock', 'quiksilvercalzado', 'uggcalzado',
    'calzadovans', 'ripcurlcalzado', 'salomoncalzado', 'adidascalzadoninos',
    'vanscalzadoninos', 'genericavestimentatopmujeres', 'genericavestimentatophombres',
    'genericavestimentatopninos', 'huntercalzado', 'newbalancecalzado', 'ripcurlguantes',
    'calzadoteva', 'blunstonecalzado', 'flyingeaglerollers', 'flyingeaglerollersninos',
    'mantabodyboards', 'cskinstrajes', 'xcelbotitas', 'calzadoconverse',
    'rollerderbyrollers', 'xceltrajeshombre', 'xceltrajesmujer', 'xceltrajesninos',
    'billabongtrajeshombre', 'billabongtrajesmujer', 'hurleytrajeshombres',
    'hurleytrajesmujer', 'hurleytrajesninos', 'hurleybotitas', 'ripcurlbikinisninas',
    'lycrasninos', 'bikinisninas', 'rollerderbyrollersninos', 'genericaprotecciones',
    'genericaproteccionesninos', 'ripcurlcalzadoo', 'reefcalzado', 'tevacalzado',
    'calzadovibram', 'calzadosaucony', 'calzadoripcurlninos', 'rustyvestimentatop',
    'florencemarinexvestimentatop', 'cariuma-calzado', 'kankenmochilas',
    'hydroflaskbotellasstandarywide', 'hydroflasktazas', 'hyrdofalskvasos',
    'hydroflaskinsulatedfoods', 'hydroflaskchugcup', 'hydroflaskkids',
    'hydroflaskconstraw', 'dickiesremerasmujer', 'dickiesremerashombre',
    'dickiesabrigos', 'dickiespantaloneshombre', 'dickiespantalonesmujer',
    'dickiesenteritosmujer', 'dickiesenteritoshombres', 'adidasadilette',
    'volcomojotasninos', 'volcomojotasadultos', 'rhythmvestimentatopmujer',
    'rhythmvestimentatophombre', 'genericavestimentaabajomujer',
    'genericavestimentaabajohombre', 'rustyvestimentatopmujeres', 'genericatrajes',
    'genericatrajesmujer', 'genericatrajesninos', 'genericacapuchas',
    'genericaguantes', 'genericabotitas'
];

// 3. FIN-SET-UP (solo para surf/quillas)
const VALID_FIN_SETUP = ['single', 'twin', 'quad', 'thruster', '2-1'];

// 4. FIN-SYSTEM (solo para surf/quillas)
const VALID_FIN_SYSTEM = [
    'futures', 'fcs-2', 'fcs', 'longboard', 'softboard',
    'futures,longboard', 'fcs-2,longboard', 'fcs,longboard'
];

// 5. TIPO-DE-BERMUDA (solo para vestimenta/bermudas/*)
const VALID_TIPO_BERMUDA = [
    'voley-14', 'voley-15', 'voley-16', 'voley-17',
    'largo-18', 'largo-19', 'largo-20', 'largo-21', 'largo-22'
];


// 6. TIPO-DE-LENTES (solo para accesorios/lentes)
const VALID_TIPO_LENTES = ['polarizado', 'no-polarizado', 'lectura'];

// 7. TAMANO (solo para mochilas)
const VALID_TAMANO_MOCHILA = ['chica', 'mediana', 'grande'];

// 8. TIPOS-DE-TABLAS (solo para skates)
const VALID_TIPOS_TABLAS = ['street', 'longboard', 'surf-skates', 'cruiser'];

// =============================================
// FUNCIONES DE INFERENCIA NUEVAS COLUMNAS
// =============================================

/**
 * Infiere LARGO-DEL-TRAJE para trajes de neoprene
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferLargoDelTraje(category, name, description) {
    // Solo aplica para surf/trajes
    if (!category || !category.startsWith('surf/trajes')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Detectar grosor (3/2, 4/3, 5/4, etc.)
    const thicknessMatch = text.match(/(\d)[\/-](\d)/g);
    let thickness = '';
    if (thicknessMatch && thicknessMatch.length > 0) {
        // Tomar el primer match de grosor
        const match = thicknessMatch[0].replace('/', '-');
        thickness = match; // ej: "3-2", "4-3"
    }

    // Detectar si es corto o largo
    const isShort = /shorty|short|manga corta|pierna corta|spring|springsui/i.test(text);
    const isLong = /full|fullsuit|steamer|manga larga|pierna larga|wetsuit completo/i.test(text);

    // Si no hay indicadores claros, no inferir
    if (!isShort && !isLong && !thickness) {
        return '';
    }

    // Mapear combinaciones válidas
    if (isShort) {
        if (thickness === '2-2') return 'corto-2-2';
        if (thickness === '1-5' || text.includes('1.5') || text.includes('1/5')) return 'corto-1-5';
        // Si es corto pero no tenemos grosor claro, no inferir
        if (!thickness) return '';
    }

    if (isLong || (!isShort && thickness)) {
        if (thickness === '2-2') return 'largo-2-2';
        if (thickness === '3-2') return 'largo-3-2';
        if (thickness === '4-3') return 'largo-4-3';
        if (thickness === '5-3') return 'largo-5-3';
        if (thickness === '5-4') return 'largo-5-4';
    }

    return '';
}

/**
 * Infiere GUIA_TALLES basándose en marca y categoría
 * @param {string} brand - Marca del producto (slug)
 * @param {string} category - Categoría del producto
 * @param {string} sex - Sexo detectado
 * @returns {string} Valor válido o vacío
 */
function inferGuiaTalles(brand, category, sex) {
    if (!brand || !category) return '';

    const brandLower = brand.toLowerCase();
    const catLower = category.toLowerCase();
    const sexLower = (sex || '').toLowerCase();

    // Mapeo directo marca + categoría
    const mappings = [
        // Calzado por marca
        { brand: 'adidas', category: 'calzado', adult: true, result: 'adidascalzadoadultos' },
        { brand: 'adidas', category: 'calzado', adult: false, result: 'adidascalzadoninos' },
        { brand: 'adidas', category: 'calzado/ojotas', result: 'adidasadilette' },
        { brand: 'birkenstock', category: 'calzado', result: 'birkenstock' },
        { brand: 'quiksilver', category: 'calzado', result: 'quiksilvercalzado' },
        { brand: 'ugg', category: 'calzado', result: 'uggcalzado' },
        { brand: 'vans', category: 'calzado', adult: true, result: 'calzadovans' },
        { brand: 'vans', category: 'calzado', adult: false, result: 'vanscalzadoninos' },
        { brand: 'rip-curl', category: 'calzado', adult: true, result: 'ripcurlcalzado' },
        { brand: 'rip-curl', category: 'calzado', adult: false, result: 'calzadoripcurlninos' },
        { brand: 'salomon', category: 'calzado', result: 'salomoncalzado' },
        { brand: 'hunter', category: 'calzado', result: 'huntercalzado' },
        { brand: 'new-balance', category: 'calzado', result: 'newbalancecalzado' },
        { brand: 'teva', category: 'calzado', result: 'tevacalzado' },
        { brand: 'blundstone', category: 'calzado', result: 'blunstonecalzado' },
        { brand: 'converse', category: 'calzado', result: 'calzadoconverse' },
        { brand: 'reef', category: 'calzado', result: 'reefcalzado' },
        { brand: 'vibram', category: 'calzado', result: 'calzadovibram' },
        { brand: 'saucony', category: 'calzado', result: 'calzadosaucony' },
        { brand: 'cariuma', category: 'calzado', result: 'cariuma-calzado' },

        // Trajes por marca y sexo
        { brand: 'c-skins', category: 'surf/trajes', result: 'cskinstrajes' },
        { brand: 'xcel', category: 'surf/trajes', sex: 'hombre', result: 'xceltrajeshombre' },
        { brand: 'xcel', category: 'surf/trajes', sex: 'mujer', result: 'xceltrajesmujer' },
        { brand: 'xcel', category: 'surf/trajes/botitas', result: 'xcelbotitas' },
        { brand: 'billabong', category: 'surf/trajes', sex: 'hombre', result: 'billabongtrajeshombre' },
        { brand: 'billabong', category: 'surf/trajes', sex: 'mujer', result: 'billabongtrajesmujer' },
        { brand: 'hurley', category: 'surf/trajes', sex: 'hombre', result: 'hurleytrajeshombres' },
        { brand: 'hurley', category: 'surf/trajes', sex: 'mujer', result: 'hurleytrajesmujer' },
        { brand: 'hurley', category: 'surf/trajes/botitas', result: 'hurleybotitas' },

        // Rollers
        { brand: 'flying-eagle', category: 'skates/rollers', adult: true, result: 'flyingeaglerollers' },
        { brand: 'flying-eagle', category: 'skates/rollers', adult: false, result: 'flyingeaglerollersninos' },
        { brand: 'roller-derby', category: 'skates/rollers', adult: true, result: 'rollerderbyrollers' },
        { brand: 'roller-derby', category: 'skates/rollers', adult: false, result: 'rollerderbyrollersninos' },

        // Morey/Bodyboards
        { brand: 'manta', category: 'surf/morey', result: 'mantabodyboards' },

        // Guantes
        { brand: 'rip-curl', category: 'surf/trajes/guantes', result: 'ripcurlguantes' },

        // Bikinis niñas
        { brand: 'rip-curl', category: 'vestimenta/bikini', adult: false, result: 'ripcurlbikinisninas' },

        // Ojotas
        { brand: 'volcom', category: 'calzado/ojotas', adult: true, result: 'volcomojotasadultos' },
        { brand: 'volcom', category: 'calzado/ojotas', adult: false, result: 'volcomojotasninos' },

        // Mochilas
        { brand: 'fjallraven', category: 'accesorios/bolsos/mochilas', result: 'kankenmochilas' },

        // Hydro Flask
        { brand: 'hydro-flask', category: 'accesorios/outdoor/botellas-termicas', result: 'hydroflaskbotellasstandarywide' },

        // Dickies vestimenta
        { brand: 'dickies', category: 'vestimenta/remeras', sex: 'mujer', result: 'dickiesremerasmujer' },
        { brand: 'dickies', category: 'vestimenta/remeras', sex: 'hombre', result: 'dickiesremerashombre' },
        { brand: 'dickies', category: 'vestimenta/camperas', result: 'dickiesabrigos' },
        { brand: 'dickies', category: 'vestimenta/canguros', result: 'dickiesabrigos' },
        { brand: 'dickies', category: 'vestimenta/pantalones', sex: 'hombre', result: 'dickiespantaloneshombre' },
        { brand: 'dickies', category: 'vestimenta/pantalones', sex: 'mujer', result: 'dickiespantalonesmujer' },

        // Rhythm vestimenta
        { brand: 'rhythm', category: 'vestimenta/remeras', sex: 'mujer', result: 'rhythmvestimentatopmujer' },
        { brand: 'rhythm', category: 'vestimenta/remeras', sex: 'hombre', result: 'rhythmvestimentatophombre' },
        { brand: 'rhythm', category: 'vestimenta/camisas', sex: 'mujer', result: 'rhythmvestimentatopmujer' },
        { brand: 'rhythm', category: 'vestimenta/camisas', sex: 'hombre', result: 'rhythmvestimentatophombre' },

        // Rusty vestimenta
        { brand: 'rusty', category: 'vestimenta/remeras', sex: 'mujer', result: 'rustyvestimentatopmujeres' },
        { brand: 'rusty', category: 'vestimenta/remeras', sex: 'hombre', result: 'rustyvestimentatop' },

        // Florence Marine X
        { brand: 'florence-marine-x', category: 'vestimenta/remeras', result: 'florencemarinexvestimentatop' },
        { brand: 'florence-marine-x', category: 'vestimenta/camisas', result: 'florencemarinexvestimentatop' }
    ];

    // Determinar si es niño/adulto
    const isKids = sexLower.includes('niño') || sexLower.includes('niña') || sexLower.includes('kids');
    const isAdult = !isKids;

    // Buscar match exacto
    for (const mapping of mappings) {
        // Verificar marca
        if (mapping.brand !== brandLower) continue;

        // Verificar categoría (match parcial)
        if (!catLower.startsWith(mapping.category) && !catLower.includes(mapping.category)) continue;

        // Verificar sexo si aplica
        if (mapping.sex && !sexLower.includes(mapping.sex)) continue;

        // Verificar adulto/niño si aplica
        if (mapping.adult !== undefined) {
            if (mapping.adult && !isAdult) continue;
            if (!mapping.adult && isAdult) continue;
        }

        return mapping.result;
    }

    // Fallbacks genéricos por categoría y sexo
    if (catLower.includes('vestimenta/remeras') || catLower.includes('vestimenta/camisas') ||
        catLower.includes('vestimenta/musculosas') || catLower.includes('vestimenta/buzos') ||
        catLower.includes('vestimenta/canguros')) {
        if (isKids) return 'genericavestimentatopninos';
        if (sexLower.includes('mujer')) return 'genericavestimentatopmujeres';
        if (sexLower.includes('hombre')) return 'genericavestimentatophombres';
    }

    if (catLower.includes('vestimenta/pantalones') || catLower.includes('vestimenta/bermudas')) {
        if (sexLower.includes('mujer')) return 'genericavestimentaabajomujer';
        if (sexLower.includes('hombre')) return 'genericavestimentaabajohombre';
    }

    if (catLower.includes('surf/trajes') && !brandLower) {
        if (isKids) return 'genericatrajesninos';
        if (sexLower.includes('mujer')) return 'genericatrajesmujer';
        return 'genericatrajes';
    }

    if (catLower.includes('surf/trajes/guantes')) return 'genericaguantes';
    if (catLower.includes('surf/trajes/botitas')) return 'genericabotitas';
    if (catLower.includes('surf/trajes/capuchas')) return 'genericacapuchas';
    if (catLower.includes('surf/lycras') && isKids) return 'lycrasninos';
    if (catLower.includes('vestimenta/bikini') && isKids) return 'bikinisninas';

    if (catLower.includes('skates/protecciones')) {
        if (isKids) return 'genericaproteccionesninos';
        return 'genericaprotecciones';
    }

    return '';
}

/**
 * Infiere FIN-SET-UP para quillas
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferFinSetup(category, name, description) {
    // Solo aplica para surf/quillas
    if (!category || !category.startsWith('surf/quillas')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Detectar configuración
    if (/\bsingle\b|\bsingle fin\b/i.test(text)) return 'single';
    if (/\btwin\b|\b2 fin\b|\btwo fin\b/i.test(text)) return 'twin';
    if (/\bquad\b|\b4 fin\b|\bfour fin\b/i.test(text)) return 'quad';
    if (/\bthruster\b|\b3 fin\b|\bthree fin\b|\btri fin\b/i.test(text)) return 'thruster';
    if (/\b2\+1\b|\b2-1\b|\b2 \+ 1\b/i.test(text)) return '2-1';

    return '';
}

/**
 * Infiere FIN-SYSTEM para quillas
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferFinSystem(category, name, description) {
    // Solo aplica para surf/quillas
    if (!category || !category.startsWith('surf/quillas')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Detectar sistema base
    let hasFutures = /\bfutures\b/i.test(text);
    let hasFcs2 = /\bfcs[-\s]?ii\b|\bfcs[-\s]?2\b|\bfcs2\b/i.test(text);
    let hasFcs = /\bfcs\b/i.test(text) && !hasFcs2;
    let hasLongboard = /\blongboard\b|\blong board\b/i.test(text);
    let hasSoftboard = /\bsoftboard\b|\bsoft board\b|\bsoft top\b/i.test(text);

    // Priorizar combinaciones
    if (hasFutures && hasLongboard) return 'futures,longboard';
    if (hasFcs2 && hasLongboard) return 'fcs-2,longboard';
    if (hasFcs && hasLongboard) return 'fcs,longboard';

    // Sistemas simples
    if (hasFutures) return 'futures';
    if (hasFcs2) return 'fcs-2';
    if (hasFcs) return 'fcs';
    if (hasLongboard) return 'longboard';
    if (hasSoftboard) return 'softboard';

    return '';
}

/**
 * Infiere TIPO-DE-BERMUDA
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferTipoDeBermuda(category, name, description) {
    // Solo aplica para vestimenta/bermudas
    if (!category || !category.startsWith('vestimenta/bermudas')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Buscar medida en pulgadas (14", 18", etc.)
    const inchMatch = text.match(/(\d{2})["''\s]?(?:inch|in|pulgadas)?/i);
    if (inchMatch) {
        const inches = parseInt(inchMatch[1], 10);

        // Voley: 14-17"
        if (inches >= 14 && inches <= 17) {
            return `voley-${inches}`;
        }
        // Largo: 18-22"
        if (inches >= 18 && inches <= 22) {
            return `largo-${inches}`;
        }
    }

    // Detectar por palabras clave si no hay medida
    const isVolley = /\bvolley\b|\bvoley\b|\belastic waist\b|\bcintura elastica\b|\bshort\b/i.test(text);
    const isLong = /\bwalkshort\b|\bwalk short\b|\bchino\b|\bcargo\b/i.test(text);

    // Si solo sabemos el tipo pero no la medida, no inferir (necesitamos certeza)
    // Solo devolvemos valor si tenemos medida exacta

    return '';
}

/**
 * Infiere TIPO-DE-LENTES
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferTipoDeLentes(category, name, description) {
    // Solo aplica para accesorios/lentes
    if (!category || !category.startsWith('accesorios/lentes')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Detectar tipo
    if (/\bpolariz(ed|ado|adas)\b/i.test(text)) {
        return 'polarizado';
    }

    if (/\breading\b|\blectura\b|\bprescripcion\b|\bprescription\b/i.test(text)) {
        return 'lectura';
    }

    // Solo marcar como no-polarizado si explícitamente lo dice
    if (/\bno polariz|\bnon[- ]polariz|\bsin polarizar\b/i.test(text)) {
        return 'no-polarizado';
    }

    // Si la subcategoría lo indica
    if (category === 'accesorios/lentes/polarizados') {
        return 'polarizado';
    }
    if (category === 'accesorios/lentes/no-polarizados') {
        return 'no-polarizado';
    }
    if (category === 'accesorios/lentes/lectura') {
        return 'lectura';
    }

    return '';
}

/**
 * Infiere TAMANO para mochilas basándose en litros
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferTamanoMochila(category, name, description) {
    // Solo aplica para mochilas
    if (!category || !category.includes('accesorios/bolsos/mochilas')) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Buscar litros en el texto (ej: "16L", "16 L", "16 litros", "16lt")
    const litersMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:l(?:t|itros?)?)\b/i);

    if (litersMatch) {
        const liters = parseFloat(litersMatch[1]);

        // Clasificar por tamaño
        if (liters <= 12) {
            return 'chica';
        } else if (liters <= 19) {
            return 'mediana';
        } else {
            return 'grande';
        }
    }

    // Buscar palabras clave de tamaño si no hay litros
    if (/\bmini\b|\bsmall\b|\bchica\b|\bpequeña\b|\bkids\b|\bniños\b/i.test(text)) {
        return 'chica';
    }
    if (/\bmedium\b|\bmediana\b|\bstandard\b/i.test(text)) {
        return 'mediana';
    }
    if (/\blarge\b|\bgrande\b|\bxl\b|\bexpandable\b|\bviaje\b|\btravel\b/i.test(text)) {
        return 'grande';
    }

    // Si no hay información clara, no inferir
    return '';
}

/**
 * Infiere TIPOS-DE-TABLAS para skates
 * @param {string} category - Categoría del producto
 * @param {string} name - Nombre del producto
 * @param {string} description - Descripción del producto
 * @returns {string} Valor válido o vacío
 */
function inferTiposDeTablas(category, name, description) {
    // Solo aplica para skates (tablas y completos)
    if (!category || (!category.includes('skates/tablas') && !category.includes('skates/skates-completos'))) {
        return '';
    }

    const text = `${name} ${description}`.toLowerCase();

    // Detectar surf-skate primero (más específico)
    if (/\bsurf[-\s]?skate\b|\bsurfskate\b|\bcarver\b|\byow\b|\bsmoothstar\b|\bslide\b/i.test(text)) {
        return 'surf-skates';
    }

    // Detectar longboard
    if (/\blongboard\b|\blong[-\s]?board\b|\bdancing\b|\bdownhill\b|\bfreeride\b/i.test(text)) {
        return 'longboard';
    }

    // Detectar cruiser
    if (/\bcruiser\b|\bpenny\b|\bmini[-\s]?cruiser\b|\bnickel\b/i.test(text)) {
        return 'cruiser';
    }

    // Detectar street (por defecto para skates estándar)
    if (/\bstreet\b|\bpark\b|\bpro model\b|\bpro[-\s]?deck\b|\btrick\b|\b7[\.\,]?\d*["']?\s*(?:x|por)\b/i.test(text)) {
        return 'street';
    }

    // Si la categoría lo indica explícitamente
    if (category.includes('surf-skate')) return 'surf-skates';
    if (category.includes('longboard')) return 'longboard';
    if (category.includes('cruiser')) return 'cruiser';
    if (category.includes('skate') && !category.includes('surf') && !category.includes('long') && !category.includes('cruiser')) {
        // Si es skate genérico, probablemente es street
        return 'street';
    }

    return '';
}

// =============================================
// INICIALIZACIÓN MODE TABS
// =============================================

function initializeModeTabs() {
    if (!elements.modeTabs) return;
    elements.modeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Update active tab
            elements.modeTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Set mode
            appState.currentMode = tab.dataset.mode;

            // Update UI
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
            } else { // Mode 'images'
                elements.analyzeBtn.style.display = 'block';
                elements.processStockBtn.style.display = 'none';
                if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').style.display = 'none';
                elements.downloadTemplateBtn.style.display = 'flex';
                if (elements.uploadTitle) elements.uploadTitle.textContent = 'Sube tu archivo Excel';
                if (elements.brandInputContainer) elements.brandInputContainer.style.display = 'none';
            }

            if (appState.currentFile) {
                elements.analyzeBtn.disabled = false;
                elements.processStockBtn.disabled = false;
                if (document.getElementById('processUnifiedBtn')) document.getElementById('processUnifiedBtn').disabled = false;
            }
        });
    });
}

// =============================================
// DETECCIÓN DE COLUMNAS CON IA
// =============================================

// Detect columns using AI - analyzes column names to determine which is Name, SKU, and Color
async function detectColumnsWithAI(columnNames) {
    try {
        console.log('🔍 [detectColumnsWithAI] Iniciando detección con columnas:', columnNames);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: `Eres un experto en detectar el propósito de columnas en archivos Excel de productos. 
Analiza los nombres de las columnas y determina:
1. NOMBRE: La columna que contiene el nombre/descripción del producto (puede llamarse: Nombre, Descripcion, Articulo, Producto, Item, etc.)
2. SKU: La columna que contiene el código/SKU del producto (puede llamarse: SKU, Sku, Codigo, Código, Code, Ref, Referencia, ID, etc.)
3. COLOR: La columna que contiene el color del proveedor (puede llamarse: Color, Color prov, Color Proveedor, Colour, etc.)

Responde SOLO en JSON válido con los nombres EXACTOS de las columnas encontradas:
{"nombre": "NombreExactoColumna", "sku": "NombreExactoColumna", "color": "NombreExactoColumna"}

Si una columna no existe, usa null. Los valores deben ser EXACTAMENTE como aparecen en la lista de columnas.`
                    },
                    {
                        role: 'user',
                        content: `Columnas del Excel: ${JSON.stringify(columnNames)}`
                    }
                ],
                temperature: 0.1,
                max_tokens: 100
            })
        });

        console.log('📡 [detectColumnsWithAI] Response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ [detectColumnsWithAI] Error en API de OpenAI:', response.status, errorText);
            addLog(`Error en API OpenAI: ${response.status}`, 'error');
            return null;
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '{}';

        console.log('🤖 [detectColumnsWithAI] Respuesta RAW de IA:', content);
        addLog(`Respuesta IA: ${content}`, 'info');

        // Parse JSON response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            console.log('✅ [detectColumnsWithAI] JSON parseado:', result);

            const finalResult = {
                nombre: result.nombre || null,
                sku: result.sku || null,
                color: result.color || null
            };

            console.log('🎯 [detectColumnsWithAI] Resultado final:', finalResult);
            return finalResult;
        }

        console.warn('⚠️ [detectColumnsWithAI] No se pudo extraer JSON de la respuesta');
        return null;
    } catch (error) {
        console.error('❌ [detectColumnsWithAI] Error detectando columnas con IA:', error);
        addLog(`Error crítico: ${error.message}`, 'error');
        return null;
    }
}

// =============================================
// PROCESAMIENTO DE ARCHIVO STOCK
// =============================================

async function processStockFile() {
    if (!appState.workbook) {
        alert('Por favor carga un archivo Excel primero');
        return;
    }

    const firstSheetName = appState.workbook.SheetNames[0];
    const worksheet = appState.workbook.Sheets[firstSheetName];

    // Forzar lectura como texto/string de todas las celdas
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
        raw: false,        // NO usar valores raw (parsear como texto)
        defval: '',        // Valor por defecto para celdas vacías
        blankrows: false   // Ignorar filas vacías
    });

    if (jsonData.length === 0) {
        alert('El archivo Excel está vacío');
        return;
    }

    // Check Columns
    const firstRow = jsonData[0];

    // Log available columns for debugging
    const availableColumns = Object.keys(firstRow);
    console.log('📋 Columnas detectadas en el Excel:', availableColumns);
    console.log('🔍 Primeras 3 filas del Excel:', jsonData.slice(0, 3));

    addLog(`Columnas encontradas: ${availableColumns.join(', ')}`, 'info');

    // Use AI to detect which column is which
    addLog('🤖 Analizando columnas con IA...', 'info');
    let columnMapping = await detectColumnsWithAI(availableColumns);

    console.log('🎯 Resultado de detección de columnas:', columnMapping);

    // Fallback manual si la IA falla
    if (!columnMapping || !columnMapping.nombre) {
        console.warn('⚠️ IA no pudo detectar columnas, usando fallback manual...');
        addLog('⚠️ IA falló, intentando detección manual...', 'warning');

        columnMapping = {
            nombre: null,
            sku: null,
            color: null
        };

        // Detección manual por palabras clave
        for (const col of availableColumns) {
            const colLower = col.toLowerCase();

            if (!columnMapping.nombre && (colLower.includes('nombre') || colLower.includes('name') || colLower.includes('producto') || colLower.includes('articulo'))) {
                columnMapping.nombre = col;
                console.log(`✓ Detectado manualmente Nombre: "${col}"`);
            }

            if (!columnMapping.sku && (colLower.includes('sku') || colLower.includes('codigo') || colLower.includes('código') || colLower.includes('code') || colLower.includes('ref'))) {
                columnMapping.sku = col;
                console.log(`✓ Detectado manualmente SKU: "${col}"`);
            }

            if (!columnMapping.color && (colLower.includes('color') || colLower.includes('colour'))) {
                columnMapping.color = col;
                console.log(`✓ Detectado manualmente Color: "${col}"`);
            }
        }

        if (columnMapping.nombre) {
            addLog('✓ Detección manual exitosa', 'success');
        }
    }

    if (!columnMapping || !columnMapping.nombre) {
        const errorMsg = `No se pudo detectar la columna de "Nombre".\n\nColumnas encontradas:\n${availableColumns.map((col, i) => `${i + 1}. "${col}"`).join('\n')}`;
        console.error('❌ Error:', errorMsg);
        alert(errorMsg);
        return;
    }

    addLog(`✓ Columna Nombre: "${columnMapping.nombre}"`, 'success');
    addLog(`✓ Columna SKU: "${columnMapping.sku || 'No detectada'}"`, columnMapping.sku ? 'success' : 'info');
    addLog(`✓ Columna Color: "${columnMapping.color || 'No detectada'}"`, columnMapping.color ? 'success' : 'info');

    // UI Updates - show stock table, hide images table
    elements.uploadSection.style.display = 'none';
    elements.processingSection.style.display = 'block';

    // Show stock preview container, hide images preview container
    if (elements.imagesPreviewContainer) elements.imagesPreviewContainer.style.display = 'none';
    if (elements.stockPreviewContainer) elements.stockPreviewContainer.style.display = 'block';

    // Clear the real-time stock table
    if (elements.stockRealTimeTableBody) elements.stockRealTimeTableBody.innerHTML = '';

    // Reset control flags
    appState.isCancelled = false;
    appState.skipToResults = false;

    appState.processedStock = [];
    const total = jsonData.length;
    elements.totalCount.textContent = total;
    elements.processedCount.textContent = '0';

    addLog(`Procesando ${total} productos...`, 'info');

    const processedStockSkus = new Set(); // Track unique SKUs

    // Process
    for (let i = 0; i < total; i++) {
        // Check for cancel or skip to results
        if (appState.isCancelled) {
            addLog('⏹️ Procesamiento cancelado por el usuario', 'error');
            elements.processingSection.style.display = 'none';
            elements.uploadSection.style.display = 'block';
            return;
        }

        if (appState.skipToResults) {
            addLog(`⏭️ Saltando a resultados con ${appState.processedStock.length} productos procesados`, 'info');
            break;
        }

        const item = jsonData[i];

        // Use the AI-detected column names
        const name = item[columnMapping.nombre] || '';
        const originalSku = columnMapping.sku ? (item[columnMapping.sku] || '') : '';
        const color = columnMapping.color ? (item[columnMapping.color] || '') : '';

        // Clean SKU (remove size suffix)
        let cleanSku = removeSizeFromSKU(String(originalSku));

        // If SKU is empty, use a unique identifier based on name + index
        if (!cleanSku || cleanSku.trim() === '') {
            cleanSku = `TEMP_${i}_${name.substring(0, 20).replace(/\s+/g, '_')}`;
            console.warn(`Producto "${name}" no tiene SKU, usando identificador temporal`);
        }

        // Skip if this SKU was already processed (remove duplicates)
        if (processedStockSkus.has(cleanSku)) {
            const percent = Math.round(((i + 1) / total) * 100);
            elements.progressFill.style.width = `${percent}%`;
            elements.progressText.textContent = `${percent}%`;
            elements.processedCount.textContent = i + 1;
            console.log(`Saltando duplicado: ${cleanSku}`);
            continue;
        }
        processedStockSkus.add(cleanSku);

        // For the final output, if we used a temp ID, show empty or the original cleaned SKU
        const finalSku = originalSku ? removeSizeFromSKU(String(originalSku)) : '';

        // Update progress UI
        elements.currentItemName.textContent = name;
        elements.processedCount.textContent = i + 1;
        const percent = Math.round(((i + 1) / total) * 100);
        elements.progressFill.style.width = `${percent}%`;
        elements.progressText.textContent = `${percent}%`;

        // AI Analysis
        try {
            const manualBrand = elements.manualBrandInput ? elements.manualBrandInput.value.trim() : '';

            // Pass cleanSku to help detect color from suffix
            const analysisResult = await analyzeProductForStock(name, cleanSku, manualBrand, color);

            const today = new Date();
            const day = String(today.getDate()).padStart(2, '0');
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const year = today.getFullYear();
            const formattedDate = `${day}-${month}-${year}`;

            // Generate Descriptions with AI + Web Search
            let descriptions = { short: '', long: '' };
            try {
                descriptions = await generateProductDescriptions(analysisResult.standardizedName, analysisResult.brand);
            } catch (err) {
                console.error('Error generating descriptions:', err);
            }

            // Inferir nuevas columnas
            const fullDescription = `${descriptions.short} ${descriptions.long}`;
            const largoDelTraje = inferLargoDelTraje(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const guiaTalles = inferGuiaTalles(analysisResult.brand, analysisResult.category, analysisResult.sex);
            const finSetup = inferFinSetup(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const finSystem = inferFinSystem(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const tipoDeBermuda = inferTipoDeBermuda(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const tipoDeLentes = inferTipoDeLentes(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const tamanoMochila = inferTamanoMochila(analysisResult.category, analysisResult.standardizedName, fullDescription);
            const tiposDeTablas = inferTiposDeTablas(analysisResult.category, analysisResult.standardizedName, fullDescription);

            const stockRow = {
                'CODIGO_PRODUCTO': finalSku,
                'CODIGO_VARIANTE': '',
                'CATEGORIA': analysisResult.category,
                'DESCRIPCION_CORTA': descriptions.short,
                'DESCRIPCION-LARGA': descriptions.long,
                'FECHA_AGREGADO': formattedDate,
                'SEXO': analysisResult.sex,
                'MARCA': analysisResult.brand,
                'NOMBRE_PRODUCTO': toTitleCase(analysisResult.standardizedName),
                'COLOR': analysisResult.color || color, // Use AI color, fallback to excel color
                'HABILITADO': 'No',
                // Nuevas columnas
                'LARGO-DEL-TRAJE': largoDelTraje,
                'GUIA_TALLES': guiaTalles,
                'FIN-SET-UP': finSetup,
                'FIN-SYSTEM': finSystem,
                'TIPO-DE-BERMUDA': tipoDeBermuda,
                'TIPO-DE-LENTES': tipoDeLentes,
                'TAMANO': tamanoMochila,
                'TIPOS-DE-TABLAS': tiposDeTablas
            };

            appState.processedStock.push(stockRow);

            // Add row to real-time table immediately
            addStockRowToRealTimeTable(stockRow);

        } catch (e) {
            console.error(e);
        }

        if (i % 5 === 0) await delay(50);
    }

    // Populate stock preview table
    populateStockPreviewTable();

    elements.processingSection.style.display = 'none';
    elements.stockResultsSection.style.display = 'block';
    elements.processedStockCount.textContent = appState.processedStock.length;
}

// =============================================
// TABLA EN TIEMPO REAL
// =============================================

// Add a single row to the real-time stock table during processing
function addStockRowToRealTimeTable(item) {
    if (!elements.stockRealTimeTableBody) return;

    const row = document.createElement('tr');

    // Get sex badge class
    let sexBadgeClass = 'sex-unisex';
    if (item.SEXO === 'Hombre') sexBadgeClass = 'sex-hombre';
    else if (item.SEXO === 'Mujer') sexBadgeClass = 'sex-mujer';

    row.innerHTML = `
        <td><strong>${item.CODIGO_PRODUCTO || '-'}</strong></td>
        <td>${item.NOMBRE_PRODUCTO || '-'}</td>
        <td><span class="stock-badge category">${item.CATEGORIA || '-'}</span></td>
        <td><span class="stock-badge ${sexBadgeClass}">${item.SEXO || '-'}</span></td>
        <td>${item.MARCA || '-'}</td>
        <td><span class="stock-badge color">${item.COLOR || '-'}</span></td>
        <td class="desc-cell" title="${(item.DESCRIPCION_CORTA || '').replace(/"/g, '&quot;')}">${item.DESCRIPCION_CORTA || '-'}</td>
        <td class="desc-cell long-desc" title="${(item['DESCRIPCION-LARGA'] || '').replace(/"/g, '&quot;')}">${item['DESCRIPCION-LARGA'] || '-'}</td>
    `;

    elements.stockRealTimeTableBody.appendChild(row);
    // No auto-scroll - el usuario puede scrollear manualmente sin interrupciones
}

// Populate stock preview table with processed data (for final results section)
function populateStockPreviewTable() {
    if (!elements.stockPreviewTableBody) return;

    elements.stockPreviewTableBody.innerHTML = '';

    appState.processedStock.forEach((item, index) => {
        const row = document.createElement('tr');

        // Get sex badge class
        let sexBadgeClass = 'sex-unisex';
        if (item.SEXO === 'Hombre') sexBadgeClass = 'sex-hombre';
        else if (item.SEXO === 'Mujer') sexBadgeClass = 'sex-mujer';

        row.innerHTML = `
            <td><strong>${item.CODIGO_PRODUCTO || '-'}</strong></td>
            <td>${item.NOMBRE_PRODUCTO || '-'}</td>
            <td><span class="stock-badge category">${item.CATEGORIA || '-'}</span></td>
            <td><span class="stock-badge ${sexBadgeClass}">${item.SEXO || '-'}</span></td>
            <td>${item.MARCA || '-'}</td>
            <td><span class="stock-badge color">${item.COLOR || '-'}</span></td>
            <td class="desc-cell" title="${(item.DESCRIPCION_CORTA || '').replace(/"/g, '&quot;')}">${item.DESCRIPCION_CORTA || '-'}</td>
            <td class="desc-cell long-desc" title="${(item['DESCRIPCION-LARGA'] || '').replace(/"/g, '&quot;')}">${item['DESCRIPCION-LARGA'] || '-'}</td>
        `;

        elements.stockPreviewTableBody.appendChild(row);
    });
}

// =============================================
// ANÁLISIS DE PRODUCTO PARA STOCK
// =============================================

// Lista de marcas válidas para CSV (slugs)
const VALID_BRANDS = [
    'adidas', 'aftershokz', 'almost', 'andale', 'ally', 'aquatone', 'aqua-marina', 'arbor', 'arena',
    'art-in-surf', 'austina', 'austral', 'australian-gold', 'alien-workshop', 'banana-boat', 'bali',
    'baleine', 'bernie', 'billabong', 'birkenstock', 'blueprinthomeheart', 'blundstone', 'blind',
    'boardworks', 'body-glove', 'boiling', 'bones', 'boogie', 'bubble-gum', 'buff', 'bullet', 'byrne',
    'cabo', 'cabron', 'capitan-fin', 'cariuma', 'carver', 'casio', 'catch-surf', 'channel-islands',
    'chilly', 'chocolate', 'chums', 'circa', 'crailtap', 'crazy-safety', 'creature', 'converse',
    'creatures', 'crep', 'critical-slide', 'c-skins', 'dark-star', 'da-kine', 'deus', 'dc-shoes',
    'dewey-webber', 'dickies', 'dhd', 'dr-martens', 'drop-dead', 'dusters', 'eco-bike', 'eightball',
    'element', 'endorfins', 'empire', 'enjoi', 'eno', 'fallen', 'fcs', 'fila', 'firewire', 'fjallraven',
    'flexfit', 'florence-marine-x', 'flying-diamonds', 'flying-eagle', 'former', 'free-life', 'freestyle',
    'futures', 'fu-wax', 'galeon', 'girl', 'globe', 'go-smart', 'goorin-bros', 'gorilla', 'hazard',
    'herschel', 'hey-dude', 'homewave', 'hunter', 'hurley', 'hydro-flask', 'independent', 'indie', 'isla',
    'izipizi', 'jansport', 'jessup', 'kaboa', 'kfd', 'katin', 'katwai', 'koston', 'komunity', 'krux',
    'land', 'la-isla', 'leus', 'levis', 'loog', 'lost', 'long-island', 'meller', 'madness', 'maglite',
    'make', 'mambu', 'manta', 'mare', 'mares', 'matunas', 'matuse', 'maui-sons', 'medina-softboards',
    'metro-skateboards', 'miir', 'miller', 'minilogo', 'mob', 'monarch', 'mormaii', 'mushkana', 'neff',
    'new-advance', 'new-balance', 'new-era', 'nike', 'nitro', 'oakley', 'oceanearth', 'official', 'oj',
    'oneill', 'opinel', 'orangatang', 'orca', 'oklo', 'organiks', 'oz', 'peak-wetsuits', 'penny', 'play',
    'play-skateboards', 'posca', 'powell-peralta', 'prime-8', 'primitive', 'pro-tec', 'push-skateboarding',
    'quiksilver', 'rad', 'raen', 'real', 'reef', 'revelation', 'rhythm', 'rip-curl', 'ricta', 'rivvia',
    'roller-derby', 'roark', 'roxy', 'royal', 'rusty', 'rvca', 'saju', 'salomon', 'saucony', 'santa-cruz',
    'santalu', 'scarfini', 'sector-9', 'seis-montes', 'shapers', 'sharp-eye', 'slappy', 'slater-desings',
    'skull-candy', 'skullcandy', 'softair', 'softech', 'solarez', 'speed-demons', 'spitfire', 'slide',
    'stance', 'stereo', 'sun-bum', 'sunski', 'sureste', 'sticky-bumps', 'sunny-life', 'superga', 'superior',
    'surfeeling', 'surf-logic', 'surfer-dudes', 'surfskate', 'swell', 'sympl', 'tensor', 'teva', 'thunder',
    'thunderbolt', 'the-north-face', 'thrasher', 'thread', 'the-surfer-s-journal', 'toms', 'tony-s-chocolonely',
    'torq', 'trap', 'triple-eight', 'tyr', 'ugg', 'unbrand', 'u-s-divers', 'vans', 'varias', 'verb', 'veia',
    'vibram', 'victorinox', 'vision', 'vissla', 'vog', 'volcom', 'vox', 'waboba', 'wave-storm', 'wavers',
    'wetts', 'wipeout', 'woodoo', 'wrangler', 'xcel', 'yamba', 'yow', 'zaragoza', 'zero', 'zoo-york', 'row'
];

// Mapeo de slug → nombre bonito para mostrar en ecommerce
const BRAND_DISPLAY_NAMES = {
    'adidas': 'Adidas', 'aftershokz': 'Aftershokz', 'almost': 'Almost', 'andale': 'Andale', 'ally': 'Ally',
    'aquatone': 'Aquatone', 'aqua-marina': 'Aqua Marina', 'arbor': 'Arbor', 'arena': 'Arena',
    'art-in-surf': 'Art In Surf', 'austina': 'Austina', 'austral': 'Austral', 'australian-gold': 'Australian Gold',
    'alien-workshop': 'Alien Workshop', 'banana-boat': 'Banana Boat', 'bali': 'Bali', 'baleine': 'Baleine',
    'bernie': 'Bernie', 'billabong': 'Billabong', 'birkenstock': 'Birkenstock', 'blueprinthomeheart': 'Blueprint',
    'blundstone': 'Blundstone', 'blind': 'Blind', 'boardworks': 'Boardworks', 'body-glove': 'Body Glove',
    'boiling': 'Boiling', 'bones': 'Bones', 'boogie': 'Boogie', 'bubble-gum': 'Bubble Gum', 'buff': 'Buff',
    'bullet': 'Bullet', 'byrne': 'Byrne', 'cabo': 'Cabo', 'cabron': 'Cabron', 'capitan-fin': 'Captain Fin',
    'cariuma': 'Cariuma', 'carver': 'Carver', 'casio': 'Casio', 'catch-surf': 'Catch Surf',
    'channel-islands': 'Channel Islands', 'chilly': 'Chilly', 'chocolate': 'Chocolate', 'chums': 'Chums',
    'circa': 'Circa', 'crailtap': 'Crailtap', 'crazy-safety': 'Crazy Safety', 'creature': 'Creature',
    'converse': 'Converse', 'creatures': 'Creatures', 'crep': 'Crep', 'critical-slide': 'Critical Slide',
    'c-skins': 'C-Skins', 'dark-star': 'Darkstar', 'da-kine': 'Dakine', 'deus': 'Deus', 'dc-shoes': 'DC Shoes',
    'dewey-webber': 'Dewey Webber', 'dickies': 'Dickies', 'dhd': 'DHD', 'dr-martens': 'Dr. Martens',
    'drop-dead': 'Drop Dead', 'dusters': 'Dusters', 'eco-bike': 'Eco Bike', 'eightball': 'Eightball',
    'element': 'Element', 'endorfins': 'Endorfins', 'empire': 'Empire', 'enjoi': 'Enjoi', 'eno': 'ENO',
    'fallen': 'Fallen', 'fcs': 'FCS', 'fila': 'Fila', 'firewire': 'Firewire', 'fjallraven': 'Fjallraven',
    'flexfit': 'Flexfit', 'florence-marine-x': 'Florence Marine X', 'flying-diamonds': 'Flying Diamonds',
    'flying-eagle': 'Flying Eagle', 'former': 'Former', 'free-life': 'Free Life', 'freestyle': 'Freestyle',
    'futures': 'Futures', 'fu-wax': 'Fu Wax', 'galeon': 'Galeon', 'girl': 'Girl', 'globe': 'Globe',
    'go-smart': 'Go Smart', 'goorin-bros': 'Goorin Bros', 'gorilla': 'Gorilla', 'hazard': 'Hazard',
    'herschel': 'Herschel', 'hey-dude': 'Hey Dude', 'homewave': 'Homewave', 'hunter': 'Hunter',
    'hurley': 'Hurley', 'hydro-flask': 'Hydro Flask', 'independent': 'Independent', 'indie': 'Indie',
    'isla': 'Isla', 'izipizi': 'Izipizi', 'jansport': 'Jansport', 'jessup': 'Jessup', 'kaboa': 'Kaboa',
    'kfd': 'KFD', 'katin': 'Katin', 'katwai': 'Katwai', 'koston': 'Koston', 'komunity': 'Komunity',
    'krux': 'Krux', 'land': 'Land', 'la-isla': 'La Isla', 'leus': 'Leus', 'levis': 'Levis', 'loog': 'Loog',
    'lost': 'Lost', 'long-island': 'Long Island', 'meller': 'Meller', 'madness': 'Madness', 'maglite': 'Maglite',
    'make': 'Make', 'mambu': 'Mambu', 'manta': 'Manta', 'mare': 'Mare', 'mares': 'Mares', 'matunas': 'Matunas',
    'matuse': 'Matuse', 'maui-sons': 'Maui & Sons', 'medina-softboards': 'Medina Softboards',
    'metro-skateboards': 'Metro Skateboards', 'miir': 'Miir', 'miller': 'Miller', 'minilogo': 'Mini Logo',
    'mob': 'MOB', 'monarch': 'Monarch', 'mormaii': 'Mormaii', 'mushkana': 'Mushkana', 'neff': 'Neff',
    'new-advance': 'New Advance', 'new-balance': 'New Balance', 'new-era': 'New Era', 'nike': 'Nike',
    'nitro': 'Nitro', 'oakley': 'Oakley', 'oceanearth': 'Ocean & Earth', 'official': 'Official', 'oj': 'OJ',
    'oneill': "O'Neill", 'opinel': 'Opinel', 'orangatang': 'Orangatang', 'orca': 'Orca', 'oklo': 'Oklo',
    'organiks': 'Organiks', 'oz': 'OZ', 'peak-wetsuits': 'Peak Wetsuits', 'penny': 'Penny', 'play': 'Play',
    'play-skateboards': 'Play Skateboards', 'posca': 'Posca', 'powell-peralta': 'Powell Peralta',
    'prime-8': 'Prime 8', 'primitive': 'Primitive', 'pro-tec': 'Pro-Tec', 'push-skateboarding': 'Push',
    'quiksilver': 'Quiksilver', 'rad': 'RAD', 'raen': 'Raen', 'real': 'Real', 'reef': 'Reef',
    'revelation': 'Revelation', 'rhythm': 'Rhythm', 'rip-curl': 'Rip Curl', 'ricta': 'Ricta', 'rivvia': 'Rivvia',
    'roller-derby': 'Roller Derby', 'roark': 'Roark', 'roxy': 'Roxy', 'royal': 'Royal', 'rusty': 'Rusty',
    'rvca': 'RVCA', 'saju': 'Saju', 'salomon': 'Salomon', 'saucony': 'Saucony', 'santa-cruz': 'Santa Cruz',
    'santalu': 'Santalu', 'scarfini': 'Scarfini', 'sector-9': 'Sector 9', 'seis-montes': 'Seis Montes',
    'shapers': 'Shapers', 'sharp-eye': 'Sharp Eye', 'slappy': 'Slappy', 'slater-desings': 'Slater Designs',
    'skull-candy': 'Skullcandy', 'skullcandy': 'Skullcandy', 'softair': 'Softair', 'softech': 'Softech',
    'solarez': 'Solarez', 'speed-demons': 'Speed Demons', 'spitfire': 'Spitfire', 'slide': 'Slide',
    'stance': 'Stance', 'stereo': 'Stereo', 'sun-bum': 'Sun Bum', 'sunski': 'Sunski', 'sureste': 'Sureste',
    'sticky-bumps': 'Sticky Bumps', 'sunny-life': 'Sunny Life', 'superga': 'Superga', 'superior': 'Superior',
    'surfeeling': 'Surfeeling', 'surf-logic': 'Surf Logic', 'surfer-dudes': 'Surfer Dudes', 'surfskate': 'Surfskate',
    'swell': 'Swell', 'sympl': 'Sympl', 'tensor': 'Tensor', 'teva': 'Teva', 'thunder': 'Thunder',
    'thunderbolt': 'Thunderbolt', 'the-north-face': 'The North Face', 'thrasher': 'Thrasher', 'thread': 'Thread',
    'the-surfer-s-journal': "The Surfer's Journal", 'toms': 'Toms', 'tony-s-chocolonely': "Tony's Chocolonely",
    'torq': 'Torq', 'trap': 'Trap', 'triple-eight': 'Triple Eight', 'tyr': 'TYR', 'ugg': 'UGG',
    'unbrand': 'Unbrand', 'u-s-divers': 'U.S. Divers', 'vans': 'Vans', 'varias': 'Varias', 'verb': 'Verb',
    'veia': 'Veia', 'vibram': 'Vibram', 'victorinox': 'Victorinox', 'vision': 'Vision', 'vissla': 'Vissla',
    'vog': 'VOG', 'volcom': 'Volcom', 'vox': 'Vox', 'waboba': 'Waboba', 'wave-storm': 'Wavestorm',
    'wavers': 'Wavers', 'wetts': 'Wetts', 'wipeout': 'Wipeout', 'woodoo': 'Woodoo', 'wrangler': 'Wrangler',
    'xcel': 'Xcel', 'yamba': 'Yamba', 'yow': 'YOW', 'zaragoza': 'Zaragoza', 'zero': 'Zero', 'zoo-york': 'Zoo York',
    'row': 'Row'
};

// Colores válidos (ÚNICOS PERMITIDOS)
const VALID_COLORS = [
    'beige', 'amarillo', 'naranja', 'rojo', 'rosa', 'violeta', 'azul', 'verde', 'gris',
    'blanco', 'negro', 'multicolor', 'patron', 'celeste', 'marron', 'mostaza', 'bordeaux', 'carey', 'lila'
];

// Mapeo de categorías path → nombre legible para el ecommerce
const CATEGORY_DISPLAY_NAMES = {
    'vestimenta/remeras': 'Remera', 'vestimenta/remeras/manga-corta': 'Remera', 'vestimenta/remeras/manga-larga': 'Remera',
    'vestimenta/camisas': 'Camisa', 'vestimenta/camisas/manga-corta': 'Camisa', 'vestimenta/camisas/manga-larga': 'Camisa',
    'vestimenta/bermudas': 'Bermuda', 'vestimenta/bermudas/bermudas-de-paseo': 'Bermuda', 'vestimenta/bermudas/bermudas-de-playa': 'Bermuda',
    'vestimenta/pantalones': 'Pantalón', 'vestimenta/pantalones/jean': 'Jean', 'vestimenta/pantalones/cargo': 'Pantalón Cargo',
    'vestimenta/pantalones/deportivos': 'Pantalón', 'vestimenta/pantalones/pantalon-chino': 'Pantalón Chino',
    'vestimenta/pantalones/pantalones-tela': 'Pantalón', 'vestimenta/pantalones/pantalones-basicos': 'Pantalón',
    'vestimenta/canguros': 'Canguro', 'vestimenta/canguros/sin-cierre': 'Canguro', 'vestimenta/canguros/con-cierre': 'Canguro',
    'vestimenta/buzos': 'Buzo', 'vestimenta/camperas': 'Campera', 'vestimenta/musculosas': 'Musculosa',
    'vestimenta/polleras': 'Pollera', 'vestimenta/vestidos': 'Vestido', 'vestimenta/bikini': 'Bikini',
    'vestimenta/gorros-de-invierno': 'Gorro de Invierno',
    'calzado': 'Calzado', 'calzado/championes': 'Championes', 'calzado/botas': 'Botas', 'calzado/ojotas': 'Ojotas',
    'calzado/sandalias': 'Sandalias', 'calzado/sandalias/cuero': 'Sandalias', 'calzado/sandalias/goma-eva': 'Sandalias',
    'calzado/skate-pro': 'Championes Skate Pro',
    'accesorios/gorros': 'Gorra', 'accesorios/gorros/gorras-de-visera': 'Gorra',
    'accesorios/gorros/gorras-de-visera/visera-curva': 'Gorra', 'accesorios/gorros/gorras-de-visera/visera-chata': 'Gorra Trucker',
    'accesorios/gorros/gorros-de-lana': 'Gorro de Lana', 'accesorios/gorros/sombreros': 'Sombrero',
    'accesorios/bolsos': 'Bolso', 'accesorios/bolsos/mochilas': 'Mochila', 'accesorios/bolsos/rinoneras': 'Riñonera',
    'accesorios/bolsos/morrales': 'Morral', 'accesorios/bolsos/carteras': 'Cartera', 'accesorios/bolsos/bolsos-de-viaje': 'Bolso de Viaje',
    'accesorios/bolsos/cartuchera': 'Cartuchera', 'accesorios/bolsos/necessaire': 'Necessaire', 'accesorios/bolsos/luncheras': 'Lunchera',
    'accesorios/lentes': 'Lentes', 'accesorios/lentes/polarizados': 'Lentes', 'accesorios/lentes/no-polarizados': 'Lentes',
    'accesorios/otros/medias': 'Medias', 'accesorios/otros/medias/invisibles-cortas': 'Medias', 'accesorios/otros/medias/medianas-altas': 'Medias', 'accesorios/otros/billetera': 'Billetera', 'accesorios/otros/cinturones': 'Cinturón',
    'accesorios/otros/relojes': 'Reloj', 'accesorios/otros/toallas': 'Toalla', 'accesorios/otros/boxers': 'Boxer',
    'surf/lycras': 'Lycra', 'surf/trajes': 'Traje de Neoprene', 'surf/accesorios/ponchos': 'Poncho',
    'skates/skates-completos/skate': 'Skate Completo', 'skates/skates-completos/longboard': 'Longboard',
    'otros': 'Producto'
};

// Árbol completo de categorías válidas
const VALID_CATEGORIES = `
calzado
calzado/botas
calzado/championes
calzado/sandalias
calzado/sandalias/cuero
calzado/sandalias/goma-eva
calzado/ojotas
calzado/skate-pro
vestimenta
vestimenta/buzos
vestimenta/bermudas
vestimenta/bermudas/bermudas-de-paseo
vestimenta/bermudas/bermudas-de-playa
vestimenta/bikini
vestimenta/camperas
vestimenta/canguros
vestimenta/canguros/sin-cierre
vestimenta/canguros/con-cierre
vestimenta/camisas
vestimenta/camisas/manga-corta
vestimenta/camisas/manga-larga
vestimenta/gorros-de-invierno
vestimenta/musculosas
vestimenta/polleras
vestimenta/pantalones
vestimenta/pantalones/deportivos
vestimenta/pantalones/cargo
vestimenta/pantalones/jean
vestimenta/pantalones/pantalon-chino
vestimenta/pantalones/pantalones-tela
vestimenta/pantalones/pantalones-basicos
vestimenta/remeras
vestimenta/remeras/manga-corta
vestimenta/remeras/manga-larga
vestimenta/vestidos
accesorios
accesorios/bolsos
accesorios/bolsos/mochilas
accesorios/bolsos/bolsos-de-viaje
accesorios/bolsos/morrales
accesorios/bolsos/rinoneras
accesorios/bolsos/carteras
accesorios/bolsos/cartuchera
accesorios/bolsos/necessaire
accesorios/bolsos/luncheras
accesorios/bolsos/varios
accesorios/gorros
accesorios/gorros/gorras-de-visera
accesorios/gorros/gorras-de-visera/visera-chata
accesorios/gorros/gorras-de-visera/visera-curva
accesorios/gorros/gorros-de-lana
accesorios/gorros/sombreros
accesorios/lentes
accesorios/lentes/polarizados
accesorios/lentes/no-polarizados
accesorios/lentes/lectura
accesorios/lentes/accesorios
accesorios/outdoor
accesorios/outdoor/botellas-termicas
accesorios/outdoor/hamacas
accesorios/outdoor/sillas
accesorios/outdoor/lonas
accesorios/outdoor/navajas
accesorios/outdoor/varios
accesorios/otros
accesorios/otros/medias
accesorios/otros/medias/invisibles-cortas
accesorios/otros/medias/medianas-altas
accesorios/otros/bufanda
accesorios/otros/billetera
accesorios/otros/boxers
accesorios/otros/cinturones
accesorios/otros/fundas-de-celular
accesorios/otros/relojes
accesorios/otros/toallas
accesorios/otros/llaveros
accesorios/otros/stickers
accesorios/otros/varios
accesorios/protectores-solares
accesorios/protectores-solares/cuerpo
accesorios/protectores-solares/cara
accesorios/protectores-solares/labios
accesorios/protectores-solares/pelo
surf
surf/tablas
surf/tablas/shortboard
surf/tablas/mid
surf/tablas/soft
surf/tablas/longboard
surf/morey
surf/morey/iniciantes
surf/morey/pro
surf/morey/patas-de-rana
surf/sup
surf/sup/inflables
surf/sup/rigidos
surf/quillas
surf/quillas/fcs
surf/quillas/futures
surf/quillas/fcs-2
surf/quillas/tablon
surf/trajes
surf/trajes/trajes-de-hombre
surf/trajes/trajes-de-mujer
surf/trajes/trajes-de-nino
surf/trajes/chaquetas
surf/trajes/botitas
surf/trajes/guantes
surf/trajes/capuchas
surf/lycras
surf/accesorios
surf/accesorios/leash
surf/accesorios/pads
surf/accesorios/fundas
surf/accesorios/lycras
surf/accesorios/chalecos
surf/accesorios/ponchos
surf/accesorios/parafina
surf/accesorios/otros
accesorios/otros/medias
accesorios/otros/medias/invisibles-cortas
accesorios/otros/medias/medianas-altas
skates
skates/skates-completos
skates/skates-completos/skate
skates/skates-completos/surf-skate
skates/skates-completos/longboard
skates/skates-completos/cruiser
skates/accesorios
skates/accesorios/lija
skates/accesorios/tornillos
skates/accesorios/bushings
skates/accesorios/rulemanes
skates/accesorios/otros
skates/cascos
skates/guantes
skates/ruedas
skates/ruedas/ruedas-de-skate
skates/ruedas/ruedas-de-longboard-surf-skate
skates/rulemanes
skates/trucks
skates/trucks/trucks-de-skate
skates/trucks/trucks-de-surf-skate
skates/trucks/trucks-de-longboard-cruiser
skates/tablas
skates/tablas/tablas-de-skate
skates/tablas/tablas-de-surf-skate
skates/protecciones
skates/protecciones/casco
skates/protecciones/rodilleras
skates/protecciones/coderas
skates/protecciones/kit-completos
skates/calzado
skates/mochila
skates/rollers
otros
sandboard
`.trim();

async function analyzeProductForStock(productName, sku = '', manualBrand = '', excelColor = '') {
    try {
        const prompt = `Analiza el nombre del producto: "${productName}" y su SKU: "${sku}".
${manualBrand ? `NOTA: El usuario indicó que la marca es "${manualBrand}". Mapéala a la marca válida más cercana.` : ''}

Tu tarea es clasificar el producto correctamente.

═══════════════════════════════════════════
MARCAS VÁLIDAS (USAR EXACTAMENTE UNA):
═══════════════════════════════════════════
${VALID_BRANDS.join(', ')}

REGLAS DE MARCA:
- Mapear variantes: "Nike SB" → nike, "Rip Curl" → rip-curl, "O'Neill" → oneill, "DC" → dc-shoes, "TCSS" → critical-slide
- Si no está en la lista, usar "varias"

═══════════════════════════════════════════
CATEGORÍAS (USAR LA MÁS ESPECÍFICA):
═══════════════════════════════════════════
${VALID_CATEGORIES}

REGLAS DE CATEGORÍA:
- "Remera MC" o manga corta → vestimenta/remeras/manga-corta
- "Remera ML" o manga larga → vestimenta/remeras/manga-larga
- "Boardshort" → vestimenta/bermudas/bermudas-de-playa
- "Walkshort" → vestimenta/bermudas/bermudas-de-paseo
- "Cap" o "Gorra" → accesorios/gorros/gorras-de-visera/visera-curva
- "Trucker" → accesorios/gorros/gorras-de-visera/visera-chata

═══════════════════════════════════════════
COLORES VÁLIDOS (USAR EXACTAMENTE UNO):
═══════════════════════════════════════════
${VALID_COLORS.join(', ')}

REGLAS DE COLOR:
- Traducir el color al más cercano de la lista, incluyendo nombres creativos de marcas
- "Navy", "Dark Blue", "Indigo", "Indigo Blue" → azul
- "Light Blue", "Sky Blue", "Sky", "Sea" → celeste
- "Purple" → violeta
- "Burgundy", "Wine", "Merlot", "Oxblood" → bordeaux
- "Tan", "Cream", "Off White", "Bone", "Egret", "Egg", "Ivory", "Natural", "Oatmeal", "Vintage White" → beige
- "Brown", "Chocolate", "Coffee", "Espresso", "Walnut" → marron
- "Gold", "Mustard", "Ochre", "Amber" → mostaza
- "Stone", "Slate", "Charcoal", "Ash", "Heather", "Steel", "Pewter", "Fog", "Cement", "Concrete" → gris
- "Khaki", "Sand", "Dune", "Camel", "Desert" → beige
- "Coral", "Salmon", "Blush", "Dusty Rose" → rosa
- "Olive", "Forest", "Sage", "Moss", "Military", "Army", "Camo" → verde
- "Rust", "Terracotta", "Brick", "Clay" → naranja
- Si tiene varios colores claramente distinguibles → multicolor
- Si tiene un estampado/print → patron
- Si el nombre del color es MUY ESOTÉRICO y no podés deducir el color real con confianza → devolver "" (vacío)
- NUNCA adivinar. Si no estás seguro, dejá vacío

═══════════════════════════════════════════
MODELO:
═══════════════════════════════════════════
- El MODELO es el nombre del diseño/línea SIN la marca, SIN la categoría, SIN el color
- NO incluir "MC", "ML", "manga corta", "manga larga" en el modelo
- Ejemplo: "Remera MC Critical Slide Band Negro" → model: "Band"

Responde SOLO JSON válido:
{
  "brand": "critical-slide",
  "sex": "Hombre",
  "category": "vestimenta/remeras/manga-corta",
  "model": "Band",
  "color": "negro"
}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: 'Eres un experto en clasificación de productos. Usas EXACTAMENTE las marcas, categorías y colores de las listas válidas. Nunca inventas valores.'
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.1,
                max_tokens: 200
            })
        });

        if (!response.ok) {
            console.error('API Error', response.status);
            throw new Error('API Error');
        }

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '{}';

        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);

            // Validar marca
            let brandSlug = (result.brand || '').toLowerCase().trim();
            if (!VALID_BRANDS.includes(brandSlug)) {
                console.warn(`Marca "${brandSlug}" no válida, usando 'varias'`);
                brandSlug = 'varias';
            }

            // Validar color - si la IA devolvió vacío, intentar con el color del Excel
            let color = (result.color || '').toLowerCase().trim();

            // Si la IA no detectó color, intentar con el color del Excel
            if (!color && excelColor) {
                color = excelColor.toLowerCase().trim();
            }

            if (color && !VALID_COLORS.includes(color)) {
                console.warn(`Color "${color}" no válido, mapeando...`);
                const colorMap = {
                    'negro': 'negro', 'black': 'negro', 'blk': 'negro',
                    'blanco': 'blanco', 'white': 'blanco', 'wht': 'blanco',
                    'azul': 'azul', 'blue': 'azul', 'navy': 'azul', 'nvy': 'azul', 'indigo': 'azul',
                    'verde': 'verde', 'green': 'verde', 'grn': 'verde', 'olive': 'verde', 'sage': 'verde',
                    'rojo': 'rojo', 'red': 'rojo',
                    'gris': 'gris', 'grey': 'gris', 'gray': 'gris', 'stone': 'gris', 'charcoal': 'gris', 'slate': 'gris', 'heather': 'gris',
                    'amarillo': 'amarillo', 'yellow': 'amarillo',
                    'naranja': 'naranja', 'orange': 'naranja', 'rust': 'naranja', 'terracotta': 'naranja',
                    'rosa': 'rosa', 'pink': 'rosa', 'coral': 'rosa', 'salmon': 'rosa', 'blush': 'rosa',
                    'violeta': 'violeta', 'purple': 'violeta',
                    'marron': 'marron', 'brown': 'marron', 'brn': 'marron', 'chocolate': 'marron',
                    'beige': 'beige', 'tan': 'beige', 'cream': 'beige', 'khaki': 'beige', 'sand': 'beige', 'egret': 'beige', 'natural': 'beige', 'oatmeal': 'beige',
                    'multicolor': 'multicolor', 'multi': 'multicolor',
                    'celeste': 'celeste', 'light blue': 'celeste', 'sky': 'celeste',
                    'bordeaux': 'bordeaux', 'burgundy': 'bordeaux', 'wine': 'bordeaux', 'merlot': 'bordeaux',
                    'mostaza': 'mostaza', 'mustard': 'mostaza', 'ochre': 'mostaza',
                    'lila': 'lila', 'lilac': 'lila', 'lavender': 'lila',
                    'carey': 'carey', 'tortoise': 'carey', 'patron': 'patron', 'print': 'patron'
                };
                color = colorMap[color] || '';  // Si no lo encuentra → vacío, NO adivinar
            }

            const category = result.category || 'otros';
            const model = result.model || '';

            // Obtener nombre bonito de marca y categoría
            const brandDisplay = BRAND_DISPLAY_NAMES[brandSlug] || brandSlug;
            const categoryDisplay = CATEGORY_DISPLAY_NAMES[category] || category.split('/').pop().replace(/-/g, ' ');

            // Capitalizar color (si existe)
            const colorDisplay = color ? color.charAt(0).toUpperCase() + color.slice(1) : '';

            // Preservar las palabras originales que vienen ANTES de la marca en el nombre del Excel
            const productNameLower = productName.toLowerCase();
            const brandDisplayLower = brandDisplay.toLowerCase();
            const brandSlugClean = brandSlug.replace(/-/g, ' ');

            // Buscar dónde aparece la marca en el nombre original
            let brandIndex = productNameLower.indexOf(brandDisplayLower);
            if (brandIndex === -1) {
                brandIndex = productNameLower.indexOf(brandSlugClean);
            }

            let prefixFromOriginal = '';
            if (brandIndex > 0) {
                // Usar las palabras originales previas a la marca (respetando el orden del Excel)
                prefixFromOriginal = productName.substring(0, brandIndex).trim();
                // Capitalizar cada palabra del prefijo
                prefixFromOriginal = prefixFromOriginal.split(' ')
                    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                    .join(' ');
            } else {
                // Fallback: usar el nombre de categoría mapeado
                prefixFromOriginal = categoryDisplay;
            }

            // Limpiar abreviaturas de manga y palabras redundantes con la categoría
            const redundantWords = /\b(s\/s|m\/c|m\/l|l\/s|mc|ml|ss|ls|sm|cap|hat)\b/gi;
            prefixFromOriginal = prefixFromOriginal.replace(redundantWords, '').replace(/\s+/g, ' ').trim();
            const cleanModel = model.replace(redundantWords, '').replace(/\s+/g, ' ').trim();

            // Construir nombre: palabras originales pre-marca + marca + modelo
            let finalName = `${prefixFromOriginal} ${brandDisplay} ${cleanModel}`.trim();
            finalName = finalName.replace(/\s+/g, ' ');

            if (colorDisplay) {
                finalName += ` - ${colorDisplay}`;
            }

            return {
                brand: brandSlug,  // Para CSV: "critical-slide"
                sex: result.sex || 'Unisex',
                category,  // Para CSV: "vestimenta/remeras/manga-corta"
                model,
                color,  // Para CSV: "verde"
                standardizedName: finalName  // Para ecommerce: "Remera Critical Slide Band - Verde"
            };
        }

    } catch (e) {
        console.error('Error in analyzeProductForStock:', e);
    }

    // Fallback
    const fallbackBrand = manualBrand ? manualBrand.toLowerCase().replace(/\s+/g, '-') : 'varias';
    return {
        brand: VALID_BRANDS.includes(fallbackBrand) ? fallbackBrand : 'varias',
        sex: 'Unisex',
        category: 'otros',
        model: productName,
        color: excelColor?.toLowerCase() || '',
        standardizedName: productName
    };
}

// =============================================
// GENERACIÓN DE DESCRIPCIONES (via Backend)
// =============================================

const BACKEND_URL = '';

async function generateProductDescriptions(productName, brand = '') {
    try {
        addLog(`📝 Generando descripciones...`, 'info');

        const product = {
            nombreOriginal: productName,
            marca: brand || '',
            modelo: productName
        };

        // Llamar al backend Node.js
        const response = await fetch(`${BACKEND_URL}/api/generate-descriptions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ product })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error del backend:', errorData);
            addLog(`⚠️ Error API ${response.status}`, 'warning');
            return await generateProductDescriptionsFallback(productName);
        }

        const result = await response.json();

        if (result.fuentes?.length > 0) {
            addLog(`✓ Descripciones con ${result.fuentes.length} fuentes web`, 'success');
        } else {
            addLog(`✓ Descripciones generadas`, 'success');
        }

        return {
            short: result.descripcion_255 || '',
            long: result.descripcion_larga || ''
        };

    } catch (e) {
        console.error('Error llamando al backend:', e);

        if (e.message.includes('Failed to fetch')) {
            addLog(`⚠️ Backend no disponible (cd server && npm start)`, 'error');
        } else {
            addLog(`⚠️ Error: ${e.message}`, 'error');
        }

        return await generateProductDescriptionsFallback(productName);
    }
}

// Fallback function without web search (in case the API fails)
async function generateProductDescriptionsFallback(productName) {
    try {
        const prompt = `Escribí descripciones para el producto: "${productName}".

INSTRUCCIONES:
Vas a escribir descripciones para una tienda online uruguaya. Escribí como habla un uruguayo: simple, directo, sin rebusques. Las descripciones van de cara al público.

DESCRIPCIÓN CORTA (máximo 255 caracteres):
Escribí un texto redactado y fluido, NO en formato de lista. Describí brevemente qué es el producto basándote solo en lo que podés deducir del nombre. Si no sabés los materiales, no los menciones.

DESCRIPCIÓN LARGA:
SOLO escribí algo si tenés información adicional que sume a la corta. Si ya dijiste todo en la corta, dejá la larga VACÍA ("").

REGLAS:
- Escribí redactado, NO en formato de lista ni bullets
- NO inventes datos ni materiales
- NO pongas "no especifica" ni "sin información" - simplemente no pongas nada
- NO uses frases de marketing
- NO pongas emojis
- Usá vocabulario uruguayo: cierre (no cremallera), buzo (no sudadera), campera (no chaqueta), championes (no zapatillas), remera (no camiseta), bermudas (no pantalones cortos), malla (no bañador), pollera (no falda), lentes de sol (no gafas)

Responde SOLO JSON: {"short": "texto redactado max 255 chars", "long": "solo si suma algo nuevo, sino vacío ''"}`;

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 400
            })
        });

        if (!response.ok) return { short: '', long: '' };

        const data = await response.json();
        const content = data.choices[0]?.message?.content || '{}';
        const jsonMatch = content.match(/\{[\s\S]*\}/);

        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            return {
                short: result.short || '',
                long: result.long || ''
            };
        }
        return { short: '', long: '' };
    } catch (e) {
        console.error('Fallback Description Error:', e);
        return { short: '', long: '' };
    }
}

// =============================================
// DESCARGA DE STOCK
// =============================================

function downloadStockExcel() {
    if (!appState.processedStock.length) return;

    // Define headers in the correct order
    const headers = [
        'CODIGO_PRODUCTO',
        'CODIGO_VARIANTE',
        'CATEGORIA',
        'DESCRIPCION_CORTA',
        'DESCRIPCION-LARGA',
        'FECHA_AGREGADO',
        'SEXO',
        'MARCA',
        'NOMBRE_PRODUCTO',
        'COLOR',
        'HABILITADO',
        // Nuevas columnas
        'LARGO-DEL-TRAJE',
        'GUIA_TALLES',
        'FIN-SET-UP',
        'FIN-SYSTEM',
        'TIPO-DE-BERMUDA',
        'TIPO-DE-LENTES',
        'TAMANO',
        'TIPOS-DE-TABLAS'
    ];

    // Create CSV content manually to ensure format and no BOM
    const separator = ','; // Standard CSV format with comma
    const csvRows = [];

    // Add headers (also quoted)
    csvRows.push(headers.map(h => `"${h}"`).join(separator));

    // Add data
    appState.processedStock.forEach(row => {
        const values = headers.map(header => {
            let val = row[header];

            // Convert to string
            if (val === null || val === undefined) {
                val = '';
            } else {
                val = String(val);
            }

            // Ensure date format uses hyphens
            if (header === 'FECHA_AGREGADO') {
                val = val.replace(/\//g, '-');
            }

            // Escape internal quotes and ALWAYS wrap in quotes for string format
            val = val.replace(/"/g, '""');
            return `"${val}"`;
        });
        csvRows.push(values.join(separator));
    });

    const csvContent = csvRows.join('\n');

    // UTF-8 BOM + contenido para compatibilidad con Fenicio y Excel
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' });

    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `stock_procesado_${timestamp}.csv`;

    // Create download link
    const link = document.createElement('a');
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        addLog(`Descargando archivo CSV: ${filename}`, 'info');
    }
}

// =============================================
// INICIALIZACIÓN STOCK GENERATOR
// =============================================

function initializeStockGeneratorListeners() {
    // Mode Tabs
    initializeModeTabs();

    // Stock Listeners
    if (elements.processStockBtn) elements.processStockBtn.addEventListener('click', processStockFile);
    if (elements.downloadStockBtn) elements.downloadStockBtn.addEventListener('click', downloadStockExcel);
    if (elements.newStockFileBtn) elements.newStockFileBtn.addEventListener('click', resetApp);
}
