'use client'

import { FxButton } from '@/components/shared/fx-button'
import { FxTextarea } from '@/components/shared/fx-textarea'
import { Sparkles } from 'lucide-react'
import Form from 'next/form'
import Image from 'next/image'
import { useState } from 'react'
import { toast } from 'sonner'

interface CreateUpdateInputProps {
  userInitials?: string
  userAvatarUrl?: string | null
  onSubmit?: (updateText: string) => Promise<void> | void
  onDraftWithAi?: () => void
  isSubmitting?: boolean
}

export function UpdatesInput({
  userInitials = 'SR',
  userAvatarUrl,
  onSubmit,
  onDraftWithAi,
  isSubmitting = false,
}: CreateUpdateInputProps) {
  const [updateText, setUpdateText] = useState('')

  const isInputEmpty = !updateText.trim()

  const handleAction = async () => {
    if (isInputEmpty || isSubmitting) return

    try {
      await onSubmit?.(updateText.trim())
      setUpdateText('')
      toast.success('Update posted successfully!')
    } catch {
      toast.error('Failed to post update. Please try again.')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      if (!isInputEmpty && !isSubmitting) {
        handleAction()
      }
    }
  }

  return (
    <section
      aria-labelledby="post-update-heading"
      className="bg-card border-border overflow-hidden rounded-xl border shadow-xs"
    >
      {/* Semantic Section Header */}
      <header className="border-border border-b px-5 py-4">
        <h2
          id="post-update-heading"
          className="text-foreground text-[14px] font-bold"
        >
          Post update
        </h2>
      </header>

      {/* Main Form Body */}
      <Form action={handleAction} className="p-6">
        <div className="flex items-start gap-3">
          {/* User Avatar / Initials Badge */}
          {userAvatarUrl ? (
            <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full">
              <Image
                src={userAvatarUrl}
                alt="User Avatar"
                fill
                sizes="32px"
                className="object-cover"
              />
            </div>
          ) : (
            <div className="bg-warning/90 text-primary-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold select-none">
              {userInitials}
            </div>
          )}

          {/* Update Textarea */}
          <div className="flex-1">
            <FxTextarea
              name="update"
              value={updateText}
              onChange={(e) => setUpdateText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Post an update for the client..."
              disabled={isSubmitting}
              rows={3}
              className="bg-muted/40 border-border/60 text-foreground placeholder:text-muted-foreground w-full rounded-lg text-sm transition-colors focus-visible:bg-transparent"
            />
          </div>
        </div>

        {/* Semantic Action Controls Container */}
        <footer className="mt-3 flex items-center justify-end gap-2">
          <FxButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onDraftWithAi}
            disabled={isSubmitting}
            className="text-card-foreground border-border hover:bg-card hover:text-accent-foreground flex h-auto justify-center gap-1.5 px-3 py-2 text-center text-[13px] font-medium whitespace-normal sm:h-9 sm:whitespace-nowrap"
          >
            <Sparkles className="h-3.5 w-3.5 fill-amber-500/20 text-amber-500" />
            Draft with AI
          </FxButton>

          <FxButton
            type="submit"
            size="sm"
            disabled={isInputEmpty || isSubmitting}
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-auto justify-center px-3 py-3 text-center text-[13px] font-semibold whitespace-normal sm:h-9 sm:whitespace-nowrap"
            variant="default"
          >
            {isSubmitting ? 'Posting...' : 'Post'}
          </FxButton>
        </footer>
      </Form>
    </section>
  )
}
