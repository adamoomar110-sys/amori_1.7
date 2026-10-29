from fastapi import FastAPI, UploadFile, File, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import shutil
import os
import uuid
import json
from typing import List
from services import PDFProcessor, TTSGenerator
from ai_service import Summarizer
from deep_translator import GoogleTranslator
from langdetect import detect

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

documents = {}

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
AUDIO_DIR = os.path.join(BASE_DIR, "audio_cache")
LIBRARY_FILE = os.path.join(BASE_DIR, "library.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(AUDIO_DIR, exist_ok=True)


def resolve_pdf_path(raw_path: str, doc_id: str) -> str:
    """Resuelve la ruta real del PDF aunque provenga de rutas relativas antiguas."""
    if raw_path:
        if os.path.isabs(raw_path) and os.path.exists(raw_path):
            return raw_path
        norm = raw_path.replace("\\", os.sep).replace("/", os.sep)
        candidate = os.path.join(BASE_DIR, norm)
        if os.path.exists(candidate):
            return candidate
    fallback = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")
    return fallback


print("=" * 60)
print(" AMORI BACKEND v1.7 STARTING")
print(" AI SUMMARY FEATURE: ENABLED")
print(f" FRONTEND PATH: {os.path.abspath(os.path.join(os.path.dirname(BASE_DIR), 'frontend', 'dist'))}")
print("=" * 60)

pdf_processor = PDFProcessor()
tts_generator = TTSGenerator()
summarizer = Summarizer()


def load_library():
    if os.path.exists(LIBRARY_FILE):
        for enc in ("utf-8", "cp1252", "latin-1"):
            try:
                with open(LIBRARY_FILE, "r", encoding=enc) as f:
                    return json.load(f)
            except Exception:
                continue
    return []


def save_to_library(book_data):
    library = load_library()
    for i, book in enumerate(library):
        if book["doc_id"] == book_data["doc_id"]:
            if "last_page" not in book_data and "last_page" in book:
                book_data["last_page"] = book["last_page"]
            library[i] = book_data
            with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
                json.dump(library, f, indent=2, ensure_ascii=False)
            return

    if "last_page" not in book_data:
        book_data["last_page"] = 1

    library.append(book_data)
    with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
        json.dump(library, f, indent=2, ensure_ascii=False)


startup_library = load_library()
for book in startup_library:
    b_id = book["doc_id"]
    documents[b_id] = {
        "path": resolve_pdf_path(book.get("path", ""), b_id),
        "filename": book["filename"],
        "status": "ready",
        "pages": book.get("pages", []),
        "last_page": book.get("last_page", 1)
    }


class PageResponse(BaseModel):
    page: int
    text: str


class InitResponse(BaseModel):
    doc_id: str
    status: str
    filename: str


class ProgressRequest(BaseModel):
    page: int


def process_pdf_background(doc_id: str, file_path: str):
    try:
        pages_data = pdf_processor.process_pdf(file_path)

        documents[doc_id]["pages"] = pages_data
        documents[doc_id]["status"] = "ready"
        documents[doc_id]["last_page"] = 1

        rel_path = os.path.join("uploads", f"{doc_id}.pdf")
        save_to_library({
            "doc_id": doc_id,
            "filename": documents[doc_id]["filename"],
            "path": rel_path,
            "total_pages": len(pages_data),
            "last_page": 1,
            "pages": pages_data
        })

        print(f"Document {doc_id} processed successfully and saved to library.")
    except Exception as e:
        import traceback
        traceback.print_exc()
        documents[doc_id]["status"] = "error"
        documents[doc_id]["error"] = str(e)


@app.post("/upload", response_model=InitResponse)
async def upload_pdf(background_tasks: BackgroundTasks, file: UploadFile = File(...)):
    for stored_doc_id, doc_data in documents.items():
        if doc_data.get("filename") == file.filename:
            existing_path = resolve_pdf_path(doc_data.get("path", ""), stored_doc_id)
            if not os.path.exists(existing_path):
                with open(existing_path, "wb") as buffer:
                    shutil.copyfileobj(file.file, buffer)
                doc_data["path"] = existing_path
            print(f"File {file.filename} already exists. Returning existing doc_id: {stored_doc_id}")
            return {
                "doc_id": stored_doc_id,
                "status": doc_data.get("status", "ready"),
                "filename": doc_data.get("filename")
            }

    doc_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    documents[doc_id] = {
        "path": file_path,
        "filename": file.filename,
        "status": "processing",
        "pages": [],
        "last_page": 1
    }

    background_tasks.add_task(process_pdf_background, doc_id, file_path)

    return {
        "doc_id": doc_id,
        "status": "processing",
        "filename": file.filename
    }


@app.get("/document/{doc_id}/status")
async def get_document_status(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = documents[doc_id]
    return {
        "status": doc["status"],
        "total_pages": len(doc["pages"]) if "pages" in doc else 0,
        "error": doc.get("error"),
        "last_page": doc.get("last_page", 1)
    }


@app.post("/document/{doc_id}/progress")
async def update_progress(doc_id: str, progress: ProgressRequest):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    documents[doc_id]["last_page"] = progress.page

    library = load_library()
    updated = False
    for book in library:
        if book["doc_id"] == doc_id:
            book["last_page"] = progress.page
            updated = True
            break

    if updated:
        with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
            json.dump(library, f, indent=2, ensure_ascii=False)

    return {"status": "success", "page": progress.page}


@app.get("/document/{doc_id}/pages")
async def get_pages(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")
    return documents[doc_id]["pages"]


@app.get("/voices")
async def get_voices():
    return [
        {"ShortName": "es-AR-TomasNeural", "FriendlyName": "Tomás (Argentina - H)"},
        {"ShortName": "es-AR-ElenaNeural", "FriendlyName": "Elena (Argentina - M)"},
        {"ShortName": "es-VE-SebastianNeural", "FriendlyName": "Sebastián (Venezuela - H)"},
        {"ShortName": "es-VE-PaolaNeural", "FriendlyName": "Paola (Venezuela - M)"},
        {"ShortName": "pt-BR-AntonioNeural", "FriendlyName": "Antônio (Portugués - H)"},
        {"ShortName": "pt-BR-FranciscaNeural", "FriendlyName": "Francisca (Portugués - M)"},
        {"ShortName": "en-US-GuyNeural", "FriendlyName": "Guy (Inglés - H)"},
        {"ShortName": "en-US-JennyNeural", "FriendlyName": "Jenny (Inglés - M)"},
        {"ShortName": "it-IT-DiegoNeural", "FriendlyName": "Diego (Italiano - H)"},
        {"ShortName": "it-IT-ElsaNeural", "FriendlyName": "Elsa (Italiano - M)"},
        {"ShortName": "fr-FR-HenriNeural", "FriendlyName": "Henri (Francés - H)"},
        {"ShortName": "fr-FR-DeniseNeural", "FriendlyName": "Denise (Francés - M)"},
        {"ShortName": "de-DE-ConradNeural", "FriendlyName": "Conrad (Alemán - H)"},
        {"ShortName": "de-DE-KatjaNeural", "FriendlyName": "Katja (Alemán - M)"},
    ]


@app.get("/library")
async def get_library():
    return load_library()


@app.delete("/library/{doc_id}")
async def delete_book(doc_id: str):
    global documents
    current_lib = load_library()
    new_lib = [book for book in current_lib if book.get("doc_id") != doc_id]

    if len(new_lib) == len(current_lib):
        raise HTTPException(status_code=404, detail="Book not found")

    with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
        json.dump(new_lib, f, indent=4, ensure_ascii=False)

    if doc_id in documents:
        del documents[doc_id]

    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Error removing file {file_path}: {e}")

    return {"status": "success", "message": "Book deleted"}


@app.get("/audio/{doc_id}/{page_num}")
async def get_audio(doc_id: str, page_num: int, voice: str = "es-AR-TomasNeural", translate: bool = False):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    pages = documents[doc_id]["pages"]
    if page_num < 1 or page_num > len(pages):
        raise HTTPException(status_code=404, detail="Page not found")

    page_data = pages[page_num - 1]
    display_text = page_data["text"]
    tts_text = pdf_processor.clean_text(display_text)

    is_translated = False
    target_voice = voice

    if translate and tts_text.strip():
        try:
            target_lang = voice.split('-')[0]
            detected_lang = detect(tts_text)
            if detected_lang != target_lang:
                translator = GoogleTranslator(source='auto', target=target_lang)
                tts_text = translator.translate(tts_text)
                is_translated = True
        except Exception as e:
            print(f"Translation error: {e}")

    trans_tag = "_trans" if is_translated else ""
    audio_filename = f"{doc_id}_p{page_num}_{target_voice}_smooth{trans_tag}.mp3"
    audio_path = os.path.join(AUDIO_DIR, audio_filename)

    if not os.path.exists(audio_path):
        temp_tts = TTSGenerator(voice=target_voice)
        if not tts_text.strip():
            msg = "Sin texto." if target_voice.startswith("es") else "No text."
            await temp_tts.generate_audio(msg, audio_path)
        else:
            await temp_tts.generate_audio(tts_text, audio_path)

    return FileResponse(audio_path)


@app.get("/document/{doc_id}/image/{page_num}")
def get_page_image(doc_id: str, page_num: int):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    doc = documents[doc_id]
    file_path = resolve_pdf_path(doc.get("path", ""), doc_id)
    pages = doc.get("pages", [])
    fallback_text = pages[page_num - 1]["text"] if 1 <= page_num <= len(pages) else None

    image_bytes = pdf_processor.get_page_image(
        file_path,
        page_num,
        fallback_text=fallback_text,
        title=doc.get("filename", "")
    )

    if not image_bytes:
        raise HTTPException(status_code=404, detail="Page not found")

    return Response(
        content=image_bytes,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"}
    )


@app.get("/document/{doc_id}/text/{page_num}")
async def get_page_text(doc_id: str, page_num: int, translate: bool = False, voice: str = "es-AR-TomasNeural"):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    pages = documents[doc_id]["pages"]
    if page_num < 1 or page_num > len(pages):
        raise HTTPException(status_code=404, detail="Page not found")

    page_data = pages[page_num - 1]
    text = page_data["text"]

    if translate and text.strip():
        try:
            target_lang = voice.split('-')[0]
            detected_lang = detect(text)
            if detected_lang != target_lang:
                translator = GoogleTranslator(source='auto', target=target_lang)
                text = translator.translate(text)
        except Exception as e:
            print(f"Text translation error: {e}")

    return {"text": text}


@app.post("/document/{doc_id}/summary")
async def get_document_summary(doc_id: str):
    if doc_id not in documents:
        raise HTTPException(status_code=404, detail="Document not found")

    if "summary" in documents[doc_id] and documents[doc_id]["summary"]:
        return {"summary": documents[doc_id]["summary"]}

    full_text = "\n".join(p["text"] for p in documents[doc_id]["pages"])
    if len(full_text.strip()) < 50:
        return {"summary": "El documento no tiene suficiente texto para generar un resumen."}

    summary = summarizer.generate_summary(full_text)
    documents[doc_id]["summary"] = summary

    library = load_library()
    updated = False
    for book in library:
        if book["doc_id"] == doc_id:
            book["summary"] = summary
            updated = True
            break

    if updated:
        with open(LIBRARY_FILE, "w", encoding="utf-8") as f:
            json.dump(library, f, indent=2, ensure_ascii=False)

    return {"summary": summary}


frontend_dist = os.path.join(os.path.dirname(BASE_DIR), "frontend", "dist")
assets_path = os.path.join(frontend_dist, "assets")

if os.path.exists(assets_path):
    app.mount("/assets", StaticFiles(directory=assets_path), name="assets")


@app.get("/{catchall:path}")
async def serve_react_app(catchall: str):
    target_file = os.path.join(frontend_dist, catchall)
    if catchall != "" and os.path.isfile(target_file):
        return FileResponse(target_file)

    index_path = os.path.join(frontend_dist, "index.html")
    if os.path.exists(index_path):
        resp = FileResponse(index_path)
        resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
        return resp

    return {"error": "Frontend not built. Please run 'npm run build' in frontend directory."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
