'use client'

import { FxButton } from '@/components/shared/fx-button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Upload } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
} from 'react'
import { toast } from 'sonner'
import { uploadAvatar } from '../actions'
import { PROFILE } from '../data'
import { UserAvatar } from '@/components/shared/app/user-avatar'

const COPY = PROFILE.photo.dialog
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

const VIEWPORT = 240
const OUTPUT = 512
const MAX_ZOOM = 3

type Source = { url: string; width: number; height: number }
type Offset = { x: number; y: number }

function clampOffset(offset: Offset, width: number, height: number): Offset {
  return {
    x: Math.min(0, Math.max(VIEWPORT - width, offset.x)),
    y: Math.min(0, Math.max(VIEWPORT - height, offset.y)),
  }
}

export function AvatarUploadDialog({
  open,
  onOpenChange,
  initials,
  avatarUrl,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  initials: string
  avatarUrl: string | null
  onSaved: (avatarUrl: string) => void
}) {
  const [source, setSource] = useState<Source | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 })
  const [isDragOver, setIsDragOver] = useState(false)
  const [pending, startTransition] = useTransition()

  const inputRef = useRef<HTMLInputElement | null>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    pointerX: number
    pointerY: number
    start: Offset
  } | null>(null)

  useEffect(() => {
    if (!source) return
    return () => URL.revokeObjectURL(source.url)
  }, [source])

  const step = source ? 2 : 1

  const baseScale = source
    ? VIEWPORT / Math.min(source.width, source.height)
    : 1
  const scale = baseScale * zoom
  const displayWidth = source ? source.width * scale : 0
  const displayHeight = source ? source.height * scale : 0

  function reset() {
    setSource(null)
    setZoom(1)
    setOffset({ x: 0, y: 0 })
    setIsDragOver(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  function handleOpenChange(next: boolean) {
    if (pending) return
    if (!next) reset()
    onOpenChange(next)
  }

  function loadFile(file: File | undefined) {
    if (!file) return
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error(COPY.invalidType)
      return
    }
    if (file.size > MAX_BYTES) {
      toast.error(COPY.tooLarge)
      return
    }

    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      const cover = VIEWPORT / Math.min(image.naturalWidth, image.naturalHeight)
      const width = image.naturalWidth * cover
      const height = image.naturalHeight * cover
      setZoom(1)
      setOffset({ x: (VIEWPORT - width) / 2, y: (VIEWPORT - height) / 2 })
      setSource({ url, width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      toast.error(COPY.unreadable)
    }
    image.src = url
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragOver(false)
    loadFile(event.dataTransfer.files[0])
  }

  function changeZoom(nextZoom: number) {
    if (!source) return
    const nextScale = baseScale * nextZoom
    const centreX = (VIEWPORT / 2 - offset.x) / scale
    const centreY = (VIEWPORT / 2 - offset.y) / scale
    setZoom(nextZoom)
    setOffset(
      clampOffset(
        {
          x: VIEWPORT / 2 - centreX * nextScale,
          y: VIEWPORT / 2 - centreY * nextScale,
        },
        source.width * nextScale,
        source.height * nextScale
      )
    )
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      start: offset,
    }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = dragRef.current
    if (!drag) return
    setOffset(
      clampOffset(
        {
          x: drag.start.x + event.clientX - drag.pointerX,
          y: drag.start.y + event.clientY - drag.pointerY,
        },
        displayWidth,
        displayHeight
      )
    )
  }

  function handlePointerUp() {
    dragRef.current = null
  }

  function handleCropKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const nudge = event.shiftKey ? 20 : 5
    const moves: Record<string, Offset> = {
      ArrowLeft: { x: nudge, y: 0 },
      ArrowRight: { x: -nudge, y: 0 },
      ArrowUp: { x: 0, y: nudge },
      ArrowDown: { x: 0, y: -nudge },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setOffset(
      clampOffset(
        { x: offset.x + move.x, y: offset.y + move.y },
        displayWidth,
        displayHeight
      )
    )
  }

  function renderCrop(): Promise<Blob | null> {
    const image = imageRef.current
    if (!image) return Promise.resolve(null)

    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT
    canvas.height = OUTPUT
    const context = canvas.getContext('2d')
    if (!context) return Promise.resolve(null)

    const ratio = OUTPUT / VIEWPORT
    context.imageSmoothingQuality = 'high'
    context.drawImage(
      image,
      offset.x * ratio,
      offset.y * ratio,
      displayWidth * ratio,
      displayHeight * ratio
    )

    return new Promise((resolve) =>
      canvas.toBlob(
        (blob) => {
          if (blob?.type === 'image/webp') return resolve(blob)
          canvas.toBlob(resolve, 'image/jpeg', 0.9)
        },
        'image/webp',
        0.9
      )
    )
  }

  function handleSave() {
    startTransition(async () => {
      const blob = await renderCrop()
      if (!blob) {
        toast.error(COPY.unreadable)
        return
      }

      const formData = new FormData()
      formData.set('file', new File([blob], 'avatar.webp', { type: blob.type }))

      const result = await uploadAvatar(formData)
      if (!result.ok) {
        toast.error(result.error)
        return
      }

      toast.success(PROFILE.photo.saved)
      onSaved(result.avatarUrl)
      reset()
      onOpenChange(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden p-0 sm:max-w-110"
        showCloseButton={false}
      >
        <div className="border-border flex items-start justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0 space-y-2">
            <DialogTitle className="text-foreground text-[15.5px] font-semibold">
              {COPY.title}
            </DialogTitle>
            <DialogDescription asChild>
              <ol className="flex items-center gap-2 text-xs font-semibold">
                {COPY.steps.map((label, index) => {
                  const number = index + 1
                  const active = number === step
                  const done = number < step
                  return (
                    <li key={label} className="flex items-center gap-2">
                      {index > 0 && (
                        <span
                          aria-hidden="true"
                          className="bg-border h-px w-8"
                        />
                      )}
                      <span
                        className={cn(
                          'flex size-5 items-center justify-center rounded-full text-[11px]',
                          done
                            ? 'bg-success text-brand-white'
                            : active
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        {number}
                      </span>
                      <span
                        aria-current={active ? 'step' : undefined}
                        className={
                          active
                            ? 'text-primary-accent'
                            : 'text-muted-foreground'
                        }
                      >
                        {label}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </DialogDescription>
          </div>

          <FxButton
            type="button"
            variant="secondary"
            size="icon-sm"
            className="border-transparent hover:border-transparent"
            aria-label="Close"
            disabled={pending}
            onClick={() => handleOpenChange(false)}
          >
            <span aria-hidden="true" className="text-base leading-none">
              ×
            </span>
          </FxButton>
        </div>

        <div className="space-y-4 p-5">
          {step === 1 ? (
            <>
              <div
                onDragOver={(event) => {
                  event.preventDefault()
                  setIsDragOver(true)
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={cn(
                  'bg-muted/60 flex flex-col items-center rounded-xl border border-dashed px-6 py-10 text-center transition-colors',
                  isDragOver
                    ? 'border-primary bg-primary-subtle'
                    : 'border-border-strong'
                )}
              >
                <span className="bg-primary-subtle text-primary-accent mb-4 flex size-11 items-center justify-center rounded-full">
                  <Upload className="size-5" />
                </span>
                <p className="text-foreground text-[15px] font-semibold">
                  {COPY.dropTitle}
                </p>
                <p className="text-muted-foreground mt-2 text-sm">
                  {COPY.browsePrefix}{' '}
                  <button
                    type="button"
                    className="text-primary-accent cursor-pointer border-b border-current font-semibold"
                    onClick={() => inputRef.current?.click()}
                  >
                    {COPY.browse}
                  </button>
                </p>
                <p className="text-subtle-foreground mt-3 text-xs">
                  {PROFILE.photo.hint}
                </p>
              </div>

              <div className="border-border flex items-center gap-3 rounded-xl border p-3">
                <UserAvatar
                  initials={initials}
                  avatarUrl={avatarUrl}
                  className="size-10 text-sm"
                />
                <p className="text-muted-foreground text-[13px]">
                  {COPY.current}
                </p>
              </div>
            </>
          ) : (
            source && (
              <div className="flex flex-col items-center gap-4">
                <div
                  role="img"
                  aria-label={COPY.cropHint}
                  tabIndex={0}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onKeyDown={handleCropKeyDown}
                  className="bg-muted focus-visible:ring-ring relative cursor-grab touch-none overflow-hidden rounded-full outline-none select-none focus-visible:ring-2 active:cursor-grabbing"
                  style={{ width: VIEWPORT, height: VIEWPORT }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, not an optimisable asset */}
                  <img
                    ref={imageRef}
                    src={source.url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none absolute max-w-none"
                    style={{
                      left: offset.x,
                      top: offset.y,
                      width: displayWidth,
                      height: displayHeight,
                    }}
                  />
                </div>

                <p className="text-subtle-foreground text-xs">
                  {COPY.cropHint}
                </p>

                <label className="flex w-full max-w-60 items-center gap-3 text-xs font-semibold">
                  <span className="text-muted-foreground">{COPY.zoom}</span>
                  <input
                    type="range"
                    min={1}
                    max={MAX_ZOOM}
                    step={0.01}
                    value={zoom}
                    onChange={(event) => changeZoom(Number(event.target.value))}
                    className="accent-primary w-full cursor-pointer"
                  />
                </label>
              </div>
            )
          )}

          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(event) => loadFile(event.target.files?.[0])}
          />
        </div>

        <div className="border-border flex items-center justify-end gap-2 border-t px-5 py-4">
          {step === 1 ? (
            <>
              <FxButton
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => handleOpenChange(false)}
              >
                {COPY.cancel}
              </FxButton>
              <FxButton
                type="button"
                size="lg"
                onClick={() => inputRef.current?.click()}
              >
                {COPY.choose}
              </FxButton>
            </>
          ) : (
            <>
              <FxButton
                type="button"
                variant="secondary"
                size="lg"
                disabled={pending}
                onClick={reset}
              >
                {COPY.back}
              </FxButton>
              <FxButton
                type="button"
                size="lg"
                disabled={pending}
                onClick={handleSave}
              >
                {pending ? COPY.saving : COPY.save}
              </FxButton>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
