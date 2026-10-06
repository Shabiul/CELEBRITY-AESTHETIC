"use client"

import { uploadFile as uploadFileAction } from "@/actions/upload"

// Server actions on Vercel can't take a body over ~4.5MB (platform cap), and a
// phone photo is routinely 3-10MB — so big images are downscaled in the
// browser first. The server still re-compresses to ~300KB afterwards.
const SEND_LIMIT = 3.5 * 1024 * 1024
const MAX_DIMENSION = 2400

async function shrinkImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  for (const quality of [0.85, 0.7, 0.55, 0.4]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality))
    if (blob && blob.size <= SEND_LIMIT) {
      return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
    }
  }
  throw new Error("This image is too large to upload. Please choose a smaller one.")
}

/** Drop-in replacement for the `uploadFile` server action: same FormData in, same result out. */
export async function uploadFile(formData: FormData) {
  const file = formData.get("file")
  if (file instanceof File && file.size > SEND_LIMIT) {
    if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
      throw new Error("File exceeds the 3.5MB upload limit")
    }
    formData.set("file", await shrinkImage(file))
  }
  return uploadFileAction(formData)
}
