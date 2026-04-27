"""
Scan a PDF using the Datalab.to Marker API and save output + images to disk.
"""
import os
import sys
import json
import time
import base64
import zipfile
from pathlib import Path

import requests

API_KEY = "RWf8CAdF_iA5_1pcAgMvPfsnqCyTgZZ-r2NzBXigkpM"
MARKER_URL = "https://www.datalab.to/api/v1/marker"

PDF_PATH = Path(__file__).parent / "books" / "math-book.pdf"
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

def submit_pdf(pdf_path: Path) -> str:
    print(f"Submitting {pdf_path.name} to Datalab API...")
    with open(pdf_path, "rb") as f:
        resp = requests.post(
            MARKER_URL,
            headers={"X-Api-Key": API_KEY},
            files={"file": (pdf_path.name, f, "application/pdf")},
            data={
                "output_format": "json",
                "extract_images": "true",
                "use_llm": "false",
            },
        )
    resp.raise_for_status()
    data = resp.json()
    print(f"Submitted. Response: {data}")
    check_url = data.get("request_check_url")
    if not check_url:
        sys.exit(f"No request_check_url in response: {data}")
    return check_url


def poll_until_done(check_url: str, interval: int = 10, max_wait: int = 600) -> dict:
    print(f"Polling {check_url} ...")
    elapsed = 0
    while elapsed < max_wait:
        resp = requests.get(check_url, headers={"X-Api-Key": API_KEY})
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")
        print(f"  [{elapsed}s] status={status}")
        if status == "complete":
            return data
        if status == "error":
            sys.exit(f"API returned error: {data}")
        time.sleep(interval)
        elapsed += interval
    sys.exit(f"Timed out after {max_wait}s")


def save_output(result: dict):
    # Save full JSON response
    json_path = OUTPUT_DIR / "result.json"
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)
    print(f"Saved JSON → {json_path}")

    # Save images
    images: dict = result.get("images", {})
    print(f"Images in response: {len(images)}")
    for filename, data in images.items():
        img_path = OUTPUT_DIR / filename
        # data may be base64 string or raw bytes
        if isinstance(data, str):
            img_bytes = base64.b64decode(data)
        else:
            img_bytes = data
        with open(img_path, "wb") as f:
            f.write(img_bytes)
        print(f"  Saved image → {img_path.name} ({len(img_bytes):,} bytes)")

    return len(images)


def create_zip():
    zip_path = OUTPUT_DIR / f"{PDF_PATH.stem}.zip"
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(OUTPUT_DIR / "result.json", "result.json")
        for img_file in OUTPUT_DIR.glob("*_img.*"):
            zf.write(img_file, img_file.name)
    print(f"Zip created → {zip_path}")
    return zip_path


def main():
    check_url = submit_pdf(PDF_PATH)
    result = poll_until_done(check_url)
    n_images = save_output(result)
    zip_path = create_zip()
    print(f"\nDone. {n_images} image(s) saved. Upload-ready zip: {zip_path}")


if __name__ == "__main__":
    main()
