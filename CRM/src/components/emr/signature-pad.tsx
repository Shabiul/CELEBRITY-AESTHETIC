"use client"

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { uploadFile } from "@/actions/upload"

export function SignaturePad({
  onSave,
  saving = false,
}: {
  onSave: (url: string) => void | Promise<void>
  saving?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const hasStroke = useRef(false)
  const [uploading, setUploading] = useState(false)

  function getContext() {
    const canvas = canvasRef.current
    if (!canvas) return null
    const ctx = canvas.getContext("2d")
    if (ctx) {
      ctx.lineWidth = 2
      ctx.lineCap = "round"
      ctx.strokeStyle = "#111827"
    }
    return ctx
  }

  function pointerPos(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const ctx = getContext()
    if (!ctx) return
    drawing.current = true
    const { x, y } = pointerPos(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    const ctx = getContext()
    if (!ctx) return
    const { x, y } = pointerPos(e)
    ctx.lineTo(x, y)
    ctx.stroke()
    hasStroke.current = true
  }

  function handlePointerUp() {
    drawing.current = false
  }

  function clear() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext("2d")
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height)
    hasStroke.current = false
  }

  async function save() {
    const canvas = canvasRef.current
    if (!canvas || !hasStroke.current) {
      toast.error("Draw your signature first")
      return
    }
    setUploading(true)
    try {
      const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"))
      if (!blob) throw new Error("Could not capture signature")
      const formData = new FormData()
      formData.set("file", new File([blob], "signature.png", { type: "image/png" }))
      const result = await uploadFile(formData)
      await onSave(result.url)
    } catch {
      toast.error("Could not save signature")
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        width={400}
        height={150}
        className="w-full touch-none rounded-md border bg-white"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clear} disabled={uploading || saving}>
          Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={uploading || saving}>
          {uploading || saving ? "Saving…" : "Save Signature"}
        </Button>
      </div>
    </div>
  )
}
