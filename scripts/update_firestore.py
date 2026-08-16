#!/usr/bin/env python3
"""
Update Firebase Firestore with latest HazardNet prediction dataset.
Reads CSV output from Kaggle and batch upserts into Firestore 'forecasts' collection.
"""

import os
import sys
import json
import pandas as pd
import firebase_admin
from firebase_admin import credentials, firestore

def initialize_firebase():
    """Initializes Firebase Admin SDK using service account JSON from environment variable or file."""
    service_account_env = os.environ.get("FIREBASE_SERVICE_ACCOUNT") or os.environ.get("FIREBASE_SERVICE_ACCOUNT_KEY")
    
    if not service_account_env:
        print("❌ Error: FIREBASE_SERVICE_ACCOUNT environment variable not set.")
        sys.exit(1)
        
    try:
        if service_account_env.startswith("{"):
            cred_dict = json.loads(service_account_env)
            cred = credentials.Certificate(cred_dict)
        elif os.path.exists(service_account_env):
            cred = credentials.Certificate(service_account_env)
        else:
            print(f"❌ Error: Could not parse FIREBASE_SERVICE_ACCOUNT as JSON or file path.")
            sys.exit(1)
            
        firebase_admin.initialize_app(cred)
        print("✅ Firebase Admin SDK initialized successfully.")
    except Exception as e:
        print(f"❌ Failed to initialize Firebase: {e}")
        sys.exit(1)

def update_firestore(csv_path):
    if not os.path.exists(csv_path):
        print(f"❌ CSV file not found: {csv_path}")
        sys.exit(1)

    print(f"📂 Loading dataset from {csv_path}...")
    df = pd.read_csv(csv_path)
    print(f"📊 Total records found: {len(df)}")

    db = firestore.client()
    batch = db.batch()
    
    forecasts_ref = db.collection("forecasts")
    districts_ref = db.collection("districts")
    
    batch_count = 0
    total_written = 0
    
    for idx, row in df.iterrows():
        district_id = int(row['district_id'])
        horizon = str(row['horizon'])
        doc_id = f"{district_id}_{horizon}"
        
        doc_data = {
            "district_id": district_id,
            "district_name": str(row['district_name']),
            "division": str(row['division']),
            "pcode": str(row['pcode']),
            "horizon": horizon,
            "hazard_type": str(row['hazard_type']),
            "model_severity": float(row['model_severity']),
            "physics_severity": float(row['physics_severity']),
            "confidence": float(row['confidence']),
            "target_date": str(row['target_date']),
            "prediction_date": str(row['prediction_date']),
            "data_source": str(row['data_source']),
            "updated_at": firestore.SERVER_TIMESTAMP
        }
        
        doc_ref = forecasts_ref.document(doc_id)
        batch.set(doc_ref, doc_data, merge=True)
        
        # Also maintain a high-level summary on the district document
        district_doc_ref = districts_ref.document(str(district_id))
        district_summary = {
            "id": district_id,
            "name": str(row['district_name']),
            "division": str(row['division']),
            "pcode": str(row['pcode']),
            f"severity_{horizon}": float(row['model_severity']),
            f"target_date_{horizon}": str(row['target_date']),
            "last_prediction_date": str(row['prediction_date'])
        }
        batch.set(district_doc_ref, district_summary, merge=True)
        
        batch_count += 2
        
        # Firestore batch limit is 500 operations
        if batch_count >= 400:
            batch.commit()
            total_written += batch_count
            print(f"  ⚡ Committed batch of operations (Total processed: {idx + 1}/{len(df)})")
            batch = db.batch()
            batch_count = 0

    if batch_count > 0:
        batch.commit()
        print(f"  ⚡ Committed final batch operations.")

    # Record pipeline metadata
    meta_ref = db.collection("metadata").document("latest_pipeline_run")
    meta_ref.set({
        "last_run_timestamp": firestore.SERVER_TIMESTAMP,
        "total_forecast_records": len(df),
        "source": "Kaggle_Auto_Forecast_Pipeline",
        "status": "SUCCESS"
    }, merge=True)

    print(f"🎉 Successfully updated Firestore database with {len(df)} predictions!")

def main():
    csv_file = sys.argv[1] if len(sys.argv) > 1 else "hazardnet_forecasts_latest.csv"
    initialize_firebase()
    update_firestore(csv_file)

if __name__ == "__main__":
    main()
