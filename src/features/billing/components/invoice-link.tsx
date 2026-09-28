export function InvoiceLink({ href }: { href: string | null }) {
  if (!href) return null
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-foreground border-b border-current text-[12px] leading-tight font-semibold"
    >
      View
    </a>
  )
}
