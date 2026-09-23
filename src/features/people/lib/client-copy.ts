export function clientStatusCopy(name: string, isActive: boolean) {
  return isActive
    ? {
        title: `Deactivate ${name}?`,
        description:
          'Portal access is revoked at once — the contact loses approvals and invoices. Projects, invoices and history are untouched, and you can reactivate them any time.',
        confirmLabel: 'Deactivate',
        pendingLabel: 'Deactivating…',
        destructive: true,
      }
    : {
        title: `Reactivate ${name}?`,
        description:
          'They go back on your client list and count against your plan again. If they had portal access before, it returns with them.',
        confirmLabel: 'Reactivate',
        pendingLabel: 'Reactivating…',
        destructive: false,
      }
}
