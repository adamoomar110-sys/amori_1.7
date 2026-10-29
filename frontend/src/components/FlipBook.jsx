import React, { useCallback, forwardRef, useRef, useImperativeHandle, useEffect, useState } from 'react';
import HTMLFlipBook from 'react-pageflip';
import { getPageImageUrl, resolvePageImageUrl, getPageText } from '../api';
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

const Page = forwardRef((props, ref) => {
    const { number, image, shouldLoadImage, isActive, isTranslated, docId, voice } = props;
    const [pageText, setPageText] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [resolvedImg, setResolvedImg] = useState(null);
    const [imgLoaded, setImgLoaded] = useState(false);
    const [imgError, setImgError] = useState(false);
    const [hasActivated, setHasActivated] = useState(Boolean(shouldLoadImage));

    useEffect(() => {
        if (shouldLoadImage && !hasActivated) {
            setHasActivated(true);
        }
    }, [shouldLoadImage, hasActivated]);

    useEffect(() => {
        let cancelled = false;
        setResolvedImg(null);
        setImgLoaded(false);
        setImgError(false);

        if (hasActivated && docId) {
            resolvePageImageUrl(docId, number)
                .then((url) => {
                    if (!cancelled) setResolvedImg(url);
                })
                .catch((err) => {
                    console.error("Error resolving page image:", err);
                    if (!cancelled) setImgError(true);
                });
        }

        return () => {
            cancelled = true;
        };
    }, [docId, number, image, hasActivated]);

    useEffect(() => {
        if (isTranslated && docId && hasActivated) {
            setIsLoading(true);
            getPageText(docId, number, true, voice)
                .then(text => {
                    setPageText(text);
                    setIsLoading(false);
                })
                .catch(err => {
                    console.error("Error fetching page text:", err);
                    setPageText("Error al cargar la traducción.");
                    setIsLoading(false);
                });
        }
    }, [isTranslated, docId, number, voice, hasActivated]);

    return (
        <div className="page-content bg-[#fdfbf7] h-full w-full shadow-md overflow-hidden relative" ref={ref}>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200/20 to-transparent pointer-events-none z-10 w-8"></div>

            <div className="h-full w-full flex items-center justify-center p-2 sm:p-4">
                {isTranslated ? (
                    <div className="w-full h-full flex flex-col items-start justify-start p-5 text-gray-800 font-serif overflow-y-auto custom-scrollbar">
                        {isLoading ? (
                            <div className="flex flex-col items-center justify-center w-full h-full gap-3 opacity-50">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
                                <span className="text-sm italic">Traduciendo página...</span>
                            </div>
                        ) : (
                            <p className="text-base leading-relaxed first-letter:text-2xl first-letter:font-bold whitespace-pre-wrap text-left w-full">
                                {pageText}
                            </p>
                        )}
                    </div>
                ) : (
                    hasActivated ? (
                        <div className="relative w-full h-full flex items-center justify-center">
                            {!imgLoaded && !imgError && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                                    <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-emerald-600"></div>
                                    <span className="text-xs">Cargando página {number}...</span>
                                </div>
                            )}
                            {imgError ? (
                                <div className="text-center p-4 text-sm text-gray-500">
                                    No se pudo cargar la imagen de la página {number}.
                                </div>
                            ) : resolvedImg ? (
                                <img
                                    src={resolvedImg}
                                    alt={`Página ${number}`}
                                    decoding="async"
                                    onLoad={() => setImgLoaded(true)}
                                    onError={() => setImgError(true)}
                                    className={`max-h-full max-w-full w-full h-full object-contain shadow-sm transition-opacity duration-200 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                                />
                            ) : null}
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">
                            Página {number}
                        </div>
                    )
                )}
            </div>

            {isActive && <div className="active-reading-indicator"></div>}

            <div className={`absolute bottom-2 left-1/2 -translate-x-1/2 text-[11px] font-serif px-2 py-0.5 rounded-full transition-colors ${isActive ? 'bg-blue-600 text-white font-bold shadow-sm' : 'text-gray-400'}`}>
                {number}
            </div>

            <div className="absolute top-0 bottom-0 left-0 w-[2px] bg-black/5 z-20"></div>
        </div>
    );
});


const FlipBook = forwardRef(({
    docId,
    totalPages,
    currentPage = 1,
    initialPage = 1,
    onPageChange,
    width = 400,
    height = 565,
    layoutMode = 'double',
    isTranslated = false,
    voice = "es-AR-TomasNeural"
}, ref) => {
    const bookRef = useRef();

    useImperativeHandle(ref, () => ({
        flipNext: () => {
            bookRef.current?.pageFlip()?.flipNext();
        },
        flipPrev: () => {
            bookRef.current?.pageFlip()?.flipPrev();
        },
        turnToPage: (pageNum) => {
            bookRef.current?.pageFlip()?.turnToPage(Math.max(0, pageNum - 1));
        },
        destroy: () => {
            bookRef.current?.pageFlip()?.destroy();
        }
    }));

    const onFlip = useCallback((e) => {
        if (onPageChange) {
            onPageChange(e.data + 1);
        }
    }, [onPageChange]);

    const startIdx = Math.max(0, Math.min((initialPage || 1) - 1, Math.max(0, totalPages - 1)));

    return (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
            <TransformWrapper
                initialScale={1}
                minScale={0.5}
                maxScale={3}
                centerOnInit={true}
                disablePadding={true}
            >
                {({ zoomIn, zoomOut, resetTransform }) => (
                    <>
                        <div className="absolute top-14 right-4 z-50 flex flex-col gap-2 bg-white/80 backdrop-blur-sm p-2 rounded-lg shadow-lg border border-gray-200">
                            <button onClick={() => zoomIn()} className="p-2 hover:bg-gray-100 rounded-full text-gray-700" title="Acercar">
                                <ZoomIn size={20} />
                            </button>
                            <button onClick={() => zoomOut()} className="p-2 hover:bg-gray-100 rounded-full text-gray-700" title="Alejar">
                                <ZoomOut size={20} />
                            </button>
                            <button onClick={() => resetTransform()} className="p-2 hover:bg-gray-100 rounded-full text-gray-700" title="Restablecer Zoom">
                                <Maximize size={20} />
                            </button>
                        </div>

                        <TransformComponent wrapperClass="!w-full !h-full flex items-center justify-center" contentClass="!w-full !h-full flex items-center justify-center">
                            <div className="w-full h-full flex items-center justify-center p-2">
                                <HTMLFlipBook
                                    key={`${docId}-${layoutMode}`}
                                    width={width}
                                    height={height}
                                    size="fixed"
                                    minWidth={200}
                                    maxWidth={1000}
                                    minHeight={300}
                                    maxHeight={1400}
                                    maxShadowOpacity={0.5}
                                    showCover={true}
                                    mobileScrollSupport={true}
                                    usePortrait={layoutMode === 'single'}
                                    startPage={startIdx}
                                    drawShadow={true}
                                    flippingTime={700}
                                    onFlip={onFlip}
                                    ref={bookRef}
                                    className="shadow-2xl"
                                    style={{ margin: "auto" }}
                                >
                                    {Array.from({ length: totalPages }).map((_, index) => {
                                        const pNum = index + 1;
                                        const nearCurrent = Math.abs(pNum - currentPage) <= 8 || pNum <= 4;
                                        return (
                                            <Page
                                                key={index}
                                                number={pNum}
                                                image={getPageImageUrl(docId, pNum)}
                                                shouldLoadImage={nearCurrent}
                                                isActive={pNum === currentPage}
                                                isTranslated={isTranslated}
                                                docId={docId}
                                                voice={voice}
                                            />
                                        );
                                    })}
                                </HTMLFlipBook>
                            </div>
                        </TransformComponent>
                    </>
                )}
            </TransformWrapper>
        </div>
    );
});

export default FlipBook;
