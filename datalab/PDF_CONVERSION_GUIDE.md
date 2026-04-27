# PDF to Zip Conversion Guide

## Overview

This guide shows you how to convert a PDF book file into a zip file in the format required by the web app.

**What happens:**
1. You copy your PDF into the `datalab/books/` folder
2. You update one line in the script to point to your file
3. You run the script
4. The script sends the PDF to the Datalab API for processing
5. A `.zip` file is created in `datalab/output/` with all extracted content
6. You upload this zip file to the web app

**What you get — a `.zip` file containing:**
- `result.json` — Extracted text and document structure
- Image files (e.g., `30a26f2d_img.jpg`) — All images extracted from the PDF

---

## Prerequisites

- ✅ Python 3 installed on your computer
- ✅ A PDF file you want to convert
- ✅ Internet connection (the script calls the Datalab API)
- ✅ The `datalab/` folder with `scan_book.py` (this directory)

To check your Python version:
```bash
python3 --version
```

---

## Step-by-Step Instructions

### Step 1: Copy Your PDF into the Books Folder

Copy or move your PDF file into:
```
rag-mvp/datalab/books/
```

Example: If your PDF is `my-textbook.pdf`, the path should be:
```
rag-mvp/datalab/books/my-textbook.pdf
```

### Step 2: Update the Script with Your Filename

Open `datalab/scan_book.py` in any text editor and find this line near the top (around line 17):

```python
PDF_PATH = Path(__file__).parent / "books" / "Secondary (BV)-2026_Class 9-10_Math_compressed (1) (1).pdf"
```

Change the filename in quotes to match your PDF file name. For example:

```python
PDF_PATH = Path(__file__).parent / "books" / "my-textbook.pdf"
```

Save the file.

### Step 3: Navigate to the Datalab Folder

Open your terminal and navigate **into the `datalab/` folder**:

```bash
cd /path/to/rag-mvp/datalab
```

> ⚠️ **Important:** You must be inside the `datalab/` directory — not the project root — for the next steps to work.

### Step 4: Activate the Virtual Environment

On **Mac/Linux:**
```bash
source venv/bin/activate
```

On **Windows:**
```bash
venv\Scripts\activate
```

You'll see `(venv)` appear at the start of your prompt:
```
(venv) $
```

### Step 5: Run the Script

```bash
python3 scan_book.py
```

**What you'll see:**
```
Submitting my-textbook.pdf to Datalab API...
Submitted. Response: {'success': True, 'error': None, 'request_id': '...'}
Polling https://www.datalab.to/api/v1/marker/...
  [0s] status=processing
  [10s] status=complete
Saved JSON → /path/to/rag-mvp/datalab/output/result.json
Images in response: 3
  Saved image → 30a26f2d17ca95672702bf50fb4f0242_img.jpg (58,304 bytes)
  Saved image → 64662465bba247703fdec49c8f3309f9_img.jpg (5,406 bytes)
  Saved image → 7affafe7362a2d2d072e9d4bf515f0bb_img.jpg (22,788 bytes)
Done. 3 image(s) saved. Upload-ready zip: /path/to/rag-mvp/datalab/output/my-textbook.zip
```

### Step 6: Find Your Zip File

Your completed zip file will be at:
```
datalab/output/your-pdf-filename.zip
```

---

## Example: Full Workflow

```bash
# 1. Copy PDF to books folder
cp ~/Downloads/my-textbook.pdf /path/to/rag-mvp/datalab/books/

# 2. Edit scan_book.py to use your filename (do this in your text editor)

# 3. Navigate into datalab/
cd /path/to/rag-mvp/datalab

# 4. Activate the environment
source venv/bin/activate

# 5. Run
python3 scan_book.py

# 6. Find your zip at:
ls output/
```

---

## Processing Time

| PDF Size | Approximate Time |
|----------|-----------------|
| < 50 pages | 1–2 minutes |
| 50–200 pages | 2–5 minutes |
| > 200 pages | 5–10 minutes |

---

## Next Steps: Upload to Web App

1. Open the web app in your browser
2. Navigate to the book upload section
3. Select your `.zip` file from `datalab/output/`
4. Upload — the app will process the content and make it searchable

---

## Troubleshooting

### "source: no such file or directory: venv/bin/activate"

**Cause:** You're running from the wrong directory (e.g., from `rag-mvp/` root).

**Fix:** Make sure you're inside the `datalab/` folder first:
```bash
cd /path/to/rag-mvp/datalab
source venv/bin/activate
```

### "No such file or directory" for your PDF

**Cause:** The filename in `PDF_PATH` doesn't match the actual file.

**Fix:**
- Double-check the filename in `scan_book.py` matches exactly (including spaces and capitalization)
- Confirm the file is in `datalab/books/`
- List the folder to verify: `ls books/`

### "Connection error" or "API request failed"

**Fix:**
- Check your internet connection
- Wait a few minutes and retry — the API may be temporarily busy

### "Processing timed out"

**Fix:**
- Try again (server load varies)
- For very large PDFs, try splitting into smaller parts first

### File path has spaces

Wrap the filename in your text editor update with the full name including spaces — Python handles this fine since it's a string, not a shell command.
