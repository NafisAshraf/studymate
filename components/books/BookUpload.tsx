"use client";

import { useState, useRef, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { parseDatalab } from "@/lib/parsing/parseDatalab";
import { BookUploadProgress } from "./BookUploadProgress";
import { X, Upload } from "lucide-react";
import JSZip from "jszip";

type UploadStep =
  | "parsing"
  | "uploading_images"
  | "uploading_sections"
  | "uploading_chunks"
  | "embedding"
  | "done"
  | "error";

interface BookUploadProps {
  onClose: () => void;
}

export function BookUpload({ onClose }: BookUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createBook = useMutation(api.books.create);
  const batchInsertSections = useMutation(api.sections.batchInsert);
  const batchInsertChunks = useMutation(api.chunks.batchInsert);
  const setEmbedding = useMutation(api.chunks.setEmbedding);
  const updateBookStatus = useMutation(api.books.updateStatus);
  const generateUploadUrl = useMutation(api.bookImages.generateUploadUrl);
  const createBookImage = useMutation(api.bookImages.create);

  const handleUpload = useCallback(
    async (file: File) => {
      try {
        // Step 1: Extract zip and parse JSON
        setUploadStep("parsing");
        setProgress(null);

        const zip = await JSZip.loadAsync(file);

        const resultFile = zip.file("result.json");
        if (!resultFile) {
          throw new Error("result.json not found in zip");
        }
        const jsonText = await resultFile.async("text");
        const json = JSON.parse(jsonText);
        const parsed = parseDatalab(json, file.name);

        // Step 2: Create book
        const bookId = await createBook({
          title: parsed.title,
          pageCount: parsed.pageCount,
          blockCount: parsed.sections.length + parsed.chunks.length,
          chunkCount: parsed.chunks.length,
        });

        // Step 3: Upload images
        const imageFiles = Object.keys(zip.files).filter(
          (name) =>
            /\.(jpg|jpeg|png|gif|webp)$/i.test(name) && !zip.files[name].dir
        );

        if (imageFiles.length > 0) {
          setUploadStep("uploading_images");
          setProgress({ current: 0, total: imageFiles.length });

          const IMAGE_CONCURRENCY = 5;
          let uploaded = 0;

          for (let i = 0; i < imageFiles.length; i += IMAGE_CONCURRENCY) {
            const batch = imageFiles.slice(i, i + IMAGE_CONCURRENCY);
            await Promise.all(
              batch.map(async (imgName) => {
                const blob = await zip.file(imgName)!.async("blob");
                const uploadUrl = await generateUploadUrl();
                const res = await fetch(uploadUrl, {
                  method: "POST",
                  headers: { "Content-Type": blob.type || "image/jpeg" },
                  body: blob,
                });
                const { storageId } = await res.json();
                await createBookImage({
                  bookId,
                  filename: imgName,
                  storageId,
                });
              })
            );
            uploaded += batch.length;
            setProgress({ current: uploaded, total: imageFiles.length });
          }
        }

        // Step 4: Upload sections in batches
        setUploadStep("uploading_sections");
        setProgress(null);
        const datalabIdToSectionId = new Map<string, Id<"sections">>();
        const SECTION_BATCH_SIZE = 100;

        for (let i = 0; i < parsed.sections.length; i += SECTION_BATCH_SIZE) {
          const batch = parsed.sections.slice(i, i + SECTION_BATCH_SIZE);
          const sectionArgs = batch.map((section) => ({
            bookId,
            datalabId: section.datalabId,
            title: section.title,
            htmlTag: section.htmlTag,
            level: section.level,
            parentSectionId: section.parentDatalabId
              ? datalabIdToSectionId.get(section.parentDatalabId)
              : undefined,
            order: section.order,
            page: section.page,
          }));

          const ids = await batchInsertSections({ sections: sectionArgs });
          batch.forEach((section, idx) => {
            datalabIdToSectionId.set(section.datalabId, ids[idx]);
          });
        }

        // Step 5: Upload chunks in batches
        setUploadStep("uploading_chunks");
        const CHUNK_BATCH_SIZE = 50;
        const allChunkIds: Id<"chunks">[] = [];

        // Filter chunks to only those with a valid section mapping
        const validChunks = parsed.chunks.filter((chunk) => {
          const sectionId = datalabIdToSectionId.get(
            chunk.parentSectionDatalabId
          );
          if (!sectionId) {
            console.warn(
              `Skipping chunk with no section mapping: ${chunk.datalabId}`
            );
            return false;
          }
          return true;
        });

        for (let i = 0; i < validChunks.length; i += CHUNK_BATCH_SIZE) {
          const batch = validChunks.slice(i, i + CHUNK_BATCH_SIZE);
          const chunkArgs = batch.map((chunk) => {
            const sectionId = datalabIdToSectionId.get(
              chunk.parentSectionDatalabId
            )!;
            return {
              bookId,
              sectionId,
              datalabId: chunk.datalabId,
              blockType: chunk.blockType,
              content: chunk.content,
              html: chunk.html,
              page: chunk.page,
              order: chunk.order,
              sectionPath: chunk.sectionPath,
              embeddingText: chunk.embeddingText,
            };
          });

          const ids = await batchInsertChunks({ chunks: chunkArgs });
          allChunkIds.push(...ids);
        }

        // Step 6: Generate embeddings
        setUploadStep("embedding");
        await updateBookStatus({ id: bookId, status: "embedding" });

        const EMBEDDING_BATCH_SIZE = 10;
        const INTER_BATCH_DELAY_MS = 500;
        const totalChunks = validChunks.length;
        let processedChunks = 0;
        setProgress({ current: 0, total: totalChunks });

        for (let i = 0; i < validChunks.length; i += EMBEDDING_BATCH_SIZE) {
          const batch = validChunks.slice(i, i + EMBEDDING_BATCH_SIZE);
          const batchChunkIds = allChunkIds.slice(i, i + EMBEDDING_BATCH_SIZE);

          const response = await fetch("/api/upload/embeddings", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              texts: batch.map((c) => c.embeddingText),
            }),
          });

          if (!response.ok) {
            const errBody = await response.json().catch(() => ({}));
            const detail =
              (errBody as { error?: string }).error ||
              `HTTP ${response.status}`;
            throw new Error(`Embedding failed: ${detail}`);
          }

          const { embeddings } = await response.json();

          // Save embeddings in parallel
          await Promise.all(
            embeddings.map((embedding: number[], j: number) =>
              setEmbedding({
                id: batchChunkIds[j],
                embedding,
              })
            )
          );

          processedChunks += batch.length;
          setProgress({ current: processedChunks, total: totalChunks });

          // Small delay between batches to respect rate limits
          if (i + EMBEDDING_BATCH_SIZE < validChunks.length) {
            await new Promise((r) => setTimeout(r, INTER_BATCH_DELAY_MS));
          }
        }

        // Step 7: Mark as ready
        await updateBookStatus({ id: bookId, status: "ready" });
        setUploadStep("done");

        // Close modal after brief delay so user sees "done"
        setTimeout(() => {
          onClose();
        }, 800);
      } catch (error) {
        console.error("Upload error:", error);
        setUploadStep("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Upload failed"
        );
      }
    },
    [
      createBook,
      batchInsertSections,
      batchInsertChunks,
      setEmbedding,
      updateBookStatus,
      generateUploadUrl,
      createBookImage,
      onClose,
    ]
  );

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".zip")) {
        setUploadStep("error");
        setErrorMessage("Only .zip files are accepted");
        return;
      }
      handleUpload(file);
    },
    [handleUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const isUploading = uploadStep !== null && uploadStep !== "error";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={!isUploading ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-bg-surface border border-border rounded-2xl w-full max-w-lg mx-4 p-6">
        {/* Close button */}
        {!isUploading && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <h2 className="font-[family-name:var(--font-display)] text-[20px] text-text-primary italic mb-5">
          Upload Book
        </h2>

        {uploadStep === null || uploadStep === "error" ? (
          <>
            {/* Drop zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center gap-3 cursor-pointer transition-all ${
                isDragging
                  ? "border-accent bg-accent/5"
                  : "border-border hover:border-text-muted"
              }`}
            >
              <Upload
                className={`w-8 h-8 ${isDragging ? "text-accent" : "text-text-muted"}`}
              />
              <p className="text-text-secondary text-[13px] font-[family-name:var(--font-body)] text-center">
                Drag and drop a Datalab zip file here
              </p>
              <p className="text-text-muted text-[11px] font-[family-name:var(--font-body)]">
                or click to browse
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              onChange={handleFileInput}
              className="hidden"
            />

            {uploadStep === "error" && errorMessage && (
              <p className="mt-3 text-red-400 text-[12px] font-[family-name:var(--font-body)]">
                {errorMessage}
              </p>
            )}
          </>
        ) : (
          <BookUploadProgress
            currentStep={uploadStep}
            progress={progress}
            errorMessage={errorMessage}
          />
        )}
      </div>
    </div>
  );
}
