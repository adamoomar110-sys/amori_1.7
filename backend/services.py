import fitz  # PyMuPDF
import easyocr
import edge_tts
import io
import os
import textwrap
from PIL import Image, ImageDraw, ImageFont
import numpy as np


class PDFProcessor:
    def __init__(self):
        # Initialize EasyOCR reader lazily
        self.reader = None
        self.languages = ['es', 'en', 'pt', 'fr']

    def _get_reader(self):
        if self.reader is None:
            print("Initializing EasyOCR Reader (Lazy Loading)...")
            try:
                self.reader = easyocr.Reader(self.languages, verbose=False)
                print("EasyOCR Reader Initialized.")
            except Exception as e:
                print(f"Error initializing EasyOCR: {e}")
                raise e
        return self.reader

    def clean_text(self, text):
        """Cleans text for smoother TTS: removes newlines, fixes spacing."""
        text = text.replace('\n', ' ')
        text = ' '.join(text.split())
        return text

    def process_pdf(self, source):
        if isinstance(source, str):
            doc = fitz.open(source)
        else:
            doc = fitz.open(stream=source, filetype="pdf")

        pages_data = []

        for page_num, page in enumerate(doc):
            text = page.get_text()

            if len(text.strip()) < 50:
                print(f"Page {page_num + 1}: Low text content, attempting OCR...")
                try:
                    reader = self._get_reader()
                    pix = page.get_pixmap()
                    img_bytes = pix.tobytes("png")
                    image = Image.open(io.BytesIO(img_bytes))
                    image_np = np.array(image)
                    result = reader.readtext(image_np, detail=0)
                    text = " ".join(result)
                except Exception as e:
                    print(f"OCR Error on page {page_num + 1}: {e}")
                    text = text or ""

            cleaned_text = self.clean_text(text)

            pages_data.append({
                "page": page_num + 1,
                "text": cleaned_text
            })

        return pages_data

    def render_text_fallback_image(self, text: str, page_num: int, title: str = "") -> bytes:
        """Genera una página legible en PNG cuando el PDF original no está en disco pero su texto sí está en library.json."""
        w, h = 900, 1270
        img = Image.new("RGB", (w, h), (253, 251, 247))
        draw = ImageDraw.Draw(img)

        try:
            font_head = ImageFont.truetype(r"C:\Windows\Fonts\arialbd.ttf", 20)
            font_body = ImageFont.truetype(r"C:\Windows\Fonts\georgia.ttf", 23)
            font_foot = ImageFont.truetype(r"C:\Windows\Fonts\arial.ttf", 18)
        except Exception:
            font_head = ImageFont.load_default()
            font_body = ImageFont.load_default()
            font_foot = ImageFont.load_default()

        if title:
            short_title = title.replace(".pdf", "")[:55]
            draw.text((70, 48), short_title, fill=(120, 125, 130), font=font_head)
            draw.line([(70, 82), (w - 70, 82)], fill=(220, 218, 212), width=2)

        body = (text or "").strip() or "(Página sin texto extraído)"
        lines = textwrap.wrap(body, width=58)
        y = 115
        for line in lines[:34]:
            draw.text((70, y), line, fill=(38, 42, 46), font=font_body)
            y += 32

        draw.text((w // 2 - 40, h - 55), f"Página {page_num}", fill=(140, 140, 140), font=font_foot)
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    def get_page_image(self, file_path, page_num, fallback_text=None, title=""):
        if file_path and os.path.exists(file_path):
            with fitz.open(file_path) as doc:
                if page_num < 1 or page_num > len(doc):
                    return None
                page = doc[page_num - 1]
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                return pix.tobytes("png")

        if fallback_text is not None:
            return self.render_text_fallback_image(fallback_text, page_num, title=title)

        return None


class TTSGenerator:
    def __init__(self, voice="es-AR-TomasNeural"):
        self.voice = voice

    async def generate_audio(self, text, output_file):
        if not text.strip():
            return None
        communicate = edge_tts.Communicate(text, self.voice)
        await communicate.save(output_file)
        return output_file
