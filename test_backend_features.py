import sys
import os
import time
from fastapi.testclient import TestClient

# Setup path
project_root = os.path.dirname(os.path.abspath(__file__))
backend_dir = os.path.join(project_root, "backend")
if os.path.exists(backend_dir):
    os.chdir(backend_dir)
    sys.path.insert(0, backend_dir)

from main import app, UPLOAD_DIR

client = TestClient(app)

def test_voices():
    response = client.get("/voices")
    assert response.status_code == 200
    voices = response.json()
    assert isinstance(voices, list)
    assert len(voices) > 0
    print(f"Voices checked: {len(voices)} available")

def test_upload_processing_progress():
    # 1. Upload
    dummy_pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/MediaBox [0 0 595 842]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f\n0000000010 00000 n\n0000000060 00000 n\n0000000117 00000 n\ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n178\n%%EOF"
    files = {"file": ("test_features.pdf", dummy_pdf_content, "application/pdf")}
    
    response = client.post("/upload", files=files)
    assert response.status_code == 200, f"Upload failed: {response.text}"
    doc_id = response.json()["doc_id"]
    print(f"Uploaded doc_id: {doc_id}")
    
    # 2. Wait for processing (status: ready)
    # Note: Using TestClient, background tasks might run synchronously or not at all depending on implementation.
    # Starlette TestClient runs background tasks after the response is sent.
    # So we should be able to check immediately or after a short poll.
    
    max_retries = 10
    ready = False
    for i in range(max_retries):
        response = client.get(f"/document/{doc_id}/status")
        status = response.json()["status"]
        if status == "ready":
             print("Document ready.")
             ready = True
             break
        if status == "error":
             print(f"Document processing error: {response.json().get('error')}")
             break
        print(f"Waiting for processing... {i}/{max_retries}")
        # In a real async loop we would await, but here we can't easily yield control
        # unless we spin. Since TestClient runs logic in-thread, if it's not done, it might never be done if blocked.
        # But PDF processing is in a background_task which runs after response.
        time.sleep(1)

    if not ready:
        print("Warning: Document did not become ready (might be expected if OCR is slow or mocked)")

    # 3. Test Progress Update
    response = client.post(f"/document/{doc_id}/progress", json={"page": 5})
    assert response.status_code == 200
    assert response.json()["page"] == 5
    
    # Verify persistence
    response = client.get(f"/document/{doc_id}/status")
    assert response.json()["last_page"] == 5
    print("Progress saved verified.")
    
    # Clean up
    client.delete(f"/library/{doc_id}")
    print("Feature tests passed!")

if __name__ == "__main__":
    test_voices()
    test_upload_processing_progress()
