'use server'

import { revalidatePath } from 'next/cache'
import { createProjectUpdate } from './data'

export async function postUpdateAction(
  projectId: string,
  authorId: string,
  body: string
) {
  if (!body.trim()) return

  await createProjectUpdate({
    projectId,
    authorId,
    body,
  })

  revalidatePath(`/projects/${projectId}`)
}
