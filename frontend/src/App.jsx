import React, { useState, useEffect, useRef } from 'react';
import { uploadPDF, getAudioUrl, getPageImageUrl, getDocStatus, getVoices, getLibrary, deleteBook, updateProgress, getSummary } from './api';
import { Square, Cat, Dog, Leaf, Sparkles, X } from 'lucide-react';
import './BookStyles.css';

import { themes } from './themeConfig';
import FlipBook from './components/FlipBook';
import SplashScreen from './components/SplashScreen';

function App() {
    const [showSplash, setShowSplash] = useState(true);
    const [docId, setDocId] = useState(null);

    // Initialize theme
    const [theme, setTheme] = useState('nature');

    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Helper to calculate progress percentage
    const getProgress = (book) => {
        if (!book.total_pages || book.total_pages === 0) return 0;
        return Math.round((book.last_page / book.total_pages) * 100);
    };

    // Safety check
    const t = themes[theme] || themes.nature;

    // Save reading progress
    const [totalPages, setTotalPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isUploading, setIsUploading] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const [voices, setVoices] = useState([]);
    const [selectedVoice, setSelectedVoice] = useState("es-AR-TomasNeural");
    const [jumpPage, setJumpPage] = useState("");
    const [library, setLibrary] = useState([]);
    const [showLibrary, setShowLibrary] = useState(true);
    const [isTranslated, setIsTranslated] = useState(false);

    const [layoutMode, setLayoutMode] = useState(window.innerWidth < 768 ? 'single' : 'double');

    const audioRef = useRef(null);
    const autoAdvanceRef = useRef(false);
    const flipBookRef = useRef(null);

    useEffect(() => {
        if (docId && currentPage) {
            const timer = setTimeout(() => {
                updateProgress(docId, currentPage).catch(e => console.error("Failed to save progress", e));
            }, 2000);
            return () => clearTimeout(timer);
        }
    }, [docId, currentPage]);

    useEffect(() => {
        getVoices().then(setVoices).catch(console.error);
        getLibrary().then(setLibrary).catch(console.error);
    }, []);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    useEffect(() => {
        if (docId && audioRef.current) {
            audioRef.current.src = getAudioUrl(docId, currentPage, selectedVoice, isTranslated);
            if (audioRef.current) {
                audioRef.current.playbackRate = playbackRate;
            }

            if (isPlaying || autoAdvanceRef.current) {
                const playPromise = audioRef.current.play();
                if (playPromise !== undefined) {
                    playPromise
                        .then(() => {
                            setIsPlaying(true);
                            autoAdvanceRef.current = false;
                        })
                        .catch(e => {
                            console.log("Autoplay prevented/failed", e);
                            setIsPlaying(false);
                            autoAdvanceRef.current = false;
                        });
                }
            }
        }
    }, [docId, currentPage, selectedVoice, isTranslated]);

    const handleUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const initData = await uploadPDF(file);
            const docId = initData.doc_id;

            const pollInterval = setInterval(async () => {
                try {
                    const statusData = await getDocStatus(docId);
                    if (statusData.status === 'ready') {
                        clearInterval(pollInterval);
                        setDocId(docId);
                        setTotalPages(statusData.total_pages);
                        setCurrentPage(statusData.last_page || 1);
                        setIsUploading(false);
                    } else if (statusData.status === 'error') {
                        clearInterval(pollInterval);
                        setIsUploading(false);
                        alert(`Error processing PDF: ${statusData.error}`);
                    }
                } catch (e) {
                    console.error("Polling error", e);
                }
            }, 1000);

        } catch (error) {
            console.error("Upload failed", error);
            const msg = error.response?.data?.detail || error.message || "Error desconocido";
            alert(`Error subiendo archivo: ${msg}. Verifica que el servidor (backend) esté corriendo.`);
            setIsUploading(false);
        }
    };

    const handleSelectBook = (book) => {
        setDocId(book.doc_id);
        setTotalPages(book.total_pages || 0);
        setCurrentPage(book.last_page || 1);
    };

    const handleDeleteBook = async (e, bookId) => {
        e.stopPropagation();
        if (!window.confirm("¿Seguro que quieres eliminar este libro?")) return;

        try {
            await deleteBook(bookId);
            setLibrary(prev => prev.filter(b => b.doc_id !== bookId));
            if (docId === bookId) {
                setDocId(null);
            }
            alert("Libro eliminado de la biblioteca.");
        } catch (error) {
            console.error("Failed to delete book", error);
            alert("Error al eliminar el libro");
        }
    };

    const [summary, setSummary] = useState(null);
    const [isSummaryLoading, setIsSummaryLoading] = useState(false);
    const [showSummaryModal, setShowSummaryModal] = useState(false);

    const handleGetSummary = async (id = null) => {
        const targetId = id || docId;
        if (!targetId) return;

        setIsSummaryLoading(true);
        setShowSummaryModal(true);
        try {
            const data = await getSummary(targetId);
            setSummary(data.summary);
        } catch (error) {
            console.error("Summary failed", error);
            setSummary("Error al generar el resumen. Verifica tu conexión o clave API.");
        } finally {
            setIsSummaryLoading(false);
        }
    };

    const handleAudioEnded = () => {
        if (currentPage < totalPages) {
            autoAdvanceRef.current = true;
            // Trigger flip via ref
            if (flipBookRef.current) {
                flipBookRef.current.flipNext();
            }
        } else {
            setIsPlaying(false);
        }
    };

    useEffect(() => {
        if (docId && currentPage < totalPages) {
            const nextPage = currentPage + 1;
            const nextAudioUrl = getAudioUrl(docId, nextPage, selectedVoice, isTranslated);
            fetch(nextAudioUrl, { priority: 'low' }).catch(e => console.log("Prefetch harmless error:", e));
        }
    }, [docId, currentPage, totalPages, selectedVoice, isTranslated]);


    useEffect(() => {
        if (currentPage) setJumpPage(currentPage);
    }, [currentPage]);

    const handleJump = () => {
        const val = parseInt(jumpPage);
        if (!isNaN(val) && val >= 1 && val <= totalPages) {
            if (flipBookRef.current) {
                flipBookRef.current.turnToPage(val);
            }
        } else {
            setJumpPage(currentPage);
        }
    };

    const togglePlay = () => {
        if (audioRef.current) {
            if (isPlaying) {
                audioRef.current.pause();
            } else {
                audioRef.current.play();
            }
            setIsPlaying(!isPlaying);
        }
    };

    const handleStop = () => {
        if (audioRef.current) {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
            setIsPlaying(false);
        }
    };

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    if (showSplash) {
        return <SplashScreen onComplete={() => setShowSplash(false)} />;
    }

    return (
        // Added flex and flex-col to ensure footer stays at bottom
        <div className={`min-h-screen font-sans transition-colors duration-500 relative flex flex-col ${t.bg}`}>
            <header className={`sticky top-0 z-[100] backdrop-blur-md border-b p-3 shadow-lg transition-colors duration-500 relative ${t.header}`}>
                <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        {docId && (
                            <button
                                onClick={() => setDocId(null)}
                                title="Volver a la biblioteca"
                                className={`p-2 rounded-full transition-colors ${t.buttonSecondary}`}
                            >
                                <span>Inicio</span>
                            </button>
                        )}
                        {!docId && (
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                                <h1 className={`text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r ${t.titleGradient}`}>
                                    Amori
                                </h1>
                            </div>
                        )}
                        {/* Theme Switcher - Now visible always, but styled differently if needed */}
                        <div className="flex gap-1 ml-0 sm:ml-4">
                            {Object.values(themes).map(th => {
                                const IconComponent = { square: Square, cat: Cat, dog: Dog, leaf: Leaf }[th.icon] || Square;
                                return (
                                    <button
                                        key={th.id}
                                        onClick={() => setTheme(th.id)}
                                        className={`p-1.5 rounded-full border transition-all ${theme === th.id ? 'scale-110 shadow-md ' + t.ringColor : 'opacity-70 hover:opacity-100'} ${th.id === 'default' ? 'bg-gray-800' : th.id === 'kitten' ? 'bg-pink-300' : th.id === 'puppy' ? 'bg-amber-300' : 'bg-emerald-300'}`}
                                        title={th.label}
                                    >
                                        <span className="sr-only">{th.label}</span>
                                        {th.customIcon ? (
                                            <img
                                                src={th.customIcon}
                                                alt={th.label}
                                                className="w-5 h-5 rounded-full object-cover"
                                            />
                                        ) : (
                                            <IconComponent size={16} className={th.id === 'default' ? 'text-white' : 'text-gray-800'} />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {docId && (
                        <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end">
                            <div className="hidden sm:block text-xs font-semibold text-gray-500 uppercase tracking-widest opacity-60 mr-4">
                                Modo Lectura Inmersiva
                            </div>
                        </div>
                    )}

                    {!docId && (
                        <div className="flex-1"></div>
                    )}
                </div>
            </header>

            {!docId ? (
                <div className="p-3 sm:p-8 pt-2 sm:pt-4 max-w-4xl mx-auto w-full">
                    <div className="mb-8 text-center">
                        <p className={`text-lg transition-colors ${theme === 'default' ? 'text-gray-300' : 'opacity-80'}`}>Transforma tus PDFs en audiolibros con voz neuronal y OCR.</p>
                    </div>
                    <div className={`upload-container backdrop-blur-lg rounded-3xl p-12 text-center shadow-2xl transition-all ${t.card}`}>
                        <input
                            type="file"
                            accept=".pdf"
                            onChange={handleUpload}
                            className="hidden"
                            id="file-upload"
                        />
                        <label htmlFor="file-upload" className="cursor-pointer flex flex-col items-center gap-4">
                            <div className="p-6 bg-blue-500/20 rounded-full border border-blue-400/30">
                                {isUploading ? <span>Cargando...</span> : <span>Subir</span>}
                            </div>
                            <span className="text-2xl font-semibold text-white">
                                {isUploading ? "Procesando..." : "Sube tu PDF aquí"}
                            </span>
                            <p className="text-gray-400">Soporta texto e imágenes (OCR)</p>
                        </label>
                    </div>

                    {library.length > 0 && (
                        <div className="mt-12 backdrop-blur-xl bg-white/5 border border-white/10 rounded-3xl p-8 shadow-2xl">
                            <div className="flex items-center justify-center gap-4 mb-6">
                                <h2 className={`text-2xl font-bold text-center ${t.headerText}`}>Tu Biblioteca</h2>
                                <button
                                    onClick={() => setShowLibrary(!showLibrary)}
                                    className={`px-3 py-1 rounded-full text-xs transition-colors border ${t.buttonSecondary}`}
                                >
                                    {showLibrary ? "Ocultar" : "Mostrar"}
                                </button>
                            </div>

                            {showLibrary && (
                                <div className="grid grid-cols-2 xs:grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4 sm:gap-6 justify-items-center">
                                    {library.map(book => (
                                        <div
                                            key={book.doc_id}
                                            className={`group relative flex flex-col items-center p-2 sm:p-3 rounded-xl sm:rounded-2xl transition-all shadow-lg hover:shadow-xl overflow-hidden ${t.card} w-full aspect-[3/5]`}
                                            title={book.filename}
                                        >
                                            <div className="relative w-full flex-1 flex items-center justify-center rounded-lg sm:rounded-xl overflow-hidden mb-2 bg-black/20 group-hover:scale-105 transition-transform duration-300">
                                                <span>PDF</span>

                                                {/* Progress Bar Overlay */}
                                                <div className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-700/50">
                                                    <div
                                                        className={`h-full ${t.progressColor}`}
                                                        style={{ width: `${getProgress(book)}%` }}
                                                    ></div>
                                                </div>

                                                <div className="absolute inset-0 flex items-center justify-center opacity-100 sm:opacity-0 group-hover:opacity-100 bg-black/10 sm:bg-black/40 transition-opacity">
                                                    <button
                                                        onClick={() => handleSelectBook(book)}
                                                        className="p-3 sm:p-4 bg-blue-500 hover:bg-blue-400 rounded-full text-white shadow-lg hover:scale-110 transition-all transform flex items-center justify-center z-10"
                                                        aria-label="Play"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-play ml-1"><polygon points="6 3 20 12 6 21 6 3"></polygon></svg>
                                                    </button>
                                                </div>
                                            </div>

                                            <span className="text-xs sm:text-sm text-gray-300 font-medium truncate w-full text-center px-1">
                                                {book.filename.replace('.pdf', '')}
                                            </span>

                                            <div className="absolute top-2 right-2 z-50 flex flex-col gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleGetSummary(book.doc_id); }}
                                                    className="p-2 sm:p-2 bg-purple-500/80 hover:bg-purple-500 rounded-full text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center shadow-md"
                                                    title="Resumen IA"
                                                >
                                                    <Sparkles size={16} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDeleteBook(e, book.doc_id)}
                                                    className="p-2 sm:p-2 bg-red-500/80 hover:bg-red-500 rounded-full text-white transition-colors min-w-[32px] min-h-[32px] flex items-center justify-center shadow-md"
                                                    title="Eliminar libro"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-trash-2"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1 w-full relative">
                    <div className="amori-reader-layout">
                        {/* LEFT COLUMN: SETTINGS */}
                        <div className="settings-panel">
                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Voz</h4>
                                <select
                                    value={selectedVoice}
                                    onChange={(e) => setSelectedVoice(e.target.value)}
                                    className={`w-full bg-white/50 border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${t.input}`}
                                    title="Seleccionar Voz"
                                >
                                    {voices.map(v => (
                                        <option key={v.ShortName} value={v.ShortName}>{v.FriendlyName}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Velocidad</h4>
                                <select
                                    value={playbackRate}
                                    onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                    className={`w-full bg-white/50 border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${t.input}`}
                                >
                                    <option value="0.75">Lenta (0.75x)</option>
                                    <option value="1">Normal (1x)</option>
                                    <option value="1.25">Rápida (1.25x)</option>
                                    <option value="1.5">Muy Rápida (1.5x)</option>
                                    <option value="2">Doble (2x)</option>
                                </select>
                            </div>

                            <div>
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Traducción</h4>
                                <button
                                    onClick={() => setIsTranslated(!isTranslated)}
                                    className={`w-full p-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2 ${isTranslated ? 'bg-indigo-500 text-white shadow-md' : 'bg-white/50 border hover:bg-white ' + t.text}`}
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 8 6 6" /><path d="m4 14 6-6 2-3" /><path d="M2 5h12" /><path d="M7 2h1" /><path d="m22 22-5-10-5 10" /><path d="M14 18h6" /></svg>
                                    {isTranslated ? "Traducido" : "Original"}
                                </button>
                            </div>

                            <div className="mt-auto">
                                <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-2">Navegación</h4>
                                <div className={`flex items-center rounded-xl overflow-hidden border bg-white/50 focus-within:ring-2 focus-within:ring-blue-400 transition-all ${t.input}`}>
                                    <input
                                        type="number"
                                        min="1"
                                        max={totalPages}
                                        value={jumpPage}
                                        onChange={(e) => setJumpPage(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && handleJump()}
                                        className="bg-transparent flex-1 p-3 text-center focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        placeholder={`1 - ${totalPages}`}
                                    />
                                    <button
                                        onClick={handleJump}
                                        className="p-3 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold transition-colors border-l"
                                    >
                                        IR
                                    </button>
                                </div>
                                <div className="text-center mt-2 text-xs text-gray-500">Página {currentPage} de {totalPages}</div>
                            </div>

                            <button
                                onClick={handleGetSummary}
                                className={`w-full p-3 mt-2 rounded-xl font-bold transition-all flex items-center justify-center gap-2 shadow-sm ${showSummaryModal ? 'bg-purple-600 text-white shadow-md' : 'bg-purple-100 text-purple-700 hover:bg-purple-200 border border-purple-200'}`}
                            >
                                <Sparkles size={18} />
                                Resumen IA
                            </button>
                        </div>

                        {/* CENTER COLUMN: THE BOOK */}
                        <div className={`book-container flex justify-center items-center overflow-hidden relative rounded-3xl backdrop-blur-md bg-black/5 shadow-2xl border border-white/20 ${t.player}`}>
                            <FlipBook
                                ref={flipBookRef}
                                docId={docId}
                                totalPages={totalPages}
                                onPageChange={(page) => setCurrentPage(page)}
                                width={isMobile ? 320 : 550}
                                height={isMobile ? 450 : 750}
                                layoutMode={layoutMode}
                                isTranslated={isTranslated}
                                voice={selectedVoice}
                            />

                            <button
                                onClick={() => setLayoutMode(m => m === 'single' ? 'double' : 'single')}
                                className="absolute top-4 right-4 p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-md text-gray-600 hover:text-black transition-colors z-50 text-xs font-bold"
                                title="Cambiar Vista (1 o 2 Páginas)"
                            >
                                {layoutMode === 'single' ? '[ 1 ]' : '[ 2 ]'}
                            </button>
                        </div>

                        {/* RIGHT COLUMN: CIRCULAR CONTROLS (NOW FLOATING) */}
                        <div className="floating-controls">

                            <button
                                onClick={() => {
                                    handleStop();
                                    if (flipBookRef.current) flipBookRef.current.turnToPage(1);
                                }}
                                className="side-control-btn"
                                title="Reiniciar Libro"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
                                <span>Reiniciar</span>
                            </button>

                            <button
                                onClick={togglePlay}
                                className={`side-control-btn ${isPlaying ? 'active-play' : ''}`}
                                title={isPlaying ? "Pausar" : "Reproducir"}
                            >
                                {isPlaying ? (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="4" height="16" x="6" y="4" /><rect width="4" height="16" x="14" y="4" /></svg>
                                        <span>Pausar</span>
                                    </>
                                ) : (
                                    <>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-1"><polygon points="6 3 20 12 6 21 6 3" /></svg>
                                        <span>Play</span>
                                    </>
                                )}
                            </button>

                            <button
                                onClick={handleStop}
                                className="side-control-btn"
                                title="Detener Lectura"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /></svg>
                                <span>Stop</span>
                            </button>

                            <button
                                onClick={() => {
                                    if (flipBookRef.current) flipBookRef.current.flipNext();
                                }}
                                disabled={currentPage === totalPages}
                                className="side-control-btn disabled:opacity-30 disabled:cursor-not-allowed"
                                title="Siguiente Página"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                <span>Continuar</span>
                            </button>

                        </div>

                        <div className="hidden">
                            <audio
                                ref={audioRef}
                                onEnded={handleAudioEnded}
                                onPlay={onPlay}
                                onPause={onPause}
                                controls
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* AI Summary Modal */}
            {showSummaryModal && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                    <div className={`relative max-w-2xl w-full max-h-[80vh] flex flex-col rounded-3xl shadow-2xl overflow-hidden ${t.card} border ${t.ringColor}`}>
                        <div className={`flex items-center justify-between p-6 border-b ${t.header}`}>
                            <h3 className={`text-xl font-bold flex items-center gap-2 ${t.headerText}`}>
                                <Sparkles className="text-purple-500" />
                                Resumen Inteligente
                            </h3>
                            <button
                                onClick={() => setShowSummaryModal(false)}
                                className={`p-2 rounded-full hover:bg-black/10 transition-colors ${t.buttonSecondary}`}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 text-base leading-relaxed whitespace-pre-line">
                            {isSummaryLoading ? (
                                <div className="flex flex-col items-center justify-center py-12 gap-4">
                                    <div className={`animate-spin rounded-full h-12 w-12 border-b-2 ${t.iconColor}`}></div>
                                    <p className="opacity-70 animate-pulse">Analizando documento...</p>
                                </div>
                            ) : (
                                <div className={t.cardTitle}>{summary}</div>
                            )}
                        </div>

                        <div className={`p-4 border-t flex justify-end ${t.header}`}>
                            <button
                                onClick={() => setShowSummaryModal(false)}
                                className={`px-6 py-2 rounded-xl font-medium transition-colors ${t.buttonPrimary}`}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Watermark / Background Image */}
            {t.backgroundImage && (
                t.bgRepeat ? (
                    <div
                        className="fixed inset-0 z-0 opacity-10 pointer-events-none select-none"
                        style={{
                            backgroundImage: `url(${t.backgroundImage})`,
                            backgroundRepeat: 'space',
                            backgroundSize: '150px'
                        }}
                    ></div>
                ) : (
                    <div className="fixed bottom-0 right-0 p-8 z-0 opacity-20 pointer-events-none select-none">
                        <img
                            src={t.backgroundImage}
                            alt=""
                            className="w-48 h-auto object-contain drop-shadow-lg"
                        />
                    </div>
                )
            )}

            <footer className="w-full text-center p-4 mt-auto text-xs opacity-60">
                <p>Amori v1.7.1 &copy; {new Date().getFullYear()} Adamo. All rights reserved.</p>
            </footer>
        </div >
    )
}

export default App
