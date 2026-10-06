"use server"

import { writeFile, mkdir } from "fs/promises"
import path from "path"
import { nanoid } from "nanoid"
import { put } from "@vercel/blob"
import sharp from "sharp"

const UPLOAD_DIR = path.join(process.cwd(), "public", "uploads")
const MAX_SIZE_BYTES = 10 * 1024 * 1024
// Target band for compressed images — see compressImageIfNeeded.
const TARGET_MAX_BYTES = 300 * 1024

/**
 * Re-encodes an uploaded image down into the 100-300KB band by stepping
 * down JPEG quality (and, if quality alone isn't enough, physical
 * dimensions) — plain server-side `sharp`, not Vercel's Image Optimization
 * API (which only applies to `next/image` requests, not stored files).
 * Non-image buffers (PDFs, etc.) pass through untouched.
 */
async function compressImageIfNeeded(buffer: Buffer, mimeType: string): Promise<{ buffer: Buffer; contentType: string; ext: string }> {
  if (!mimeType.startsWith("image/") || mimeType === "image/svg+xml") {
    return { buffer, contentType: mimeType, ext: "" }
  }
  if (buffer.length <= TARGET_MAX_BYTES) {
    return { buffer, contentType: mimeType, ext: "" }
  }

  let width: number | undefined = (await sharp(buffer).metadata()).width

  for (let attempt = 0; attempt < 8; attempt++) {
    for (const quality of [80, 65, 50, 35, 25]) {
      const out = await sharp(buffer, { failOn: "none" })
        .rotate()
        .resize(width ? { width, withoutEnlargement: true } : undefined)
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      if (out.length <= TARGET_MAX_BYTES) {
        return { buffer: out, contentType: "image/jpeg", ext: ".jpg" }
      }
    }
    // Quality alone couldn't get under the cap at this size — shrink dimensions and retry.
    width = width ? Math.round(width * 0.75) : undefined
    if (!width || width < 200) break
  }

  // Last resort: smallest/lowest-quality pass, whatever size it lands at.
  const fallback = await sharp(buffer, { failOn: "none" })
    .rotate()
    .resize({ width: 200, withoutEnlargement: true })
    .jpeg({ quality: 20, mozjpeg: true })
    .toBuffer()
  return { buffer: fallback, contentType: "image/jpeg", ext: ".jpg" }
}

export async function uploadFile(formData: FormData) {
  const file = formData.get("file") as File | null
  if (!file || file.size === 0) {
    throw new Error("No file provided")
  }
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error("File exceeds 10MB limit")
  }

  const originalExt = path.extname(file.name) || ""
  const originalBuffer = Buffer.from(await file.arrayBuffer())
  const { buffer, contentType, ext: compressedExt } = await compressImageIfNeeded(originalBuffer, file.type || "application/octet-stream")
  const ext = compressedExt || originalExt
  const safeName = `${nanoid(12)}${ext}`

  // 1. Try Vercel Blob if BLOB_READ_WRITE_TOKEN is configured
  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const blob = await put(safeName, buffer, {
        access: "public",
        contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
        cacheControlMaxAge: 31536000,
      })

      return {
        url: blob.url,
        name: file.name,
        type: contentType,
      }
    } catch (err) {
      console.warn("[upload] Vercel Blob upload failed, falling back to local disk:", err)
    }
  }

  // 2. Local disk fallback
  await mkdir(UPLOAD_DIR, { recursive: true })
  await writeFile(path.join(UPLOAD_DIR, safeName), buffer)

  return {
    url: `/uploads/${safeName}`,
    name: file.name,
    type: contentType,
  }
}
