# Image Support for StudyMate Book Upload Pipeline

## Problem

The platform was built to consume Datalab playground JSON output, which contains text and HTML but no actual image files. The Datalab API returns a richer response that includes extracted images as base64 data. Currently, chunks contain `<img src="filename.jpg">` tags in their HTML, but the filenames don't resolve to any URL — images don't display.

## Goal

Update the platform so that:
1. The Datalab API output (JSON + images) can be uploaded as a single `.zip` file
2. Images are stored in Convex file storage and displayed wherever chunk HTML references them
3. The system works reliably across multiple book uploads of varying sizes

## Architecture Decision

**Image lookup table + render-time URL resolution.**

Convex storage URLs from `getUrl()` are signed temporary URLs. Baking them into the `html` field at upload time would cause broken images when URLs expire. Instead:

- Store images in Convex file storage, mapping `filename -> storageId` in a `bookImages` table
- Leave chunk HTML untouched (`<img src="filename.jpg">` stays as-is)
- At render time, query `bookImages` once per book, build a `filename -> url` map, rewrite `src` attributes on the fly

## End-to-End Workflow

```
scan_book.py (Python)
  Input:  PDF file
  Output: .zip containing result.json + image files

Browser Upload (or CLI script)
  1. Extract zip
  2. Upload images -> Convex file storage -> bookImages rows
  3. Parse JSON -> sections + chunks (HTML unchanged)
  4. Batch-insert sections, chunks
  5. Generate embeddings
  6. Mark book "ready"

Render Time
  Query bookImages -> build {filename: url} map -> rewrite <img src> on the fly
```

---

## Schema Changes

### New table: `bookImages`

```typescript
bookImages: defineTable({
  bookId: v.id("books"),
  filename: v.string(),
  storageId: v.id("_storage"),
})
  .index("by_bookId", ["bookId"])
  .index("by_bookId_and_filename", ["bookId", "filename"])
```

### Existing tables

No changes to `books`, `sections`, `chunks`, `chatSessions`, or `messages`. The `html` field on chunks keeps its original `<img src="filename.jpg">` content.

---

## New File: `convex/bookImages.ts`

### Mutations

- **`generateUploadUrl()`**: Returns `ctx.storage.generateUploadUrl()` for client-side upload.
- **`create({ bookId, filename, storageId })`**: Inserts a `bookImages` row.

### Queries

- **`byBook({ bookId })`**: Fetches all `bookImages` rows for a book. For each row, resolves `storageId` to a URL via `ctx.storage.getUrl(storageId)`. Filters out entries where `getUrl()` returns `null` (deleted/missing files). Returns `Array<{ filename: string, url: string }>`.

### Internal Functions

- **`deleteByBook({ bookId })`**: An `internalMutation` that queries `bookImages` for the book (paginated in batches to stay within transaction limits), calls `ctx.storage.delete(storageId)` for each, then deletes the rows. If more remain, schedules itself again via `ctx.scheduler.runAfter(0, ...)`. Used during book deletion.

---

## Parser Update: `lib/parsing/parseDatalab.ts`

### Format Detection

The parser detects which JSON format it received:

- **API format**: Top-level has `json` key. Document tree is at `data.json.children`. Top-level `images` key has `{ filename: base64 }` dict.
- **Playground format**: Top-level has `children` key directly.

### Changes to `ParsedBook` (in `types.ts`)

Add `imageFilenames: string[]` — list of image filenames found in the document.

### Extraction Logic

- From API format: collect keys from `data.images` (top-level).
- From playground format: collect keys from block-level `images` objects.
- These filenames are used by the upload flow to know which files to extract from the zip.

### Image-Only Blocks Fix

Currently, blocks with `content.length < MIN_CHUNK_CONTENT_LENGTH` (5 chars) are skipped. This drops image-only blocks (e.g., a `Picture` block where the plain text is just an alt-text stub or empty after HTML stripping). Fix: exempt `Figure` and `Picture` block types from the minimum content length check. These blocks should be preserved since their value is the `<img>` tag in the HTML, not the text content.

---

## Upload Flow: Browser (`BookUpload.tsx`)

### Dependencies

Add `jszip` npm package for zip extraction.

### Accepted File Types

Change from `.json` to `.zip`. The zip must contain:
- `result.json` (the Datalab API output)
- Image files (`.jpg`, `.png`) at the root level of the zip

### Step-by-Step Flow

1. **Extract zip** using JSZip. Read `result.json` as text. Identify image files.
2. **Parse JSON** with updated `parseDatalab()`. Get `ParsedBook` with sections, chunks, and `imageFilenames`.
3. **Create book** record in Convex (status: "parsing").
4. **Upload images** (new step):
   - For each image file in the zip that matches `imageFilenames`:
     - Call `bookImages.generateUploadUrl()` mutation
     - `fetch(PUT)` the image blob to the returned URL → get `storageId` from response
     - Call `bookImages.create({ bookId, filename, storageId })`
   - Parallelism: 5 concurrent uploads to balance speed and browser resource usage
   - Progress tracking: show "Uploading images (3/15)" in the progress UI
5. **Upload sections** in batches of 100 (unchanged).
6. **Upload chunks** in batches of 50 (unchanged). HTML is stored as-is with bare filenames.
7. **Generate embeddings** in batches of 10 with 500ms delay (unchanged).
8. **Mark book "ready"**.

### Error Handling

- If image upload fails: log warning, continue with remaining images. Chunks will render text without the failed image.
- If JSON parsing fails: show error, do not create book.
- If book creation succeeds but subsequent steps fail: book stays in "parsing"/"embedding" status. User can delete and retry.

---

## Upload Flow: CLI (`scripts/upload-book.ts`)

A Node.js script sharing the same `parseDatalab.ts` parser and following the same logic:

1. Read zip from disk (or folder with `result.json` + images)
2. Parse JSON
3. Use `ConvexHttpClient` for mutations (sections, chunks, book status)
4. Upload images: call `generateUploadUrl` mutation via `ConvexHttpClient`, then `fetch(PUT)` the image blob to the returned URL, then call `bookImages.create` mutation. (`ConvexHttpClient` supports calling mutations that return `generateUploadUrl` — it's a standard mutation returning a string.)
5. Insert sections, chunks
6. Call embedding API
7. Mark ready

Uses the `CONVEX_URL` from `.env.local` and requires `NEXT_PUBLIC_CONVEX_URL` to connect.

---

## Rendering Changes

### New utility: `lib/images/rewriteImageUrls.ts`

```typescript
export function rewriteImageSrcs(
  html: string,
  urlMap: Record<string, string>
): string {
  // Only rewrite src attributes on <img> tags, not on <iframe>, <script>, etc.
  return html.replace(
    /<img(\s[^>]*)src=["']([^"']+)["']/gi,
    (match, before, filename) => {
      const url = urlMap[filename];
      return url ? `<img${before}src="${url}"` : match;
    }
  );
}
```

### `BookViewer.tsx`

- Query `bookImages.byBook(bookId)` once when the book loads.
- Build a `Record<string, string>` map from `{ filename, url }` pairs.
- Pass `imageUrlMap` as a prop to child components.

### `ContentBlock.tsx`

- Accept `imageUrlMap?: Record<string, string>` prop.
- Before rendering (both the Figure/Picture path and the markdown conversion path), call `rewriteImageSrcs(html, imageUrlMap)`.

### `CitationSidebar.tsx` (SectionOverlay)

- The overlay renders chunk HTML with `dangerouslySetInnerHTML`.
- Before setting innerHTML, call `rewriteImageSrcs(html, imageUrlMap)`.
- **Threading `bookId`**: The `SectionOverlay` currently receives only `sectionId`. The section record has `bookId`, which is already queried via `sections.get`. Use `section.bookId` to query `bookImages.byBook()` inside the overlay. This requires no changes to the `Citation` interface or threading from the chat context — the overlay is self-contained.

### `SectionNode.tsx`

- Pass `imageUrlMap` through to `ContentBlock` children.

---

## Python Script Update: `datalab/scan_book.py`

After saving `result.json` and image files to the output folder, add a zip step:

1. Create a `.zip` file named after the PDF (e.g., `math-textbook.zip`)
2. Add `result.json` at the root
3. Add all image files at the root
4. Save the zip to the `datalab/output/` folder

The user then uploads this single zip via the browser or CLI.

---

## Backward Compatibility

The upload UI changes from accepting `.json` to `.zip`. Since all Convex tables are currently empty (clean slate), there is no need to maintain backward compatibility with the old playground JSON format. The parser still detects both formats (API vs playground) for robustness, but the upload UI only accepts `.zip` files going forward.

---

## Book Deletion Cleanup

Update `convex/books.ts` `remove()`:

1. Schedule `bookImages.deleteByBook` (paginated internalMutation) to clean up storage files and image rows
2. Continue with existing chunk/section/book deletion (already paginated)

---

## Large Book Considerations

- **Image count**: Most textbooks have 10-100 images. At 5 parallel uploads, 100 images takes ~20 upload cycles. Each cycle is ~1-2 seconds. Total: ~40 seconds for images.
- **Chunk count**: Existing batch sizes (50/batch for chunks, 10/batch for embeddings) are already designed for this.
- **Convex limits**: Each image is a separate storage upload (not a transaction). `bookImages.create` rows are tiny (~100 bytes each). No transaction size concerns.
- **Embedding generation**: For very large books, the 500ms inter-batch delay keeps us under rate limits. The existing exponential backoff handles transient failures.
- **Image file sizes**: Convex supports up to 128MB per storage file. Book images from Datalab are typically 5-100KB (JPEG). No size concerns expected.
- **Transaction limits for deletion**: The `deleteByBook` internal mutation is paginated — it processes a batch, then schedules itself for the remainder, avoiding transaction overflows.

---

## File Change Summary

| File | Change Type | Description |
|------|------------|-------------|
| `datalab/scan_book.py` | Modify | Add zip creation step |
| `convex/schema.ts` | Modify | Add `bookImages` table |
| `convex/bookImages.ts` | New | generateUploadUrl, create, byBook, deleteByBook |
| `convex/books.ts` | Modify | Update `remove` to clean up images + storage |
| `lib/parsing/types.ts` | Modify | Add `imageFilenames` to `ParsedBook` |
| `lib/parsing/parseDatalab.ts` | Modify | Handle API format, extract image filenames |
| `lib/images/rewriteImageUrls.ts` | New | Shared HTML src rewriting utility |
| `components/books/BookUpload.tsx` | Modify | Accept .zip, upload images step |
| `components/books/BookUploadProgress.tsx` | Modify | Add "Uploading images" progress step |
| `components/books/ContentBlock.tsx` | Modify | Accept imageUrlMap, rewrite srcs |
| `components/books/BookViewer.tsx` | Modify | Query bookImages, pass map down |
| `components/books/SectionNode.tsx` | Modify | Thread imageUrlMap to ContentBlock |
| `components/chat/CitationSidebar.tsx` | Modify | Rewrite image srcs in overlay |
| `scripts/upload-book.ts` | New | CLI upload script |
| `package.json` | Modify | Add `jszip` dependency |
