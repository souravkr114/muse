import os
import sys
import subprocess
import time
from pathlib import Path

ROOT_DIR = Path(__file__).parent.resolve()

def start_backend():
    backend_dir = ROOT_DIR / "backend"
    venv_python = backend_dir / ".venv" / "Scripts" / "python.exe"
    if not venv_python.exists():
        venv_python = "python"
    
    print("Starting backend server...")
    return subprocess.Popen(
        [str(venv_python), "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", "8000"],
        cwd=str(backend_dir)
    )

def start_frontend():
    frontend_dir = ROOT_DIR / "frontend"
    print("Starting frontend Metro bundler on port 8085...")
    # Run npx expo start in web mode
    return subprocess.Popen(
        ["cmd.exe", "/c", "npx expo start --web --port 8085"],
        cwd=str(frontend_dir)
    )

def main():
    backend_proc = None
    frontend_proc = None
    try:
        backend_proc = start_backend()
        time.sleep(2) # Give backend a moment to bind
        frontend_proc = start_frontend()
        
        print("\n==================================================")
        print("Muse App is running!")
        print("Backend: http://127.0.0.1:8000")
        print("Frontend: http://127.0.0.1:8085")
        print("==================================================\n")
        print("Press Ctrl+C to stop both servers.")
        
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping services...")
    finally:
        if backend_proc:
            backend_proc.terminate()
        if frontend_proc:
            frontend_proc.terminate()

if __name__ == "__main__":
    main()
