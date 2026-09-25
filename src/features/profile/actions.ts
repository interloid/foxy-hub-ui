'use server'

import { siteConfig } from '@/config/site'
import { verifySession } from '@/lib/dal'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { emailSchema, fullNameSchema } from './schemas'

export type ProfileResult =
  { ok: true; fullName: string } | { ok: false; error: string }

export async function updateFullName(fullName: string): Promise<ProfileResult> {
  const parsed = fullNameSchema.safeParse({ fullName })
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Check the name and try again.',
    }
  }

  const session = await verifySession()
  if (!session)
    return { ok: false, error: 'Your session expired. Sign in again.' }

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { id: session.id, full_name: parsed.data.fullName },
      { onConflict: 'id' }
    )
    .select('full_name')
    .maybeSingle()
  if (error) {
    console.error('update full name failed:', error.message)
    return { ok: false, error: 'Could not save name.' }
  }

  if (!data) {
    console.error('update full name affected no rows for user', session.id)
    return { ok: false, error: 'Could not save name.' }
  }

  revalidatePath('/', 'layout')
  return { ok: true, fullName: data.full_name ?? parsed.data.fullName }
}

export type EmailChangeResult =
  { ok: true; pendingEmail: string } | { ok: false; error: string }

const EMAIL_CHANGE_ERRORS: Record<string, string> = {
  email_exists: 'That email is already used by another account.',
  email_address_invalid: 'Enter a valid email address.',
  over_email_send_rate_limit:
    'Too many emails sent. Wait a few minutes and try again.',
}

export async function requestEmailChange(
  email: string,
  orgSlug: string
): Promise<EmailChangeResult> {
  const parsed = emailSchema.safeParse({ email })
  if (!parsed.success) {
    return {
      ok: false,
      error:
        parsed.error.issues[0]?.message ?? 'Check the email and try again.',
    }
  }

  const session = await verifySession()
  if (!session)
    return { ok: false, error: 'Your session expired. Sign in again.' }

  const nextEmail = parsed.data.email.toLowerCase()
  if (nextEmail === session.email?.toLowerCase()) {
    return { ok: false, error: 'That is already your email.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: `${siteConfig.url}/${orgSlug}/profile` }
  )

  if (error) {
    console.log(error)
    console.error('request email change failed:', error.code, error.message)
    return {
      ok: false,
      error:
        (error.code && EMAIL_CHANGE_ERRORS[error.code]) ??
        'Could not start the email change.',
    }
  }

  revalidatePath('/', 'layout')
  return { ok: true, pendingEmail: nextEmail }
}

export type AvatarResult =
  { ok: true; avatarUrl: string } | { ok: false; error: string }

const AVATAR_BUCKET = 'avatars'
const AVATAR_MAX_BYTES = 10 * 1024 * 1024
const AVATAR_TYPES: Record<string, string> = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
}

function avatarPathFromUrl(url: string | null): string | null {
  if (!url) return null
  const marker = `/object/public/${AVATAR_BUCKET}/`
  const index = url.indexOf(marker)
  return index === -1
    ? null
    : decodeURIComponent(url.slice(index + marker.length))
}

export async function uploadAvatar(formData: FormData): Promise<AvatarResult> {
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Choose an image to upload.' }
  }

  const extension = AVATAR_TYPES[file.type]
  if (!extension) {
    return { ok: false, error: 'Use a JPG, PNG or WebP image.' }
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: 'Use an image up to 10 MB.' }
  }

  const session = await verifySession()
  if (!session)
    return { ok: false, error: 'Your session expired. Sign in again.' }

  const supabase = await createClient()

  const { data: current } = await supabase
    .from('profiles')
    .select('avatar_url')
    .eq('id', session.id)
    .maybeSingle()

  // Path structure matches RLS expectations: {user_id}/{filename}
  const filePath = `${session.id}/${Date.now()}.${extension}`

  const { error: storageError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, file, {
      cacheControl: '31536000',
      contentType: file.type,
      upsert: false,
    })

  if (storageError) {
    console.error('upload avatar failed:', storageError.message)
    return { ok: false, error: 'Could not upload photo.' }
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath)

  const { error: dbError } = await supabase
    .from('profiles')
    .upsert({ id: session.id, avatar_url: publicUrl }, { onConflict: 'id' })

  if (dbError) {
    console.error('save avatar url failed:', dbError.message)
    await supabase.storage.from(AVATAR_BUCKET).remove([filePath])
    return { ok: false, error: 'Could not save photo.' }
  }

  const previousPath = avatarPathFromUrl(current?.avatar_url ?? null)
  if (previousPath && previousPath !== filePath) {
    const { error } = await supabase.storage
      .from(AVATAR_BUCKET)
      .remove([previousPath])
    if (error) console.error('remove old avatar failed:', error.message)
  }

  revalidatePath('/', 'layout')
  return { ok: true, avatarUrl: publicUrl }
}
