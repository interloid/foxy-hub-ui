'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
import { FxInput } from '@/components/shared/fx-field'
import {
  FxSheetBody,
  FxSheetContent,
  FxSheetDescription,
  FxSheetFooter,
  FxSheetHeader,
  FxSheetTitle,
  Sheet,
} from '@/components/shared/fx-sheet'
import { useWorkspace } from '@/features/dashboard/context/workspace-context'
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Hourglass,
  Loader2,
  Paperclip,
  Send,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react'
import { ChangeEvent, DragEvent, useRef, useState } from 'react'
import { toast } from 'sonner'
import { uploadDeliveryAssets } from '../../actions'
import type { ProjectDelivery } from '../../types'
import { useFormatter } from '@/context/locale-provider'
import type { Formatter } from '@/lib/format'

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'application/zip',
  'application/x-zip-compressed',
] as const

const ALLOWED_EXTENSIONS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'pdf',
  'mp4',
  'mov',
  'zip',
]

// HTML input accept attribute
const ACCEPT_ATTRIBUTE = [
  ...ALLOWED_MIME_TYPES,
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.mov',
  '.zip',
].join(',')

const MIN_FILE_SIZE = 1024 // 1 KB
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILE_COUNT = 3 // Limited to 3 files selected at once
const MAX_TOTAL_FILES = 5

interface DeliverableFileSheetProps {
  delivery: ProjectDelivery | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitForApproval?: (deliveryId: string) => void
  /** The client's sign-off. Only ever called from the portal — see the footer. */
  onApprove?: (deliveryId: string) => void
  onViewFile?: (filePath: string) => void
  onDownloadFile?: (filePath: string) => void
  onSuccessUpload?: () => void
}

export function DeliverableFileSheet({
  delivery,
  open,
  onOpenChange,
  onSubmitForApproval,
  onApprove,
  onViewFile,
  onDownloadFile,
  onSuccessUpload,
}: DeliverableFileSheetProps) {
  const fmt = useFormatter()
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null)
  const [isApproving, setIsApproving] = useState(false)
  const { orgSlug, userRole } = useWorkspace()

  if (!delivery) return null

  const isPending = delivery.status === 'pending'
  const isApproved = delivery.status === 'approved'

  const canApprove = userRole === 'client' && delivery.status === 'submitted'

  const getFileName = (path: string) => {
    return path.split('/').pop() || path
  }

  const existingAssetsCount = delivery.assets?.length || 0

  const remainingSlots =
    MAX_TOTAL_FILES - existingAssetsCount - selectedFiles.length

  const isValidFileType = (file: File): boolean => {
    if (
      ALLOWED_MIME_TYPES.includes(
        file.type as (typeof ALLOWED_MIME_TYPES)[number]
      )
    ) {
      return true
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    return ALLOWED_EXTENSIONS.includes(ext)
  }

  const validateAndAddFiles = (files: FileList | File[]) => {
    setErrorMessage(null)
    const incomingFiles = Array.from(files)

    // Check Max File Limit
    const totalAfterAddition =
      existingAssetsCount + selectedFiles.length + incomingFiles.length

    if (totalAfterAddition > MAX_TOTAL_FILES) {
      setErrorMessage(
        `Maximum limit reached. You can only have up to ${MAX_TOTAL_FILES} total files per deliverable (${existingAssetsCount} existing, ${selectedFiles.length} selected).`
      )
      return
    }

    const validFiles: File[] = []

    for (const file of incomingFiles) {
      // 1. Format / MIME Type Check
      if (!isValidFileType(file)) {
        setErrorMessage(
          `"${file.name}" has an invalid file format. Allowed formats: PDF, Images, MP4, MOV, ZIP.`
        )
        return
      }

      // 2. Minimum Size Check (1 KB)
      if (file.size < MIN_FILE_SIZE) {
        setErrorMessage(
          `"${file.name}" is too small (${(file.size / 1024).toFixed(1)} KB). Minimum file size is 1 KB.`
        )
        return
      }

      // 3. Maximum Size Check (5 MB)
      if (file.size > MAX_FILE_SIZE) {
        setErrorMessage(
          `"${file.name}" exceeds 5 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
        )
        return
      }

      validFiles.push(file)
    }

    setSelectedFiles((prev) => [...prev, ...validFiles])
  }

  const handleDownloadClick = async (path: string) => {
    if (downloadingPath) return

    setDownloadingPath(path)
    try {
      await onDownloadFile?.(path)
    } catch (error) {
      console.error('Failed to download file:', error)
    } finally {
      setDownloadingPath(null)
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files)
      e.target.value = ''
    }
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files)
    }
  }

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index))
    setErrorMessage(null)
  }

  const handleUpload = async () => {
    if (!delivery || selectedFiles.length === 0) return

    setIsUploading(true)
    setErrorMessage(null)

    try {
      const result = await uploadDeliveryAssets(
        delivery.projectId,
        delivery.id,
        selectedFiles,
        orgSlug
      )
      if (result.ok) {
        setSelectedFiles([])
        toast.success(
          `File${selectedFiles.length > 1 ? 's' : ''} uploaded successfully`
        )

        onSuccessUpload?.()
      } else {
        setErrorMessage('Failed to upload files.')
      }
    } catch (err) {
      console.error('Failed to upload assets:', err)
      setErrorMessage('Failed to upload files. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <FxSheetContent>
        {/* Header */}
        <FxSheetHeader>
          <FxSheetTitle>{delivery.title}</FxSheetTitle>
          <FxSheetDescription>
            View deliverable details, assets, and milestone status
          </FxSheetDescription>
        </FxSheetHeader>

        <FxSheetBody className="space-y-6">
          <div className="space-y-3.5 text-xs">
            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">Status</span>
              <StatusBadge status={delivery.status} />
            </div>

            <div className="border-border border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Description
              </span>
              <p className="text-foreground mt-1 max-h-32 overflow-y-auto pr-1 text-xs leading-relaxed [overflow-wrap:anywhere] break-words">
                {delivery.description || 'No description provided.'}
              </p>
            </div>
            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Milestone
              </span>
              <span className="text-foreground font-medium">
                {delivery.milestoneTitle || 'Unassigned'}
              </span>
            </div>

            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Due Date
              </span>
              <span className="text-foreground font-medium">
                {delivery.dueDate ? formatDate(delivery.dueDate, fmt) : '—'}
              </span>
            </div>

            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Uploaded Date
              </span>
              <span className="text-foreground font-medium">
                {formatDate(delivery.createdAt, fmt)}
              </span>
            </div>

            {isApproved && (
              <div className="border-border flex items-center justify-between border-b pb-3">
                <span className="text-muted-foreground font-medium">
                  Approved At
                </span>
                <span className="text-success font-medium">
                  {delivery.approvedAt
                    ? formatDate(delivery.approvedAt, fmt)
                    : '—'}
                </span>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h4 className="text-foreground text-xs font-semibold tracking-wider uppercase">
              Attached Assets ({delivery.assets?.length || 0})
            </h4>

            <div className="space-y-2">
              {!delivery.assets || delivery.assets.length === 0 ? (
                <p className="border-border text-muted-foreground rounded-lg border border-dashed p-4 text-center text-xs">
                  No assets linked to this deliverable.
                </p>
              ) : (
                delivery.assets.map((asset) => {
                  const path =
                    'filePath' in asset
                      ? (asset as { filePath: string }).filePath
                      : (asset as { file_path: string }).file_path

                  const fileName = getFileName(path)
                  const isThisFileDownloading = downloadingPath === path
                  return (
                    <div
                      key={asset.id}
                      className="border-border bg-muted/50 flex items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2.5">
                        <FileText className="text-muted-foreground size-4 shrink-0" />
                        <span
                          className="text-foreground truncate text-xs font-medium"
                          title={fileName}
                        >
                          {fileName}
                        </span>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        <FxButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onViewFile?.(path)}
                          className="border-border-strong text-muted-foreground hover:bg-muted h-7 text-xs font-medium"
                        >
                          <Eye className="text-muted-foreground mr-1 hidden size-3 md:block" />
                          View
                        </FxButton>

                        <FxButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          disabled={isThisFileDownloading}
                          onClick={() => handleDownloadClick(path)}
                          className="border-border-strong text-muted-foreground hover:bg-muted h-7 text-xs font-medium"
                        >
                          {isThisFileDownloading ? (
                            <>
                              <Loader2 className="text-muted-foreground mr-1 size-3 animate-spin md:block" />
                              Downloading...
                            </>
                          ) : (
                            <>
                              <Download className="text-muted-foreground mr-1 hidden size-3 md:block" />
                              Download
                            </>
                          )}
                        </FxButton>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>

          {/* Upload New Files (Visible for Pending Status) */}
          {isPending && (
            <div className="space-y-3 pt-2">
              <h4 className="text-foreground text-xs font-semibold tracking-wider uppercase">
                Attach Deliverables (Max 3)
              </h4>

              {/* Dropzone Input */}
              <div
                onDragOver={(e) => {
                  if (remainingSlots > 0) e.preventDefault()
                }}
                onDrop={(e) => {
                  if (remainingSlots > 0) handleDrop(e)
                }}
                onClick={() => {
                  if (remainingSlots > 0) fileInputRef.current?.click()
                }}
                className={`border-border rounded-lg border border-dashed p-5 text-center transition-colors ${
                  remainingSlots > 0
                    ? 'bg-muted/40 hover:border-muted-foreground/50 hover:bg-muted/70 cursor-pointer'
                    : 'bg-muted/20 cursor-not-allowed opacity-60'
                }`}
              >
                <FxInput
                  ref={fileInputRef}
                  type="file"
                  multiple
                  disabled={remainingSlots <= 0}
                  accept={ACCEPT_ATTRIBUTE}
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="text-muted-foreground flex justify-center rounded-full p-2 text-center">
                  <Upload className="size-4" />
                </div>
                <div>
                  <p className="text-foreground text-xs font-medium">
                    Click to attach or drag & drop files
                  </p>
                  <p className="text-muted-foreground mt-0.5 text-[11px]">
                    PDF, Images, MP4, MOV, ZIP • 1 KB to 5 MB • Up to 5 files
                  </p>
                </div>
              </div>

              {/* Validation Error Message */}
              {errorMessage && (
                <div className="border-destructive/30 bg-destructive-subtle text-destructive flex items-center gap-2 rounded-md border p-2.5 text-xs">
                  <AlertCircle className="size-4 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Selected Files List + Upload Action */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2.5 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground text-[11px] font-medium">
                      Files Ready to Upload ({selectedFiles.length}/
                      {MAX_FILE_COUNT})
                    </span>

                    <FxButton
                      type="button"
                      size="sm"
                      disabled={isUploading}
                      onClick={handleUpload}
                      className="h-7 text-xs"
                    >
                      {isUploading ? (
                        <>
                          <Loader2 className="mr-1.5 size-3 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="mr-1.5 size-3" />
                          Upload
                        </>
                      )}
                    </FxButton>
                  </div>

                  {selectedFiles.map((file, idx) => (
                    <div
                      key={`${file.name}-${idx}`}
                      className="border-border bg-card flex items-center justify-between rounded-md border p-2.5 text-xs"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Paperclip className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="text-foreground truncate font-medium">
                          {file.name}
                        </span>
                        <span className="text-muted-foreground shrink-0 text-[10px]">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isUploading}
                        onClick={() => removeSelectedFile(idx)}
                        className="text-muted-foreground hover:text-destructive rounded p-1 disabled:opacity-50"
                      >
                        <Trash2 className="text-destructive size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </FxSheetBody>

        {/* Footer Actions */}
        <FxSheetFooter className="justify-end">
          {canApprove ? (
            <FxButton
              type="button"
              variant="default"
              disabled={isApproving}
              onClick={async () => {
                setIsApproving(true)
                try {
                  await onApprove?.(delivery.id)
                } catch (error) {
                  console.error('Failed to approve:', error)
                } finally {
                  setIsApproving(false)
                }
              }}
            >
              {isApproving ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Approving...
                </>
              ) : (
                <>
                  <Check className="mr-2 size-4" />
                  Approve
                </>
              )}
            </FxButton>
          ) : isPending ? (
            <FxButton
              type="button"
              variant="default"
              disabled={isSubmitting}
              onClick={async () => {
                setIsSubmitting(true)
                try {
                  await onSubmitForApproval?.(delivery.id)
                } catch (error) {
                  console.error('Failed to submit for approval:', error)
                } finally {
                  setIsSubmitting(false)
                }
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 size-4" />
                  Submit for Approval
                </>
              )}
            </FxButton>
          ) : (
            <FxButton
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Close
            </FxButton>
          )}
        </FxSheetFooter>
      </FxSheetContent>
    </Sheet>
  )
}

function StatusBadge({
  status,
}: {
  status: 'pending' | 'approved' | 'rejected' | 'submitted'
}) {
  switch (status) {
    case 'approved':
      return (
        <FxBadge variant="success" size="sm" shape="pill">
          <Check className="stroke-[2.5]" />
          Approved
        </FxBadge>
      )
    case 'rejected':
      return (
        <FxBadge variant="destructive" size="sm" shape="pill">
          <XCircle />
          Rejected
        </FxBadge>
      )
    case 'pending':
      return (
        <FxBadge variant="info" size="sm" shape="pill">
          <Hourglass />
          Pending
        </FxBadge>
      )
    case 'submitted':
      return (
        <FxBadge variant="warning" size="sm" shape="pill">
          <Send />
          Submitted
        </FxBadge>
      )
  }
}

function formatDate(value: string, fmt: Formatter) {
  return fmt.date(value, 'date') || '—'
}
