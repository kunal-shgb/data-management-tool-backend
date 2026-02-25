from fastapi import FastAPI, UploadFile, File, HTTPException
import pandas as pd
import io
import json
from datetime import datetime

app = FastAPI()

@app.post("/process-npci-file")
async def process_npci_file(file: UploadFile = File(...)):
    print("I am here")
    filename = file.filename
    content = await file.read()
    
    transactions = []
    skipped_count = 0
    success_count = 0
    
    try:
        # We handle text and csv very similarly based on the typescript algorithm.
        if filename.endswith(".csv") or filename.endswith(".txt"):
            lines = content.decode("utf-8").splitlines()
            for line in lines:
                trimmed_line = line.strip()
                # Skip empty lines, headers (e.g. 19022026_01C), and footers (e.g. EOF2)
                if not trimmed_line or (trimmed_line.startswith('19') and ',' not in trimmed_line) or trimmed_line.startswith('EOF'):
                    skipped_count += 1
                    continue
                
                parts = trimmed_line.split(',')
                # Assuming minimum of 20 columns based on sample text
                if len(parts) < 20:
                    skipped_count += 1
                    continue
                
                try:
                    rrn = parts[4].strip()
                    utr = parts[7].strip() if parts[7].strip() else None
                    amount_str = parts[15].strip()
                    sender_ifsc = parts[17].strip()
                    receiver_ifsc = parts[19].strip()
                    
                    date_str = parts[8].strip()
                    time_str = parts[9].strip()
                    
                    transaction_date = None
                    if date_str and len(date_str) == 6 and time_str and len(time_str) == 6:
                        day = int(date_str[0:2])
                        month = int(date_str[2:4])
                        # Assuming 2000s for year format
                        year = int(f"20{date_str[4:6]}")
                        
                        hours = int(time_str[0:2])
                        minutes = int(time_str[2:4])
                        seconds = int(time_str[4:6])
                        
                        transaction_date = datetime(year, month, day, hours, minutes, seconds).isoformat()
                    
                    amount = float(amount_str) / 100
                    
                    transactions.append({
                        "rrn": rrn,
                        "utr": utr,
                        "amount": amount,
                        "transactionDate": transaction_date,
                        "senderIfsc": sender_ifsc,
                        "receiverIfsc": receiver_ifsc,
                        "rawData": {"originalLine": trimmed_line}
                    })
                    success_count += 1
                except Exception as e:
                    print(f"Error parsing line: {trimmed_line}, Error: {e}")
                    skipped_count += 1
                    
        elif filename.endswith(".xlsx") or filename.endswith(".xls"):
            # Provide generic Excel processing or basic functionality
            # using pandas as requested for Excel/CSV extensions.
            df = pd.read_excel(io.BytesIO(content))
            # Example implementation if headers match keys
            for index, row in df.iterrows():
                try:
                    transactions.append({
                        "rrn": str(row.get('rrn', '')),
                        "utr": str(row.get('utr', '')) if pd.notna(row.get('utr')) else None,
                        "amount": float(row.get('amount', 0)),
                        "transactionDate": row['transactionDate'].isoformat() if pd.notna(row.get('transactionDate')) else None,
                        "senderIfsc": str(row.get('senderIfsc', '')),
                        "receiverIfsc": str(row.get('receiverIfsc', '')),
                        "rawData": json.loads(row.to_json())
                    })
                    success_count += 1
                except Exception as e:
                    skipped_count += 1
                    
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process file: {str(e)}")
        
    return {
        "message": "File processed successfully",
        "successCount": success_count,
        "skippedCount": skipped_count,
        "transactions": transactions
    }
