import fitz
import os

pdf_path = r"uploads\166ec3c4-c754-401f-a5f4-bbc110ed92fd.pdf"
try:
    if not os.path.exists(pdf_path):
        print(f"File not found at {pdf_path}")
        # Try absolute path just in case current dir is weird
        pdf_path = os.path.abspath(pdf_path)
        print(f"Trying absolute: {pdf_path}")
    
    doc = fitz.open(pdf_path)
    page = doc[0] # Page 1
    rect = page.rect
    print(f"Page 1 Points: width={rect.width}, height={rect.height}")
    
    # Convert to mm (1 pt = 1/72 inch, 1 inch = 25.4 mm)
    w_mm = rect.width * (25.4 / 72)
    h_mm = rect.height * (25.4 / 72)
    print(f"Page 1 Millimeters: {w_mm:.2f}mm x {h_mm:.2f}mm")
    
    # Convert to pixels at 96 DPI (common screen)
    w_px = rect.width * (96 / 72)
    h_px = rect.height * (96 / 72)
    print(f"Page 1 Pixels (96DPI): {w_px:.0f}px x {h_px:.0f}px")

except Exception as e:
    print(f"Error: {e}")
