import sys
import time
import requests
import uvicorn
import threading

# We will start the backend server in a background thread and call its APIs using requests.
def run_server():
    from server import app
    uvicorn.run(app, host="127.0.0.1", port=8000)

def test_flow():
    base_url = "http://127.0.0.1:8000/api"
    print("Testing registration...")
    email = f"test_{int(time.time())}@muse.com"
    r = requests.post(f"{base_url}/auth/register", json={
        "email": email,
        "password": "password123",
        "name": "Test User"
    })
    if r.status_code != 200:
        print(f"Failed registration: {r.status_code} {r.text}")
        sys.exit(1)
    
    data = r.json()
    token = data["token"]
    user_id = data["user"]["id"]
    print(f"User registered. Token: {token[:10]}...")
    
    headers = {"Authorization": f"Bearer {token}"}
    
    print("Testing generate text quote...")
    r = requests.post(f"{base_url}/quotes/generate", json={
        "source_type": "text",
        "text": "Feeling a bit lost today, need clarity."
    }, headers=headers)
    if r.status_code != 200:
        print(f"Failed quote generation: {r.status_code} {r.text}")
        sys.exit(1)
    
    quote_data = r.json()
    print("Generated quote:", quote_data["quote"])
    print("Mood:", quote_data["mood"])
    
    print("Testing quotes list...")
    r = requests.get(f"{base_url}/quotes", headers=headers)
    assert r.status_code == 200
    assert len(r.json()) > 0
    print("Quotes listed successfully.")
    
    print("All backend tests passed successfully!")
    sys.exit(0)

if __name__ == "__main__":
    t = threading.Thread(target=run_server, daemon=True)
    t.start()
    time.sleep(3) # Wait for server to start
    test_flow()
