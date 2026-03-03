# IMG Finder

Aplicación web para buscar imágenes de productos y generar datos de stock con IA.

## 📁 Estructura del Proyecto

```
PROYECTO IMG FINDER/
├── index.html            # Interfaz principal
├── styles.css            # Estilos
├── app.js                # Punto de entrada (inicialización)
├── shared.js             # Configuración y utilidades compartidas
├── imageFinder.js        # Módulo de búsqueda de imágenes
├── stockGenerator.js     # Módulo de generación de stock
├── unifiedMode_v2.js     # Modo unificado (stock + imágenes)
├── .env                  # API Keys (NO subir a git)
├── .gitignore            # Archivos excluidos de git
├── Dockerfile            # Configuración para deploy en la nube
├── .dockerignore         # Archivos excluidos del deploy
├── server/               # Backend Node.js
│   ├── index.js          # Servidor Express (API + frontend)
│   ├── openaiClient.js   # Cliente OpenAI con web search
│   └── package.json      # Dependencias del backend
└── README.md             # Este archivo
```

## 🚀 Instalación

### 1. Clonar/Descargar el proyecto

### 2. Configurar API Keys

Crear archivo `.env` en la raíz del proyecto:

```env
GOOGLE_API_KEY=tu-api-key-google
GOOGLE_CSE_ID=tu-cse-id
OPENAI_API_KEY=tu-api-key-openai
GEMINI_API_KEY=tu-api-key-gemini
REMOVEBG_API_KEY=tu-api-key-removebg
```

### 3. Instalar dependencias del backend

```bash
cd server
npm install
```

### 4. Iniciar la aplicación

```bash
cd server
npm start
```

La app completa (frontend + backend) estará en `http://localhost:8080`

## 📋 Modos de Uso

### Modo Imágenes
1. Subir Excel con productos (columnas: Nombre, SKU, Color)
2. Analizar con IA
3. Seleccionar productos
4. El sistema busca imágenes y las valida con IA

### Modo Stock
1. Cambiar a pestaña "Generador Stock"
2. Subir Excel con productos
3. Opcionalmente ingresar marca manual
4. El sistema genera: Categoría, Sexo, Nombre, Descripciones

### Modo Unificado
1. Cambiar a pestaña "Modo Unificado"
2. Procesa stock + busca imágenes en un solo paso
3. Vista en tiempo real tipo hoja de cálculo

## 🔧 APIs Utilizadas

| API | Uso |
|-----|-----|
| Google Custom Search | Búsqueda de imágenes |
| OpenAI (GPT-4o-mini) | Análisis de productos, validación de imágenes |
| OpenAI (GPT-4o) | Generación de descripciones con web search |
| Gemini | Descripción visual de imágenes (fallback) |
| RemoveBG | Eliminación de fondos (opcional) |

## 📡 Arquitectura

```
┌─────────────────────────────────────────────────┐
│          Backend Node.js (Express)              │
│          localhost:8080                          │
│                                                 │
│  ┌──────────────┐   ┌────────────────────────┐  │
│  │  Frontend     │   │  API Endpoints         │  │
│  │  (Estático)   │   │  /api/config           │  │
│  │  index.html   │   │  /api/generate-desc    │  │
│  │  *.js, *.css  │   │  /api/openai/chat      │  │
│  └──────────────┘   │  /api/scrape-images     │  │
│                      └──────────┬─────────────┘  │
└─────────────────────────────────┼────────────────┘
                                  │
                    ┌─────────────┼─────────────┐
                    │             │             │
              ┌─────▼─────┐ ┌────▼────┐ ┌──────▼──────┐
              │  OpenAI   │ │ Google  │ │   Gemini    │
              │  API      │ │ Search  │ │   API       │
              └───────────┘ └─────────┘ └─────────────┘
```

## ☁️ Deploy en la Nube

### Google Cloud Run

```bash
gcloud run deploy img-finder \
  --source . \
  --region southamerica-east1 \
  --allow-unauthenticated \
  --set-env-vars "GOOGLE_API_KEY=...,OPENAI_API_KEY=...,..."
```

### Docker (local)

```bash
docker build -t img-finder .
docker run -p 8080:8080 --env-file .env img-finder
```

## 📝 Notas

- Las API keys se configuran SOLO en el archivo `.env`
- El backend sirve tanto la API como el frontend estático
- NUNCA subir `.env` a repositorios públicos
