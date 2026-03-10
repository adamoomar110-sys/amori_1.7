import fitz  # PyMuPDF
import easyocr
import edge_tts
import io
from PIL import Image
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
        # Replace newlines with space to prevent artificial pauses at line ends
        text = text.replace('\n', ' ')
        # Normalize whitespace (multiple spaces -> single space)
        text = ' '.join(text.split())
        return text

    def process_pdf(self, source):
        # Support both file path (str) and bytes
        if isinstance(source, str):
            doc = fitz.open(source)
        else:
            doc = fitz.open(stream=source, filetype="pdf")
            
        pages_data = []

        for page_num, page in enumerate(doc):
            text = page.get_text()
            
            # Simple heuristic: if text is very short, try OCR
            if len(text.strip()) < 50:
                print(f"Page {page_num + 1}: Low text content, attempting OCR...")
                try:
                    reader = self._get_reader()
                    pix = page.get_pixmap()
                    img_bytes = pix.tobytes("png")
                    image = Image.open(io.BytesIO(img_bytes))
                    
                    # Convert to numpy array for EasyOCR
                    image_np = np.array(image)
                    
                    # Perform OCR
                    result = reader.readtext(image_np, detail=0)
                    text = " ".join(result)
                except Exception as e:
                    print(f"OCR Error on page {page_num + 1}: {e}")
                    text = "" # Fallback
            
            # Clean the text for better TTS fluidity
            cleaned_text = self.clean_text(text)

            pages_data.append({
                "page": page_num + 1,
                "text": cleaned_text
            })
            
        return pages_data

    def get_page_image(self, file_path, page_num):
        with fitz.open(file_path) as doc:
            if page_num < 1 or page_num > len(doc):
                return None
            
            page = doc[page_num - 1]
            # Render page to an image (pixmap)
            pix = page.get_pixmap(matrix=fitz.Matrix(2, 2)) # Zoom x2 for better quality
            return pix.tobytes("png")

class TTSGenerator:
    def __init__(self, voice="es-AR-TomasNeural"): # Default to Spanish voice
        self.voice = voice

    async def generate_audio(self, text, output_file):
        if not text.strip():
            return None
        communicate = edge_tts.Communicate(text, self.voice)
        await communicate.save(output_file)
        return output_file
