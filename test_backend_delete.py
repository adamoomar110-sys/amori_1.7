import sys
import os
import shutil
import json
from fastapi.testclient import TestClient

# Ensure we are checking the backend environment correctly
# Change CWD to backend so that main.py relies on backend/ files
project_root = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(project_root, "backend")

if os.path.exists(backend_dir):
    os.chdir(backend_dir)
    sys.path.insert(0, backend_dir)

from main import app, LIBRARY_FILE, UPLOAD_DIR

client = TestClient(app)

def test_delete_flow():
    print(f"Running tests in CWD: {os.getcwd()}")
    
    # 1. Simulate Upload
    # Create a dummy PDF file content
    dummy_pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/MediaBox [0 0 595 842]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n178\n%%EOF"
    
    files = {"file": ("test_delete.pdf", dummy_pdf_content, "application/pdf")}
    response = client.post("/upload", files=files)
    assert response.status_code == 200, f"Upload failed: {response.text}"
    data = response.json()
    doc_id = data["doc_id"]
    print(f"Uploaded doc_id: {doc_id}")

    # 2. Check status
    response = client.get(f"/document/{doc_id}/status")
    assert response.status_code == 200
    print(f"Status: {response.json()}")

    # 3. Call Delete
    response = client.delete(f"/library/{doc_id}")
    assert response.status_code == 200, f"Delete failed: {response.text}"
    print("Delete response:", response.json())

    # 4. Verify gone from Library View
    response = client.get("/library")
    library = response.json()
    found = any(book["doc_id"] == doc_id for book in library)
    assert not found, "Book should be gone from library"

    # 5. Verify file is deleted
    # Relative to CWD (backend)
    file_path = os.path.join(UPLOAD_DIR, f"{doc_id}.pdf")
    assert not os.path.exists(file_path), f"File {file_path} should be deleted"

    print("Test Passed!")

if __name__ == "__main__":
    test_delete_flow()
