"use client"

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Printer, Send, Upload, Loader2, PenLine, ScanLine } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createPrescription, createScannedPrescription } from "@/actions/patients"
import { uploadFile } from "@/actions/upload"
import { addDocument } from "@/actions/patients"
import { logMessage } from "@/actions/crm"
import { getDoctorSignature } from "@/actions/signature"
import { buildPrescriptionPrintHtml, DOCTOR_LETTERHEAD } from "@/lib/print-prescription"
import { CLINIC_INFO } from "@/lib/hospital-info"

type Item = { medicineName: string; dosage?: string; frequency?: string; duration?: string; instructions?: string }
const emptyItem: Item = { medicineName: "" }

type Doctor = { id: string; name: string; specialization: string | null }
type PatientInfo = { id: string; name: string; uhid: string; age: number | null; gender: string | null }

export function PrescriptionPadForm({
  patient,
  doctors,
  defaultDoctorId,
  appointmentId,
}: {
  patient: PatientInfo
  doctors: Doctor[]
  defaultDoctorId: string
  appointmentId?: string
}) {
  const [mode, setMode] = useState<"DIGITAL" | "SCANNED">("DIGITAL")

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={mode === "DIGITAL" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setMode("DIGITAL")}
        >
          <PenLine className="h-4 w-4" />
          Digital Prescription Pad
        </Button>
        <Button
          type="button"
          variant={mode === "SCANNED" ? "default" : "outline"}
          className="gap-1.5"
          onClick={() => setMode("SCANNED")}
        >
          <ScanLine className="h-4 w-4" />
          Upload Scanned Copy
        </Button>
      </div>

      {mode === "DIGITAL" ? (
        <DigitalPad patient={patient} doctors={doctors} defaultDoctorId={defaultDoctorId} appointmentId={appointmentId} />
      ) : (
        <ScannedUpload patient={patient} defaultDoctorId={defaultDoctorId} />
      )}
    </div>
  )
}

function DigitalPad({
  patient,
  doctors,
  defaultDoctorId,
  appointmentId,
}: {
  patient: PatientInfo
  doctors: Doctor[]
  defaultDoctorId: string
  appointmentId?: string
}) {
  const router = useRouter()
  const [doctorId, setDoctorId] = useState(defaultDoctorId)
  const [diagnosis, setDiagnosis] = useState("")
  const [weightAtVisit, setWeightAtVisit] = useState("")
  const [items, setItems] = useState<Item[]>([{ ...emptyItem }])
  const [advice, setAdvice] = useState("")
  const [reviewAfter, setReviewAfter] = useState("")
  const [notes, setNotes] = useState("")
  const [pending, startTransition] = useTransition()
  const [sending, setSending] = useState(false)

  const selectedDoctor = doctors.find((d) => d.id === doctorId)

  function updateItem(index: number, field: keyof Item, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }
  function addRow() {
    setItems((prev) => [...prev, { ...emptyItem }])
  }
  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function currentInput() {
    return {
      diagnosis: diagnosis || undefined,
      weightAtVisit: weightAtVisit || undefined,
      advice: advice || undefined,
      reviewAfter: reviewAfter || undefined,
      notes: notes || undefined,
      items: items.filter((it) => it.medicineName.trim()),
    }
  }

  async function saveAndReturn(prescription: Awaited<ReturnType<typeof createPrescription>>) {
    toast.success(`Prescription ${prescription.prescriptionNumber ?? ""} saved`)
    router.push(`/patients/${patient.id}?tab=prescriptions`)
  }

  function handleSave() {
    if (!doctorId) {
      toast.error("Select the prescribing doctor")
      return
    }
    const input = currentInput()
    if (input.items.length === 0) {
      toast.error("Add at least one medicine")
      return
    }
    startTransition(async () => {
      try {
        const prescription = await createPrescription(patient.id, doctorId, input, appointmentId)
        await saveAndReturn(prescription)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not save prescription")
      }
    })
  }

  async function handlePrint() {
    const printWindow = window.open("", "_blank")
    if (!printWindow) return
    const signature = doctorId ? await getDoctorSignature(doctorId).catch(() => null) : null
    printWindow.document.write(
      buildPrescriptionPrintHtml(
        { ...currentInput(), issuedAt: new Date(), doctor: selectedDoctor || null },
        { name: patient.name, uhid: patient.uhid, age: patient.age, gender: patient.gender },
        signature?.signatureUrl ?? null
      )
    )
    printWindow.document.close()
  }

  function handleSend() {
    const input = currentInput()
    if (input.items.length === 0) {
      toast.error("Add at least one medicine before sending")
      return
    }
    setSending(true)
    const lines = input.items
      .map((i) => `• ${i.medicineName}${i.dosage ? ` (${i.dosage})` : ""}${i.frequency ? ` — ${i.frequency}` : ""}${i.duration ? ` x ${i.duration}` : ""}`)
      .join("\n")
    const body = `Prescription from ${selectedDoctor?.name || DOCTOR_LETTERHEAD.name}, ${CLINIC_INFO.name}:\n${input.diagnosis ? `Complaint: ${input.diagnosis}\n` : ""}${lines}${input.advice ? `\nAdvice: ${input.advice}` : ""}${input.reviewAfter ? `\nReview after: ${input.reviewAfter}` : ""}`
    startTransition(async () => {
      try {
        // Save the prescription first so it's on record, then log the WhatsApp send
        // via the existing Communications capability (logMessage) — no separate send
        // mechanism is built here, matching what Communications already supports.
        const prescription = await createPrescription(patient.id, doctorId, input, appointmentId)
        await logMessage(patient.id, { channel: "WHATSAPP", subject: "Prescription", body })
        toast.success("Prescription saved and logged to Communications for WhatsApp send")
        router.push(`/patients/${patient.id}?tab=prescriptions`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not send prescription")
      } finally {
        setSending(false)
      }
    })
  }

  return (
    <Card>
      <CardHeader className="border-b bg-muted/20">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-teal-700 dark:text-teal-400">{CLINIC_INFO.name.toUpperCase()}</CardTitle>
            <p className="text-sm font-semibold mt-1">{selectedDoctor?.name || DOCTOR_LETTERHEAD.name}, {DOCTOR_LETTERHEAD.qualifications}</p>
            <p className="text-xs text-muted-foreground">{selectedDoctor?.specialization || DOCTOR_LETTERHEAD.designation}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {CLINIC_INFO.address} {CLINIC_INFO.landmark && `(${CLINIC_INFO.landmark})`}
              <br />
              Phone: +91 {CLINIC_INFO.phone} | Email: {CLINIC_INFO.email}
            </p>
          </div>
          <div className="text-right text-2xl font-bold text-teal-700 dark:text-teal-400">℞</div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Doctor</Label>
            <Select items={Object.fromEntries(doctors.map((d) => [d.id, d.name]))} value={doctorId} onValueChange={(v) => setDoctorId(v ?? "")}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {doctors.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rx-weight">Weight (kg)</Label>
            <Input id="rx-weight" value={weightAtVisit} onChange={(e) => setWeightAtVisit(e.target.value)} placeholder="e.g. 65kg" />
          </div>
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <strong>Patient:</strong> {patient.name} &nbsp;|&nbsp; <strong>UHID:</strong> {patient.uhid}
          {patient.age != null && <> &nbsp;|&nbsp; <strong>Age:</strong> {patient.age}</>}
          {patient.gender && <> &nbsp;|&nbsp; <strong>Gender:</strong> {patient.gender}</>}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rx-diagnosis">Complaint / Diagnosis</Label>
          <Input id="rx-diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder="e.g. Skin (face) - pigmentation" />
        </div>

        <div className="space-y-3">
          <Label>Medicines</Label>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                <Input
                  placeholder="Medicine name"
                  value={item.medicineName}
                  onChange={(e) => updateItem(index, "medicineName", e.target.value)}
                  className="col-span-2 sm:col-span-2"
                />
                <Input placeholder="Dosage form" value={item.dosage ?? ""} onChange={(e) => updateItem(index, "dosage", e.target.value)} />
                <Input placeholder="Frequency e.g. 1-0-1" value={item.frequency ?? ""} onChange={(e) => updateItem(index, "frequency", e.target.value)} />
                <Input placeholder="Duration" value={item.duration ?? ""} onChange={(e) => updateItem(index, "duration", e.target.value)} />
                <Input
                  placeholder="Timing / instructions (e.g. A/F, B/F, SOS)"
                  value={item.instructions ?? ""}
                  onChange={(e) => updateItem(index, "instructions", e.target.value)}
                  className="col-span-2 sm:col-span-5"
                />
              </div>
              <Button type="button" size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeRow(index)} disabled={items.length === 1}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addRow}>
            <Plus className="h-3.5 w-3.5" />
            Add Medicine
          </Button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rx-advice">Advice</Label>
          <Textarea id="rx-advice" value={advice} onChange={(e) => setAdvice(e.target.value)} rows={3} placeholder="Free-text advice, procedures, tests to do, etc." />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="rx-review">Review after</Label>
            <Input id="rx-review" value={reviewAfter} onChange={(e) => setReviewAfter(e.target.value)} placeholder="e.g. 2 weeks" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rx-notes">Additional notes</Label>
            <Input id="rx-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-2 border-t">
          <Button type="button" variant="outline" className="gap-1.5" onClick={handlePrint}>
            <Printer className="h-4 w-4" />
            Print / Export PDF
          </Button>
          <Button type="button" variant="outline" className="gap-1.5" disabled={pending || sending} onClick={handleSend}>
            <Send className="h-4 w-4" />
            {sending ? "Sending…" : "Save & Send to Patient"}
          </Button>
          <Button type="button" className="gap-1.5" disabled={pending} onClick={handleSave}>
            {pending ? "Saving…" : "Save Prescription"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function ScannedUpload({ patient, defaultDoctorId }: { patient: PatientInfo; defaultDoctorId: string }) {
  const router = useRouter()
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()
  const [fileInfo, setFileInfo] = useState<{ url: string; type: string; name: string } | null>(null)
  const [notes, setNotes] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFile(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const result = await uploadFile(fd)
      setFileInfo({ url: result.url, type: result.type, name: file.name })
    } catch {
      toast.error("Upload failed")
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit() {
    if (!fileInfo) {
      toast.error("Choose a file to upload first")
      return
    }
    startTransition(async () => {
      try {
        const doc = await addDocument(patient.id, {
          title: `Prescription — ${new Date().toLocaleDateString()}`,
          category: "PRESCRIPTION",
          fileUrl: fileInfo.url,
          fileType: fileInfo.type,
        })
        const prescription = await createScannedPrescription(patient.id, defaultDoctorId, {
          documentId: doc.id,
          notes: notes || undefined,
        })
        toast.success(`Scanned prescription ${prescription.prescriptionNumber ?? ""} attached`)
        router.push(`/patients/${patient.id}?tab=prescriptions`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not attach scanned prescription")
      }
    })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Upload Scanned Prescription</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Photograph or scan the physical paper prescription and attach it as-is to {patient.name}&apos;s record.
        </p>
        <div className="space-y-1.5">
          <Label>File (image or PDF)</Label>
          <input ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
          <Button type="button" variant="outline" className="w-full gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {fileInfo ? `Selected: ${fileInfo.name}` : "Choose file"}
          </Button>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="scan-notes">Notes (optional)</Label>
          <Textarea id="scan-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </div>
        <Button type="button" className="w-full" disabled={pending || uploading || !fileInfo} onClick={handleSubmit}>
          {pending ? "Saving…" : "Attach Scanned Prescription"}
        </Button>
      </CardContent>
    </Card>
  )
}
