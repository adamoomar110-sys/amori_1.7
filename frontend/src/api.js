import axios from 'axios';

const API_BASE = import.meta.env.DEV ? '/api' : '';

const DEFAULT_VOICES = [
    { ShortName: "es-AR-TomasNeural", FriendlyName: "Tomás (Argentina - H)" },
    { ShortName: "es-AR-ElenaNeural", FriendlyName: "Elena (Argentina - M)" },
    { ShortName: "es-VE-SebastianNeural", FriendlyName: "Sebastián (Venezuela - H)" },
    { ShortName: "es-VE-PaolaNeural", FriendlyName: "Paola (Venezuela - M)" },
    { ShortName: "pt-BR-AntonioNeural", FriendlyName: "Antônio (Portugués - H)" },
    { ShortName: "pt-BR-FranciscaNeural", FriendlyName: "Francisca (Portugués - M)" },
    { ShortName: "en-US-GuyNeural", FriendlyName: "Guy (Inglés - H)" },
    { ShortName: "en-US-JennyNeural", FriendlyName: "Jenny (Inglés - M)" },
    { ShortName: "it-IT-DiegoNeural", FriendlyName: "Diego (Italiano - H)" },
    { ShortName: "it-IT-ElsaNeural", FriendlyName: "Elsa (Italiano - M)" },
    { ShortName: "fr-FR-HenriNeural", FriendlyName: "Henri (Francés - H)" },
    { ShortName: "fr-FR-DeniseNeural", FriendlyName: "Denise (Francés - M)" },
    { ShortName: "de-DE-ConradNeural", FriendlyName: "Conrad (Alemán - H)" },
    { ShortName: "de-DE-KatjaNeural", FriendlyName: "Katja (Alemán - M)" }
];

let engineModePromise = null;
let pdfJsPromise = null;

const pdfDocCache = new Map();
const pageImageCache = new Map();
const pageRenderInFlight = new Map();
const translationCache = new Map();
const audioBlobCache = new Map();
const audioInFlight = new Map();

function detectEngineMode() {
    if (!engineModePromise) {
        engineModePromise = (async () => {
            try {
                const res = await axios.get(`${API_BASE}/voices`, { timeout: 2500 });
                if (Array.isArray(res.data) && res.data.length > 0 && res.data[0]?.ShortName) {
                    return 'fastapi';
                }
                return 'web';
            } catch {
                return 'web';
            }
        })();
    }
    return engineModePromise;
}

// ============================================================
// IndexedDB Storage para Modo Web Cloud (aura-adamo.site/amori)
// ============================================================
const DB_NAME = 'amori_aura_web_v1';
const STORE_NAME = 'books';

function openWebDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'doc_id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function dbGetAllBooks() {
    const db = await openWebDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => {
            const list = (req.result || []).map(({ pdfBytes, ...meta }) => meta);
            resolve(list);
        };
        req.onerror = () => reject(req.error);
    });
}

async function dbGetBook(docId) {
    const db = await openWebDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(docId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
    });
}

async function dbPutBook(record) {
    const db = await openWebDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).put(record);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

async function dbDeleteBook(docId) {
    const db = await openWebDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const req = tx.objectStore(STORE_NAME).delete(docId);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
    });
}

// ============================================================
// Motor PDF.js en Navegador (Render HD + Extracción de Texto)
// ============================================================
function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfJsPromise) {
        pdfJsPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.async = true;
            script.onload = () => {
                if (window.pdfjsLib) {
                    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    resolve(window.pdfjsLib);
                } else {
                    reject(new Error('No se pudo inicializar PDF.js'));
                }
            };
            script.onerror = () => reject(new Error('Error cargando librería PDF.js'));
            document.head.appendChild(script);
        });
    }
    return pdfJsPromise;
}

function cleanExtractedText(raw) {
    if (!raw) return '';
    return raw
        .replace(/(\w)-\s+(\w)/g, '$1$2')
        .replace(/[•●▪■]/g, ', ')
        .replace(/\s+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

async function getWebPdfDoc(docId) {
    if (pdfDocCache.has(docId)) {
        return pdfDocCache.get(docId);
    }
    const book = await dbGetBook(docId);
    if (!book || !book.pdfBytes) {
        throw new Error('Documento no encontrado en tu biblioteca local.');
    }
    const pdfjsLib = await loadPdfJs();
    const safeCopy = new Uint8Array(book.pdfBytes).slice();
    const pdfDoc = await pdfjsLib.getDocument({ data: safeCopy }).promise;
    pdfDocCache.set(docId, pdfDoc);
    return pdfDoc;
}

// ============================================================
// API Pública Unificada (FastAPI Local + Web Cloud)
// ============================================================
export const uploadPDF = async (file) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post(`${API_BASE}/upload`, formData);
        return response.data;
    }

    // Modo Web Cloud
    const existing = await dbGetAllBooks();
    const match = existing.find((b) => b.filename === file.name);
    if (match) {
        return {
            doc_id: match.doc_id,
            status: 'ready',
            filename: match.filename,
            total_pages: match.total_pages,
            last_page: match.last_page || 1
        };
    }

    const pdfjsLib = await loadPdfJs();
    const rawBuffer = await file.arrayBuffer();
    const workerCopy = new Uint8Array(rawBuffer).slice();
    const pdfDoc = await pdfjsLib.getDocument({ data: workerCopy }).promise;

    const totalPages = pdfDoc.numPages;
    const pages = [];
    for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        let lastY = null;
        let pageStr = '';
        for (const item of content.items) {
            const str = item.str || '';
            const y = item.transform ? item.transform[5] : null;
            if (lastY !== null && y !== null && Math.abs(y - lastY) > 6) {
                pageStr += '\n';
            } else if (pageStr && !pageStr.endsWith(' ') && !pageStr.endsWith('\n')) {
                pageStr += ' ';
            }
            pageStr += str;
            if (y !== null) lastY = y;
        }
        pages.push({ page: i, text: cleanExtractedText(pageStr) });
    }

    const docId = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `doc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await dbPutBook({
        doc_id: docId,
        filename: file.name,
        status: 'ready',
        total_pages: totalPages,
        last_page: 1,
        pages,
        pdfBytes: rawBuffer,
        createdAt: Date.now()
    });

    pdfDocCache.set(docId, pdfDoc);

    return {
        doc_id: docId,
        status: 'ready',
        filename: file.name,
        total_pages: totalPages,
        last_page: 1
    };
};

export const getVoices = async () => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.get(`${API_BASE}/voices`);
        return response.data;
    }
    return DEFAULT_VOICES;
};

export const getLibrary = async () => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.get(`${API_BASE}/library`);
        return response.data;
    }
    return dbGetAllBooks();
};

export const deleteBook = async (docId) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.delete(`${API_BASE}/library/${docId}`);
        return response.data;
    }
    pdfDocCache.delete(docId);
    await dbDeleteBook(docId);
    return { status: 'success', message: 'Book deleted' };
};

export const getAudioUrl = (docId, pageNum, voice = "es-AR-TomasNeural", translate = false) => {
    return `${API_BASE}/audio/${docId}/${pageNum}?voice=${voice}&translate=${translate}`;
};

export const getPageImageUrl = (docId, pageNum) => {
    return `${API_BASE}/document/${docId}/image/${pageNum}`;
};

export const resolvePageImageUrl = async (docId, pageNum) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        return getPageImageUrl(docId, pageNum);
    }

    const cacheKey = `${docId}:${pageNum}`;
    if (pageImageCache.has(cacheKey)) {
        return pageImageCache.get(cacheKey);
    }
    if (pageRenderInFlight.has(cacheKey)) {
        return pageRenderInFlight.get(cacheKey);
    }

    const renderPromise = (async () => {
        try {
            const pdfDoc = await getWebPdfDoc(docId);
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.6 });
            const canvas = document.createElement('canvas');
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({ canvasContext: ctx, viewport }).promise;

            const blobUrl = await new Promise((resolve) => {
                canvas.toBlob((blob) => {
                    if (blob) {
                        resolve(URL.createObjectURL(blob));
                    } else {
                        resolve(canvas.toDataURL('image/jpeg', 0.88));
                    }
                }, 'image/jpeg', 0.88);
            });

            pageImageCache.set(cacheKey, blobUrl);
            return blobUrl;
        } finally {
            pageRenderInFlight.delete(cacheKey);
        }
    })();

    pageRenderInFlight.set(cacheKey, renderPromise);
    return renderPromise;
};

export const getPageText = async (docId, pageNum, translate = false, voice = "es-AR-TomasNeural") => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.get(`${API_BASE}/document/${docId}/text/${pageNum}?translate=${translate}&voice=${voice}`);
        return response.data.text;
    }

    const book = await dbGetBook(docId);
    if (!book || !Array.isArray(book.pages) || pageNum < 1 || pageNum > book.pages.length) {
        return '';
    }
    const rawText = book.pages[pageNum - 1]?.text || '';
    if (!translate || !rawText.trim()) {
        return rawText;
    }

    const targetLang = voice.split('-')[0] || 'es';
    const transKey = `${docId}:${pageNum}:${targetLang}`;
    if (translationCache.has(transKey)) {
        return translationCache.get(transKey);
    }

    const res = await axios.post('./api.php?action=translate', {
        text: rawText,
        target: targetLang
    });
    const translated = res.data?.text ?? rawText;
    translationCache.set(transKey, translated);
    return translated;
};

export const resolveAudioUrl = async (docId, pageNum, voice = "es-AR-TomasNeural", translate = false) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        return getAudioUrl(docId, pageNum, voice, translate);
    }

    const audioKey = `${docId}:${pageNum}:${voice}:${translate}`;
    if (audioBlobCache.has(audioKey)) {
        return audioBlobCache.get(audioKey);
    }
    if (audioInFlight.has(audioKey)) {
        return audioInFlight.get(audioKey);
    }

    const job = (async () => {
        try {
            const text = await getPageText(docId, pageNum, translate, voice);
            const cleanText = text && text.trim()
                ? text.replace(/\n+/g, '. ').replace(/\s+/g, ' ').trim()
                : (voice.startsWith('es') ? `Página ${pageNum}.` : `Page ${pageNum}.`);

            const res = await fetch('./api.php?action=tts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanText, voice })
            });

            if (!res.ok) {
                throw new Error(`TTS HTTP ${res.status}`);
            }

            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            audioBlobCache.set(audioKey, blobUrl);
            return blobUrl;
        } finally {
            audioInFlight.delete(audioKey);
        }
    })();

    audioInFlight.set(audioKey, job);
    return job;
};

export const prefetchAudio = async (docId, pageNum, voice = "es-AR-TomasNeural", translate = false) => {
    try {
        const mode = await detectEngineMode();
        if (mode === 'fastapi') {
            await fetch(getAudioUrl(docId, pageNum, voice, translate), { priority: 'low' });
        } else {
            await resolveAudioUrl(docId, pageNum, voice, translate);
        }
    } catch {
        // Ignorar errores silenciosos de precarga
    }
};

export const getDocStatus = async (docId) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.get(`${API_BASE}/document/${docId}/status`);
        return response.data;
    }

    const book = await dbGetBook(docId);
    if (!book) {
        return { status: 'error', error: 'Documento no encontrado' };
    }
    return {
        status: 'ready',
        total_pages: book.total_pages || (book.pages ? book.pages.length : 0),
        last_page: book.last_page || 1
    };
};

export const updateProgress = async (docId, page) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.post(`${API_BASE}/document/${docId}/progress`, { page });
        return response.data;
    }

    const book = await dbGetBook(docId);
    if (book) {
        book.last_page = page;
        await dbPutBook(book);
    }
    return { status: 'success', page };
};

export const getSummary = async (docId) => {
    const mode = await detectEngineMode();
    if (mode === 'fastapi') {
        const response = await axios.post(`${API_BASE}/document/${docId}/summary`);
        return response.data;
    }

    const book = await dbGetBook(docId);
    if (!book) {
        throw new Error('Libro no encontrado');
    }
    const sampleText = (book.pages || [])
        .slice(0, 35)
        .map((p) => p.text)
        .join('\n\n')
        .slice(0, 18000);

    const response = await axios.post('./api.php?action=summary', {
        title: book.filename,
        text: sampleText
    });
    return response.data;
};
