import sys
print("Checking imports...")

try:
    print("Importing fastapi...")
    import fastapi
    print("OK")
except Exception as e:
    print(f"FAIL fastapi: {e}")

try:
    print("Importing uvicorn...")
    import uvicorn
    print("OK")
except Exception as e:
    print(f"FAIL uvicorn: {e}")

try:
    print("Importing python-multipart...")
    import multipart
    print("OK")
except Exception as e:
    print(f"FAIL python-multipart: {e}")

try:
    print("Importing pymupdf (fitz)...")
    import fitz
    print("OK")
except Exception as e:
    print(f"FAIL pymupdf: {e}")

try:
    print("Importing easyocr (this loads torch/scipy)...")
    import easyocr
    print("OK")
except Exception as e:
    print(f"FAIL easyocr: {e}")

try:
    print("Importing edge_tts...")
    import edge_tts
    print("OK")
except Exception as e:
    print(f"FAIL edge_tts: {e}")

try:
    print("Importing aiofiles...")
    import aiofiles
    print("OK")
except Exception as e:
    print(f"FAIL aiofiles: {e}")

try:
    print("Importing deep_translator...")
    from deep_translator import GoogleTranslator
    print("OK")
except Exception as e:
    print(f"FAIL deep_translator: {e}")

print("Import check complete.")
