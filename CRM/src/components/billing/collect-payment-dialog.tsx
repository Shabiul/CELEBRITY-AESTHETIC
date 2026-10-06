"use client"

import { useEffect, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Wallet,
  QrCode,
  Banknote,
  CreditCard,
  Building,
  CheckCircle2,
  Receipt,
  Upload,
  Loader2,
  FileText,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/format"
import { collectPayment, getPatientAdvanceBalance } from "@/actions/payments"
import { addDocument } from "@/actions/patients"
import { uploadFile } from "@/actions/upload"
import { compressImageClientSide } from "@/lib/client-image-compress"

type PaymentMethodType = "CASH" | "UPI" | "CARD" | "NET_BANKING" | "ADVANCE"

const PAYMENT_MODES: {
  id: PaymentMethodType
  label: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}[] = [
  { id: "UPI", label: "UPI / QR", icon: QrCode, description: "GPay, PhonePe, Paytm, QR" },
  { id: "CASH", label: "Cash", icon: Banknote, description: "Counter physical cash" },
  { id: "CARD", label: "Debit / Credit Card", icon: CreditCard, description: "POS terminal swipe/chip" },
  { id: "NET_BANKING", label: "Net Banking", icon: Building, description: "Direct bank transfer / NEFT" },
  { id: "ADVANCE", label: "Advance Account", icon: Wallet, description: "Patient deposit wallet" },
]

export function CollectPaymentDialog({
  billId,
  patientId,
  balanceDue,
}: {
  billId: string
  patientId: string
  balanceDue: number
}) {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState(String(balanceDue))
  const [method, setMethod] = useState<PaymentMethodType>("UPI")
  const [referenceNumber, setReferenceNumber] = useState("")
  const [cashTendered, setCashTendered] = useState("")
  const [advanceBalance, setAdvanceBalance] = useState<number | null>(null)
  const [prescriptionFile, setPrescriptionFile] = useState<{ url: string; type: string; name: string } | null>(null)
  const [uploadingPrescription, setUploadingPrescription] = useState(false)
  const prescriptionInputRef = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  useEffect(() => {
    if (!open) return
    setAmount(String(balanceDue))
    setPrescriptionFile(null)
    getPatientAdvanceBalance(patientId).then(setAdvanceBalance)
  }, [open, patientId, balanceDue])

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

  const numAmount = Number(amount) || 0
  const numTendered = Number(cashTendered) || 0
  const cashChange = Math.max(0, numTendered - numAmount)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium" onClick={() => setOpen(true)}>
        <Wallet className="h-4 w-4" />
        Collect Payment
      </Button>

      <DialogContent className="max-w-lg sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Receipt className="h-5 w-5 text-primary" />
            Collect Payment & Issue Receipt
          </DialogTitle>
          <DialogDescription>
            Select the payment mode (UPI, Cash, Card, etc.) and record the transaction.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4 pt-2"
          onSubmit={(e) => {
            e.preventDefault()
            startTransition(async () => {
              try {
                const res = await collectPayment(billId, patientId, {
                  amount: Number(amount),
                  method,
                  referenceNumber: referenceNumber.trim() || undefined,
                })

                if (prescriptionFile) {
                  try {
                    await addDocument(patientId, {
                      title: `Prescription — Receipt #${res.receiptNumber}`,
                      category: "PRESCRIPTION",
                      fileUrl: prescriptionFile.url,
                      fileType: prescriptionFile.type,
                    })
                  } catch {
                    toast.error("Payment recorded, but the prescription upload failed to save. Please attach it from the patient's Documents tab.")
                  }
                }

                toast.success(`Payment collected! Receipt #${res.receiptNumber} issued.`)
                setOpen(false)
                router.refresh()
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not collect payment")
              }
            })
          }}
        >
          {/* Outstanding Balance Banner */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/60 border">
            <div>
              <p className="text-xs text-muted-foreground">Outstanding Balance</p>
              <p className="text-lg font-bold text-foreground">{formatCurrency(balanceDue)}</p>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs h-7"
                onClick={() => setAmount(String(balanceDue))}
              >
                Full Due
              </Button>
              {balanceDue > 100 && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setAmount(String(Math.round(balanceDue / 2)))}
                >
                  50%
                </Button>
              )}
            </div>
          </div>

          {/* Payment Method Quick Selector */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Select Mode of Payment *
            </Label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {PAYMENT_MODES.map((mode) => {
                const Icon = mode.icon
                const isSelected = method === mode.id
                const isAdvanceDisabled = mode.id === "ADVANCE" && (!advanceBalance || advanceBalance <= 0)

                return (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={isAdvanceDisabled}
                    onClick={() => setMethod(mode.id)}
                    className={`flex flex-col items-start p-3 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10 ring-2 ring-primary/20 text-primary"
                        : isAdvanceDisabled
                        ? "opacity-50 cursor-not-allowed border-dashed bg-muted/20"
                        : "border-border hover:bg-muted/50 text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-1">
                      <Icon className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                      {isSelected && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                    </div>
                    <span className="text-xs font-semibold">{mode.label}</span>
                    <span className="text-[10px] text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                      {mode.id === "ADVANCE" && advanceBalance != null
                        ? `${formatCurrency(advanceBalance)} avail`
                        : mode.description}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Amount Field */}
          <div className="space-y-1.5">
            <Label htmlFor="pay-amount" className="text-xs font-medium">
              Amount to Collect (₹) *
            </Label>
            <Input
              id="pay-amount"
              type="number"
              step="0.01"
              max={balanceDue}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="text-base font-semibold"
            />
          </div>

          {/* Contextual Fields based on Selected Method */}
          {method === "UPI" && (
            <div className="space-y-1.5 p-3 rounded-lg bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/50">
              <div className="flex items-center justify-between">
                <Label htmlFor="upi-ref" className="text-xs font-semibold text-blue-900 dark:text-blue-200">
                  UPI / UTR Transaction ID (Optional)
                </Label>
                <Badge variant="outline" className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  GPay / PhonePe / Paytm
                </Badge>
              </div>
              <Input
                id="upi-ref"
                placeholder="e.g. 423982938492 or UPI Ref"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="bg-white dark:bg-background"
              />
              <p className="text-[11px] text-muted-foreground">
                Ask patient to scan the clinic counter UPI QR code and confirm receipt.
              </p>
            </div>
          )}

          {method === "CARD" && (
            <div className="space-y-1.5 p-3 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50">
              <Label htmlFor="card-ref" className="text-xs font-semibold text-indigo-900 dark:text-indigo-200">
                Card POS Approval Code / Batch Ref
              </Label>
              <Input
                id="card-ref"
                placeholder="e.g. AUTH-84929"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="bg-white dark:bg-background"
              />
            </div>
          )}

          {method === "NET_BANKING" && (
            <div className="space-y-1.5 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/50">
              <Label htmlFor="bank-ref" className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                NEFT / IMPS / Bank Reference No
              </Label>
              <Input
                id="bank-ref"
                placeholder="e.g. CMSN02938492"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                className="bg-white dark:bg-background"
              />
            </div>
          )}

          {method === "CASH" && (
            <div className="p-3 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50 space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="cash-tendered" className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                  Cash Tendered by Patient (Optional Change Calculator)
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  id="cash-tendered"
                  type="number"
                  placeholder="e.g. 500 or 1000"
                  value={cashTendered}
                  onChange={(e) => setCashTendered(e.target.value)}
                  className="bg-white dark:bg-background"
                />
                <div className="flex items-center justify-between px-3 py-2 bg-emerald-100/50 dark:bg-emerald-900/40 rounded border border-emerald-300 dark:border-emerald-800 text-xs">
                  <span className="text-muted-foreground font-medium">Return Change:</span>
                  <span className="font-bold text-emerald-800 dark:text-emerald-200">{formatCurrency(cashChange)}</span>
                </div>
              </div>
            </div>
          )}

          {method === "ADVANCE" && advanceBalance != null && (
            <div className="p-3 rounded-lg bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900/50 space-y-1 text-xs">
              <span className="font-semibold text-purple-900 dark:text-purple-200">Patient Advance Account:</span>
              <p className="text-muted-foreground">
                Current deposit balance: <strong className="text-foreground">{formatCurrency(advanceBalance)}</strong>. Deducting {formatCurrency(numAmount)} will leave {formatCurrency(Math.max(0, advanceBalance - numAmount))}.
              </p>
            </div>
          )}

          {/* Attach Prescription (Optional) */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Attach Prescription (Optional)</Label>
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
                {prescriptionFile ? prescriptionFile.name : "Upload prescription (image or PDF)"}
              </span>
            </Button>
            <p className="text-[11px] text-muted-foreground">
              Saved to the patient&apos;s Documents tab, linked to this receipt.
            </p>
          </div>

          <Button type="submit" disabled={pending || numAmount <= 0 || uploadingPrescription} className="w-full h-10 font-semibold gap-2">
            {pending ? "Recording & Generating Receipt…" : `Confirm & Collect ${formatCurrency(numAmount)} (${PAYMENT_MODES.find((m) => m.id === method)?.label})`}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
