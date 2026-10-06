"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2 } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { uploadFile } from "@/actions/upload"
import { addTreatmentPhoto, deleteTreatmentPhoto, type getPatientTreatmentPhotos } from "@/actions/treatment-photos"
import { formatDateTime } from "@/lib/format"

type Photos = Awaited<ReturnType<typeof getPatientTreatmentPhotos>>

export function TreatmentPhotosTab({ patientId, photos }: { patientId: string; photos: Photos }) {
  const before = photos.filter((p) => p.type === "BEFORE")
  const after = photos.filter((p) => p.type === "AFTER")

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Before/after treatment photos.</p>
        <AddTreatmentPhotoDialog patientId={patientId} />
      </div>

      {photos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">No photos yet.</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PhotoColumn title="Before" photos={before} />
          <PhotoColumn title="After" photos={after} />
        </div>
      )}
    </div>
  )
}

function PhotoColumn({ title, photos }: { title: string; photos: Photos }) {
  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{title}</p>
      {photos.map((p) => (
        <PhotoCard key={p.id} photo={p} />
      ))}
    </div>
  )
}

function PhotoCard({ photo }: { photo: Photos[number] }) {
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  return (
    <Card>
      <CardContent className="pt-4 space-y-2">
        <img src={photo.photoUrl} alt={photo.caption ?? photo.type} className="w-full rounded border object-cover max-h-64" />
        <div className="flex items-center justify-between">
          <div>
            {photo.caption && <p className="text-xs">{photo.caption}</p>}
            <p className="text-xs text-muted-foreground">
              {formatDateTime(photo.takenAt)}
              {photo.appointment?.service ? ` · ${photo.appointment.service.name}` : ""}
            </p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  await deleteTreatmentPhoto(photo.id)
                  router.refresh()
                } catch {
                  toast.error("Could not delete photo")
                }
              })
            }
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function AddTreatmentPhotoDialog({ patientId }: { patientId: string }) {
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<"BEFORE" | "AFTER">("BEFORE")
  const [caption, setCaption] = useState("")
  const [pending, startTransition] = useTransition()
  const fileRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Add Photo
      </Button>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Treatment Photo</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType((v ?? "BEFORE") as "BEFORE" | "AFTER")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BEFORE">Before</SelectItem>
                <SelectItem value="AFTER">After</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Photo</Label>
            <Input ref={fileRef} type="file" accept="image/*" />
          </div>
          <div className="space-y-1.5">
            <Label>Caption (optional)</Label>
            <Input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="e.g. Week 4" />
          </div>
          <Button
            disabled={pending}
            className="w-full"
            onClick={() =>
              startTransition(async () => {
                const file = fileRef.current?.files?.[0]
                if (!file) {
                  toast.error("Select a photo first")
                  return
                }
                try {
                  const formData = new FormData()
                  formData.set("file", file)
                  const uploaded = await uploadFile(formData)
                  await addTreatmentPhoto({ patientId, type, photoUrl: uploaded.url, caption: caption || undefined })
                  toast.success("Photo added")
                  setOpen(false)
                  setCaption("")
                  if (fileRef.current) fileRef.current.value = ""
                  router.refresh()
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not add photo")
                }
              })
            }
          >
            {pending ? "Uploading…" : "Add Photo"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
