'use client'

import { createClient } from '@/lib/supabase/client'

export function useFileActions(bucketName = 'deliverables') {
  const supabase = createClient()

  const handleViewFile = async (filePath: string) => {
    try {
      const { data, error } = await supabase.storage
        .from(bucketName)
        .createSignedUrl(filePath, 60)

      if (error) throw error
      if (data?.signedUrl) {
        window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      console.error('Error opening file:', err)
    }
  }

  const handleDownloadFile = async (filePath: string) => {
    try {
      const fileName = filePath.split('/').pop() || 'download'
      const { data, error } = await supabase.storage
        .from(bucketName)
        .download(filePath)

      if (error) throw error

      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()

      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Error downloading file:', err)
    }
  }

  return { handleViewFile, handleDownloadFile }
}
