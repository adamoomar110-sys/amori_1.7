import os
print("Script started...")
import sys
import uvicorn
from pyngrok import ngrok, conf
import threading
import time
import socket

# --- CONFIGURATION ---
PORT = 8080
# User provided token interactively, we will ask for it if not saved, 
# or use the one they just gave us if I hardcode it (less secure but easier for this session),
# or better: rely on them having run 'ngrok config add-authtoken' OR set it here.
# Since the user GAVE me the token in the chat, I will use it to configure ngrok programmatically.
NGROK_AUTH_TOKEN = "38IbyMFFZNBfyHUuqpDbZTPgIn0_6KyYqSjYSgFBy8gzRGEqw" 

def start_ngrok_thread():
    print("Waiting for server to start before opening tunnel...")
    time.sleep(10) # Give uvicorn more time (Torch/OCR is heavy to load)
    
    try:
        # Force IPv4 to avoid Windows ::1 issues
        # ngrok.connect(PORT) often triggers localhost -> ::1
        addr = f"127.0.0.1:{PORT}"
        print(f"Connecting Ngrok to {addr}...")
        
        public_url = ngrok.connect(addr).public_url
        print("\n" + "="*60)
        print(f" GLOBAL ACCESS URL:  {public_url}")
        print("="*60 + "\n")
        print(f"Open this URL on your Android phone to use the app!")
        print(f"Server is running locally on port {PORT}")
        print("Detailed logs will appear below:")
        
        print(f"Creating local QR code...")
        try:
            import qrcode
            qr = qrcode.QRCode()
            qr.add_data(public_url)
            qr.print_ascii()
        except ImportError:
            pass
            
    except Exception as e:
        print(f"\nCRITICAL ERROR starting Ngrok: {e}")
        print("Possible causes:")
        print("1. No internet connection.")
        print("2. Firewall. Allow 'ngrok.exe' if prompted.")
        print("-" * 60)

def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # doesn't even have to be reachable
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

if __name__ == "__main__":
    try:
        # Kill any existing ngrok processes first to avoid "already running" errors
        try:
            ngrok.kill()
        except:
            pass
            
        # Ensure backend directory is in path
        backend_dir = os.path.join(os.path.dirname(__file__), "backend")
        sys.path.append(backend_dir)
        
        ngrok.set_auth_token(NGROK_AUTH_TOKEN)
        
        # Start Ngrok in a background thread so it doesn't block Uvicorn
        t = threading.Thread(target=start_ngrok_thread)
        t.daemon = True
        t.start()
        
        print(f"Starting Local Server on port {PORT}...")
        local_ip = get_local_ip()
        local_url = f"http://localhost:{PORT}"
        print(f"Local access: {local_url} or http://{local_ip}:{PORT}")

        # Auto-open browser
        import webbrowser
        def open_browser():
            print("Opening browser in 3 seconds...")
            time.sleep(3)
            webbrowser.open(local_url)
        
        wb_thread = threading.Thread(target=open_browser)
        wb_thread.daemon = True
        wb_thread.start()
        
        # Change dir to backend to ensure imports work
        os.chdir(backend_dir)
        
        # Run Uvicorn (Blocking)
        # Force 127.0.0.1 binding effectively or 0.0.0.0
        uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
    except Exception as e:
        print("\n" + "!"*60)
        print(f"FATAL ERROR: {e}")
        print("!"*60 + "\n")
        import traceback
        traceback.print_exc()
        print("\nApp exited.")
        # input()  <-- Removed to support background execution


