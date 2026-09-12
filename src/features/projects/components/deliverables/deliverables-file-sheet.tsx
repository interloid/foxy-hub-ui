'use client'

import { FxBadge } from '@/components/shared/fx-badge'
import { FxButton } from '@/components/shared/fx-button'
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
import { format } from 'date-fns'
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
import { uploadDeliveryAssets } from '../../actions'
import type { ProjectDelivery } from '../../types'

const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'csv',
  'ppt',
  'pptx',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'svg',
  'zip',
]

const MIN_FILE_SIZE = 1024 // 1 KB
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MB
const MAX_FILE_COUNT = 3 // Limited to 3 files

interface DeliverableFileSheetProps {
  delivery: ProjectDelivery | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmitForApproval?: (deliveryId: string) => void
  onViewFile?: (filePath: string) => void
  onDownloadFile?: (filePath: string) => void
  onSuccessUpload?: () => void
}

export function DeliverableFileSheet({
  delivery,
  open,
  onOpenChange,
  onSubmitForApproval,
  onViewFile,
  onDownloadFile,
  onSuccessUpload,
}: DeliverableFileSheetProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { orgSlug } = useWorkspace()

  if (!delivery) return null

  const isPending = delivery.status === 'pending'
  const isApproved = delivery.status === 'approved'
  // Extract file name from path
  const getFileName = (path: string) => {
    return path.split('/').pop() || path
  }

  const validateAndAddFiles = (files: FileList | File[]) => {
    setErrorMessage(null)
    const incomingFiles = Array.from(files)

    // Check Max File Limit (Max 3 files)
    if (selectedFiles.length + incomingFiles.length > MAX_FILE_COUNT) {
      setErrorMessage(
        `Maximum limit reached. You can only attach up to ${MAX_FILE_COUNT} files.`
      )
      return
    }

    const validFiles: File[] = []

    for (const file of incomingFiles) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''

      // Extension Check
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        setErrorMessage(
          `"${file.name}" has an invalid extension. Allowed formats: ${ALLOWED_EXTENSIONS.join(', ').toUpperCase()}`
        )
        return
      }

      // Size Check (1 KB to 5 MB)
      if (file.size < MIN_FILE_SIZE) {
        setErrorMessage(
          `"${file.name}" is too small (${(file.size / 1024).toFixed(1)} KB). Minimum file size is 1 KB.`
        )
        return
      }

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

  // Handle Upload Button Click
  const handleUpload = async () => {
    if (!delivery || selectedFiles.length === 0) return

    setIsUploading(true)
    setErrorMessage(null)

    try {
      await uploadDeliveryAssets(
        delivery.projectId,
        delivery.id,
        selectedFiles,
        orgSlug
      )
      setSelectedFiles([])
      onSuccessUpload?.()
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

        {/* Scrollable Body */}
        <FxSheetBody className="space-y-6">
          {/* Details Metadata */}
          <div className="space-y-3.5 text-xs">
            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">Status</span>
              <StatusBadge status={delivery.status} />
            </div>

            <div className="border-border border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Description
              </span>
              <p className="text-foreground mt-1 leading-relaxed">
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
                {delivery.dueDate ? formatDate(delivery.dueDate) : '—'}
              </span>
            </div>

            <div className="border-border flex items-center justify-between border-b pb-3">
              <span className="text-muted-foreground font-medium">
                Uploaded Date
              </span>
              <span className="text-foreground font-medium">
                {formatDate(delivery.createdAt)}
              </span>
            </div>

            {isApproved && (
              <div className="border-border flex items-center justify-between border-b pb-3">
                <span className="text-muted-foreground font-medium">
                  Approved At
                </span>
                <span className="text-success font-medium">
                  {delivery.approvedAt ? formatDate(delivery.approvedAt) : '—'}
                </span>
              </div>
            )}
          </div>

          {/* Attached Assets Section */}
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
                          className="border-border-strong text-foreground hover:bg-muted h-7 bg-transparent text-xs font-medium"
                        >
                          <Eye className="text-muted-foreground mr-1 hidden size-3 md:block" />
                          View
                        </FxButton>

                        <FxButton
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => onDownloadFile?.(path)}
                          className="border-border-strong text-foreground hover:bg-muted h-7 bg-transparent text-xs font-medium"
                        >
                          <Download className="text-muted-foreground mr-1 hidden size-3 md:block" />
                          Download
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
              {selectedFiles.length < MAX_FILE_COUNT && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-border bg-muted/40 hover:border-muted-foreground/50 hover:bg-muted/70 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-5 text-center transition-colors"
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.svg,.zip"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <div className="bg-muted text-muted-foreground rounded-full p-2">
                    <Upload className="size-4" />
                  </div>
                  <div>
                    <p className="text-foreground text-xs font-medium">
                      Click to attach or drag & drop files
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      PDF, Office, Images, ZIP • 1 KB to 5 MB • Up to 3 files
                    </p>
                  </div>
                </div>
              )}

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

                    {/* Upload Button */}
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
                        <Trash2 className="size-3.5" />
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
          {isPending ? (
            <FxButton
              type="button"
              variant="default"
              onClick={() => onSubmitForApproval?.(delivery.id)}
            >
              <CheckCircle2 className="mr-2 size-4" />
              Submit for Approval
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

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'MMM d, yyyy')
  } catch {
    return '—'
  }
}
