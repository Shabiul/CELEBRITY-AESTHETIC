"use client"

import { useEffect, useMemo, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Plus, Trash2, Upload, Loader2, FileText } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PatientPicker } from "@/components/appointments/patient-picker"
import { MedicinePicker } from "@/components/billing/medicine-picker"
import { formatCurrency } from "@/lib/format"
import { createBill } from "@/actions/billing"
import { getPatientInsurances, addDocument } from "@/actions/patients"
import { uploadFile } from "@/actions/upload"
import { compressImageClientSide } from "@/lib/client-image-compress"

type Service = { id: string; name: string; price: unknown }
type Insurance = { id: string; provider: string; policyNumber: string }
type LineItem = { description: string; quantity: string; unitPrice: string; taxRatePercent: string }

const emptyItem: LineItem = { description: "", quantity: "1", unitPrice: "", taxRatePercent: "0" }

export function BillForm({
  services,
  initialPatient,
  defaultAppointmentId,
  initialItems,
}: {
  services: Service[]
  initialPatient: { id: string; name: string; uhid: string; phone: string; insurances: Insurance[] } | null
  defaultAppointmentId?: string
  initialItems?: LineItem[]
}) {
  const router = useRouter()
  const [patientId, setPatientId] = useState(initialPatient?.id ?? "")
  const [patientInsurances, setPatientInsurances] = useState<Insurance[]>(initialPatient?.insurances ?? [])
  const [usesInsurance, setUsesInsurance] = useState(false)
  const [insuranceId, setInsuranceId] = useState("")
  const [serviceId, setServiceId] = useState("")
  const [discountAmount, setDiscountAmount] = useState("0")
  const [items, setItems] = useState<LineItem[]>(initialItems && initialItems.length > 0 ? initialItems : [{ ...emptyItem }])
  const [prescriptionFile, setPrescriptionFile] = useState<{ url: string; type: string; name: string } | null>(null)
  const [uploadingPrescription, setUploadingPrescription] = useState(false)
  const prescriptionInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  async function handlePrescriptionFile(file: File) {
    setUploadingPrescription(true)
    try {
      const compressed = await compressImageClientSide(file)
      const fd = new FormData()
      fd.set("file", compressed)
      const result = await uploadFile(fd)
      setPrescriptionFile({ url: result.url, type: result.type, name: file.name })
    } catch {
      toast.error("Prescription upload failed")
    } finally {
      setUploadingPrescription(false)
    }
  }

  useEffect(() => {
    if (!patientId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stale insurance list when the patient selection is cleared
      setPatientInsurances([])
      return
    }
    getPatientInsurances(patientId).then((list) =>
      setPatientInsurances(list.map((i) => ({ id: i.id, provider: i.provider, policyNumber: i.policyNumber })))
    )
  }, [patientId])

  function updateItem(index: number, field: keyof LineItem, value: string) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, [field]: value } : it)))
  }

  function addItem() {
    setItems((prev) => [...prev, { ...emptyItem }])
  }

  function addMedicineItem(item: { name: string; unitPrice: number | null }) {
    setItems((prev) => {
      const rest = prev.filter((it) => it.description.trim() || it.unitPrice.trim())
      return [...rest, { description: item.name, quantity: "1", unitPrice: item.unitPrice != null ? String(item.unitPrice) : "0", taxRatePercent: "0" }]
    })
  }

  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  function applyService(id: string) {
    setServiceId(id)
    const service = services.find((s) => s.id === id)
    if (!service) return
    setItems([{ description: service.name, quantity: "1", unitPrice: String(Number(service.price ?? 0)), taxRatePercent: "0" }])
  }

  const totals = useMemo(() => {
    let totalAmount = 0
    let totalTax = 0
    for (const item of items) {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unitPrice) || 0
      const taxRate = Number(item.taxRatePercent) || 0
      const amount = qty * price
      totalAmount += amount
      totalTax += amount * (taxRate / 100)
    }
    const discount = Number(discountAmount) || 0
    const netAmount = totalAmount + totalTax - discount
    return { totalAmount, totalTax, discount, netAmount: Math.max(netAmount, 0) }
  }, [items, discountAmount])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!patientId) {
      toast.error("Select a patient")
      return
    }
    const validItems = items.filter((it) => it.description.trim() && Number(it.unitPrice) > 0)
    if (validItems.length === 0) {
      toast.error("Add at least one valid line item")
      return
    }
    if (usesInsurance && !insuranceId) {
      toast.error("Select an insurance policy")
      return
    }
    if (!prescriptionFile) {
      toast.error("Prescription upload is required before creating a bill")
      return
    }

    startTransition(async () => {
      try {
        const bill = await createBill({
          patientId,
          insuranceId: usesInsurance ? insuranceId : undefined,
          appointmentId: defaultAppointmentId,
          serviceId: serviceId || undefined,
          discountAmount: Number(discountAmount) || 0,
          items: validItems.map((it) => ({
            description: it.description,
            quantity: Number(it.quantity) || 1,
            unitPrice: Number(it.unitPrice) || 0,
            taxRatePercent: Number(it.taxRatePercent) || 0,
          })),
        })

        if (prescriptionFile) {
          try {
            await addDocument(patientId, {
              title: `Prescription — Bill ${bill.billNumber}`,
              category: "PRESCRIPTION",
              fileUrl: prescriptionFile.url,
              fileType: prescriptionFile.type,
            })
          } catch {
            toast.error("Bill created, but the prescription upload failed to save. Please attach it from the patient's Documents tab.")
          }
        }

        toast.success(`Bill ${bill.billNumber} created`)
        router.push(`/billing/${bill.id}`)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not create bill")
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="text-base">Patient</CardTitle></CardHeader>
        <CardContent>
          <PatientPicker value={patientId} onChange={setPatientId} initial={initialPatient} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Service & Payer</CardTitle></CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {services.length > 0 && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Service (optional)</Label>
              <Select
                items={{ NONE: "No service", ...Object.fromEntries(services.map((s) => [s.id, `${s.name} — ${formatCurrency(Number(s.price ?? 0))}`])) }}
                value={serviceId || "NONE"}
                onValueChange={(v) => (v && v !== "NONE" ? applyService(v) : setServiceId(""))}
              >
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">No service</SelectItem>
                  {services.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name} — {formatCurrency(Number(s.price ?? 0))}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Payer</Label>
            <Select
              items={{ SELF: "Self-pay", INSURANCE: "Insurance" }}
              value={usesInsurance ? "INSURANCE" : "SELF"}
              onValueChange={(v) => setUsesInsurance(v === "INSURANCE")}
            >
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SELF">Self-pay</SelectItem>
                <SelectItem value="INSURANCE">Insurance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {usesInsurance && (
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Insurance policy</Label>
              {patientInsurances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No insurance on file for this patient.</p>
              ) : (
                <Select
                  items={Object.fromEntries(patientInsurances.map((i) => [i.id, `${i.provider} — ${i.policyNumber}`]))}
                  value={insuranceId}
                  onValueChange={(v) => setInsuranceId(v ?? "")}
                >
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select policy" /></SelectTrigger>
                  <SelectContent>
                    {patientInsurances.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.provider} — {i.policyNumber}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Line Items</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <MedicinePicker onSelect={(item) => addMedicineItem({ name: item.name, unitPrice: item.unitPrice })} />

          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-[1fr_auto] gap-2 rounded-lg border p-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Input
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateItem(index, "description", e.target.value)}
                  className="col-span-2 sm:col-span-2"
                />
                <Input
                  type="number"
                  placeholder="Qty"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, "quantity", e.target.value)}
                />
                <Input
                  type="number"
                  placeholder="Unit price"
                  value={item.unitPrice}
                  onChange={(e) => updateItem(index, "unitPrice", e.target.value)}
                />
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => removeItem(index)}
                disabled={items.length === 1}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={addItem}>
            <Plus className="h-3.5 w-3.5" />
            Add Line Item
          </Button>

          <Separator />

          <div className="flex items-center justify-between">
            <Label htmlFor="discountAmount">Discount</Label>
            <Input
              id="discountAmount"
              type="number"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(e.target.value)}
              className="w-32"
            />
          </div>

          <div className="space-y-1.5 rounded-lg bg-muted p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{formatCurrency(totals.totalAmount)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{formatCurrency(totals.totalTax)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span>-{formatCurrency(totals.discount)}</span></div>
            <Separator />
            <div className="flex justify-between font-semibold text-base"><span>Net Amount</span><span>{formatCurrency(totals.netAmount)}</span></div>
          </div>
        </CardContent>
      </Card>

      <Card className={!prescriptionFile ? "border-amber-300 dark:border-amber-900/60" : undefined}>
        <CardHeader><CardTitle className="text-base">Prescription *</CardTitle></CardHeader>
        <CardContent className="space-y-1.5">
          <input
            ref={prescriptionInputRef}
            type="file"
            accept="image/*,.pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handlePrescriptionFile(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="w-full gap-1.5 justify-start text-muted-foreground"
            onClick={() => prescriptionInputRef.current?.click()}
            disabled={uploadingPrescription}
          >
            {uploadingPrescription ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : prescriptionFile ? (
              <FileText className="h-4 w-4 text-primary" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span className="truncate">
              {prescriptionFile ? prescriptionFile.name : "Upload prescription (image or PDF) — required"}
            </span>
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Required to create a bill. Saved to the patient&apos;s Documents tab, linked to this bill.
          </p>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending || uploadingPrescription || !prescriptionFile}>{pending ? "Creating…" : "Create Bill"}</Button>
      </div>
    </form>
  )
}
