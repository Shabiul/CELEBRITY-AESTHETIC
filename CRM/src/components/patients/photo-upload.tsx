"use client"

import { useRef, useState } from "react"
import { Loader2, Upload, User } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { uploadFile } from "@/actions/upload"
import { compressImageClientSide } from "@/lib/client-image-compress"

export function PhotoUpload({
  value,
  onChange,
}: {
  value?: string
  onChange: (url: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file")
      return
    }
    setUploading(true)
    try {
      const compressed = await compressImageClientSide(file)
      const formData = new FormData()
      formData.set("file", compressed)
      const result = await uploadFile(formData)
      onChange(result.url)
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar className="h-16 w-16">
        {value && <AvatarImage src={value} alt="Patient photo" />}
        <AvatarFallback>
          <User className="h-6 w-6 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className="gap-1.5"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {value ? "Change photo" : "Upload photo"}
        </Button>
      </div>
    </div>
  )
}
