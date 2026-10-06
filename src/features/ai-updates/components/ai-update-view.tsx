'use client'

import { Copy, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { FxButton } from '@/components/shared/fx-button'
import { FxTextarea } from '@/components/shared/fx-textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { initialsOf } from '@/lib/initials'
import { cn } from '@/lib/utils'

import {
  buildMockDraft,
  type AiUpdateSections,
  type AiUpdateTone,
} from '../lib/draft'
import type { AiUpdateProject } from '../mock-data'

// MOCK - how long "drafting" takes. With a real model this is the request itself.
const MOCK_DRAFT_MS = 1400

const TONES: { id: AiUpdateTone; label: string }[] = [
  { id: 'professional', label: 'Professional' },
  { id: 'warm', label: 'Warm' },
  { id: 'brief', label: 'Brief' },
]

const SECTIONS: { id: keyof AiUpdateSections; label: string }[] = [
  { id: 'progress', label: 'Progress this week' },
  { id: 'milestones', label: 'Milestone status' },
  { id: 'approvals', label: 'Pending approvals' },
]

const SECTION_LABEL =
  'text-muted-foreground text-[11px] font-semibold tracking-wider uppercase'

interface Draft {
  text: string
  /** What it was generated from, to tell when the settings have moved on since. */
  key: string
  projectName: string
  activityCount: number
  tone: AiUpdateTone
}

function ProjectAvatar({ project }: { project: AiUpdateProject }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white',
        project.avatarClass
      )}
    >
      {initialsOf(project.name, null)}
    </span>
  )
}

export function AiUpdateView({ projects }: { projects: AiUpdateProject[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? '')
  const [tone, setTone] = useState<AiUpdateTone>('professional')
  const [include, setInclude] = useState<AiUpdateSections>({
    progress: true,
    milestones: true,
    approvals: true,
  })
  const [draft, setDraft] = useState<Draft | null>(null)
  const [isDrafting, setIsDrafting] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  const project = projects.find((p) => p.id === projectId) ?? projects[0]
  const nothingIncluded =
    !include.progress && !include.milestones && !include.approvals
  const settingsKey = `${projectId}|${tone}|${include.progress}|${include.milestones}|${include.approvals}`
  const isStale = draft !== null && draft.key !== settingsKey

  const generate = () => {
    if (!project || nothingIncluded) return
    setIsDrafting(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      setDraft({
        text: buildMockDraft(project, tone, include),
        key: settingsKey,
        projectName: project.name,
        activityCount: project.activityCount,
        tone,
      })
      setIsDrafting(false)
    }, MOCK_DRAFT_MS)
  }

  const copy = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft.text)
      toast.success('Draft copied')
    } catch {
      toast.error('Could not copy - select the text and copy it instead.')
    }
  }

  if (!project) {
    return (
      <p className="text-muted-foreground text-sm">
        There are no projects to write an update for yet.
      </p>
    )
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="bg-primary-subtle text-primary mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg"
        >
          <Sparkles className="size-4.5" />
        </span>
        <div className="space-y-1">
          <h1 className="text-foreground text-2xl font-bold tracking-tight">
            AI weekly update
          </h1>
          <p className="text-muted-foreground text-[13px]">
            Draft a client-ready status summary from recent activity - you stay
            in control.
          </p>
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,8fr)] lg:items-start">
        {/* Settings */}
        <section
          aria-label="Draft settings"
          className="bg-card border-border space-y-5 rounded-xl border p-4 shadow-xs"
        >
          <div className="space-y-2">
            <p className={SECTION_LABEL} id="ai-project-label">
              Project
            </p>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger
                aria-labelledby="ai-project-label"
                className="bg-card h-11! w-full cursor-pointer text-[13px] font-medium"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={6} className="p-1">
                {projects.map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id}
                    className="cursor-pointer p-2 text-[13px]"
                  >
                    <span className="flex items-center gap-2">
                      <ProjectAvatar project={p} />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <p className={SECTION_LABEL} id="ai-tone-label">
              Tone
            </p>
            <div
              role="radiogroup"
              aria-labelledby="ai-tone-label"
              className="grid grid-cols-3 gap-1.5"
            >
              {TONES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={tone === t.id}
                  onClick={() => setTone(t.id)}
                  className={cn(
                    'border-border bg-muted/50 text-muted-foreground hover:text-foreground cursor-pointer rounded-md border px-2 py-2 text-[12.5px] transition-colors',
                    tone === t.id &&
                      'border-primary bg-primary-subtle text-primary font-semibold'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <fieldset className="space-y-2.5">
            <legend className={cn(SECTION_LABEL, 'mb-2')}>Include</legend>
            {SECTIONS.map((section) => (
              <label
                key={section.id}
                className="text-foreground flex cursor-pointer items-center gap-2.5 text-[13px]"
              >
                <Checkbox
                  checked={include[section.id]}
                  onCheckedChange={(checked) =>
                    setInclude((prev) => ({
                      ...prev,
                      [section.id]: checked === true,
                    }))
                  }
                />
                {section.label}
              </label>
            ))}
          </fieldset>

          <div className="space-y-2">
            <FxButton
              type="button"
              className="h-10 w-full gap-1.5"
              disabled={isDrafting || nothingIncluded}
              onClick={generate}
            >
              {isDrafting ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
              {isDrafting
                ? 'Drafting...'
                : draft
                  ? 'Regenerate draft'
                  : 'Generate draft'}
            </FxButton>
            {nothingIncluded && (
              <p className="text-muted-foreground text-[11.5px]">
                Choose at least one section to include.
              </p>
            )}
          </div>
        </section>
        {/* Preview */}
        <section
          aria-labelledby="ai-preview-heading"
          className="bg-card border-border flex min-h-96 flex-col overflow-hidden rounded-xl border shadow-xs"
        >
          <header className="border-border flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
            <h2
              id="ai-preview-heading"
              className="text-foreground flex items-center gap-2 text-[13.5px] font-semibold"
            >
              <span
                aria-hidden="true"
                className="bg-primary size-2 rounded-full"
              />
              Draft preview
            </h2>
            <p className="text-muted-foreground text-[11.5px]">
              Human-in-the-loop · editable before sending
            </p>
          </header>

          {isDrafting ? (
            <div
              role="status"
              aria-live="polite"
              className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-12 text-center"
            >
              <Loader2 className="text-primary size-6 animate-spin" />
              <p className="text-muted-foreground text-[13px]">
                Drafting from {project.name}&rsquo;s recent activity...
              </p>
            </div>
          ) : draft ? (
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-[12px]">
                  {draft.projectName} · built from {draft.activityCount}{' '}
                  activity entries ·{' '}
                  {TONES.find((t) => t.id === draft.tone)?.label} tone
                </p>
                {isStale && (
                  <p className="text-warning text-[12px] font-medium">
                    Settings changed - regenerate to apply them
                  </p>
                )}
              </div>
              <FxTextarea
                aria-label="Draft update"
                value={draft.text}
                onChange={(e) =>
                  setDraft((prev) =>
                    prev ? { ...prev, text: e.target.value } : prev
                  )
                }
                className="min-h-80 flex-1 resize-y font-sans text-[13px] leading-relaxed"
              />
              <div className="flex flex-wrap items-center justify-end gap-2">
                <FxButton
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={generate}
                  disabled={nothingIncluded}
                >
                  <RefreshCw className="size-3.5" />
                  Regenerate
                </FxButton>
                <FxButton
                  type="button"
                  variant="outline"
                  className="gap-1.5"
                  onClick={copy}
                >
                  <Copy className="size-3.5" />
                  Copy
                </FxButton>
                <FxButton
                  type="button"
                  // MOCK - posting to the project's Updates comes with the real data.
                  onClick={() =>
                    toast.info(
                      'Posting updates is not connected yet - copy the draft for now.'
                    )
                  }
                >
                  Post update
                </FxButton>
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
              <span
                aria-hidden="true"
                className="bg-muted text-muted-foreground mb-3 flex size-11 items-center justify-center rounded-xl"
              >
                <Sparkles className="size-4.5" />
              </span>
              <p className="text-foreground text-[14px] font-semibold">
                No draft yet
              </p>
              <p className="text-muted-foreground mt-1 max-w-64 text-[12.5px] leading-relaxed">
                Choose what to include and hit{' '}
                <span className="text-foreground font-semibold">
                  Generate draft
                </span>
                . Foxy summarizes this project&rsquo;s recent activity into a
                client update.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
