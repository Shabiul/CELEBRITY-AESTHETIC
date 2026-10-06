"use client"

import { useRef, useState, useTransition } from "react"
import { FileText, Loader2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { EntityDialog } from "@/components/shared/entity-dialog"
import { DeleteButton } from "@/components/shared/delete-button"
import { formatDateTime } from "@/lib/format"
import { documentCategoryLabels } from "@/lib/labels"
import { addDocument, deleteDocument } from "@/actions/patients"
import { uploadFile } from "@/actions/upload"
import { compressImageClientSide } from "@/lib/client-image-compress"
import type { getPatientById } from "@/actions/patients"

type Patient = NonNullable<Awaited<ReturnType<typeof getPatientById>>>

export function DocumentsTab({ patient }: { patient: Patient }) {
  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{patient.documents.length} document(s) on file</p>
          <EntityDialog title="Upload Document">
            {(close) => <DocumentForm patientId={patient.id} onDone={close} />}
          </EntityDialog>
        </div>

        {patient.documents.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No documents uploaded yet.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {patient.documents.map((doc) => (
            <a
              key={doc.id}
              href={doc.fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex items-start gap-3 rounded-lg border p-3 hover:bg-muted transition-colors"
            >
              <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{doc.title}</p>
                <Badge variant="outline" className="mt-1">{documentCategoryLabels[doc.category]}</Badge>
                <p className="text-xs text-muted-foreground mt-1">{formatDateTime(doc.uploadedAt)}</p>
              </div>
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.preventDefault()}
              >
                <DeleteButton onDelete={() => deleteDocument(patient.id, doc.id)} />
              </div>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function DocumentForm({ patientId, onDone }: { patientId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition()
  const [uploading, setUploading] = useState(false)
  const [fileInfo, setFileInfo] = useState<{ url: string; type: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const compressed = await compressImageClientSide(file)
      const fd = new FormData()
      fd.set("file", compressed)
      const result = await uploadFile(fd)
      setFileInfo({ url: result.url, type: result.type })
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!fileInfo) {
          toast.error("Please choose a file first")
          return
        }
        const fd = new FormData(e.currentTarget)
        startTransition(async () => {
          try {
            await addDocument(patientId, {
              title: String(fd.get("title") || ""),
              category: String(fd.get("category") || "OTHER") as never,
              fileUrl: fileInfo.url,
              fileType: fileInfo.type,
            })
            toast.success("Document uploaded")
            onDone()
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not add document")
          }
        })
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="doc-title">Title</Label>
        <Input id="doc-title" name="title" required placeholder="e.g. CBC Report — Jan 2026" />
      </div>
      <div className="space-y-1.5">
        <Label>Category</Label>
        <Select items={documentCategoryLabels} name="category" defaultValue="OTHER">
          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(documentCategoryLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>File</Label>
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
        <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {fileInfo ? "File selected — change" : "Choose file"}
        </Button>
      </div>
      <Button type="submit" disabled={pending || uploading} className="w-full">
        {pending ? "Saving…" : "Save Document"}
      </Button>
    </form>
  )
}
