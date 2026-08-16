import pandas as pd
import requests
import sys
import os
import json

CSV_PATH = sys.argv[1]
API_URL = os.environ['VERCEL_API_URL']
API_KEY = os.environ['BACKEND_API_KEY']
CHUNK_SIZE = 10

df = pd.read_csv(CSV_PATH)
chunks = [df[i:i + CHUNK_SIZE] for i in range(0, df.shape[0], CHUNK_SIZE)]

print(f"📦 Split CSV into {len(chunks)} chunks of {CHUNK_SIZE} rows...")

headers = {
    "Authorization": f"Bearer {API_KEY}",
    "Content-Type": "application/json"
}

for i, chunk in enumerate(chunks):
    payload = {"chunk": chunk.to_dict(orient='records')}  # Convert chunk to list of dicts
    print(f"🚀 POSTing Chunk {i+1}/{len(chunks)}...")
    response = requests.post(API_URL, headers=headers, json=payload)
    if response.status_code == 200:
        print(f"✅ Chunk {i+1} processed successfully.")
    else:
        print(f"❌ Chunk {i+1} failed: {response.text}")
        sys.exit(1)

print("🎉 Weekly HazardNet Pipeline Complete!")
