import type { UserRole } from '@/lib/role'

export const PROFILE = {
  back: { label: 'Back to dashboard', href: '/' },
  title: 'Profile',
  subtitle: 'Your account details for this workspace.',
  fields: { name: 'Full name', email: 'Email', role: 'Role' },
  managed: 'Managed by your workspace admin contact them to change your role.',
  signOut: 'Sign out',
  changePassword: 'Change password',
  passwordHref: 'profile/password',
  edit: {
    start: 'Edit name',
    save: 'Save name',
    cancel: 'Cancel editing',
  },
  saved: 'Name updated.',
  emailEdit: {
    start: 'Edit email',
    save: 'Send confirmation',
    cancel: 'Cancel editing',
    sent: 'Check your new inbox to confirm the change.',
    pending: (email: string) =>
      `Waiting for you to confirm ${email}. Open the link we sent to that address — your current email keeps working until then.`,
  },
  emailChangeResult: {
    done: {
      title: 'Email updated',
      body: 'Your account now uses your new email address. Use it the next time you sign in.',
    },
    failed: {
      title: 'Email not changed',
      body: 'That confirmation link has expired or was already used. Request the change again.',
    },
  },
  noName: 'Not set',
  photo: {
    label: 'Profile photo',
    upload: 'Upload photo',
    change: 'Change photo',
    hint: 'JPG, PNG or WebP · up to 10 MB',
    saved: 'Profile photo updated.',
    dialog: {
      title: 'Upload profile photo',
      steps: ['Choose image', 'Crop & save'],
      dropTitle: 'Drag & drop an image here',
      browsePrefix: 'or',
      browse: 'browse your files',
      current:
        'Current photo. After choosing, you can drag and zoom to frame it in a circle.',
      cropHint: 'Drag to reposition · use the slider to zoom',
      zoom: 'Zoom',
      cancel: 'Cancel',
      choose: 'Choose file',
      back: 'Back',
      save: 'Save photo',
      saving: 'Saving…',
      invalidType: 'Use a JPG, PNG or WebP image.',
      tooLarge: 'Use an image up to 10 MB.',
      unreadable: 'That image could not be opened. Try another file.',
    },
  },
} as const

type RoleCapability = { label: string; allowed: boolean }

export const ROLE_ACCESS = {
  description: (orgName: string) => `What this role can reach in ${orgName}.`,
  fallbackOrg: 'this workspace',
  capabilities: {
    primary_admin: [
      { label: 'Create projects, invoices and clients', allowed: true },
      { label: 'Approve timesheets and sign off weeks', allowed: true },
      { label: 'Edit pipeline stages and exit criteria', allowed: true },
      { label: 'Billing, plan and workspace settings', allowed: true },
      { label: 'Invite teammates and deactivate access', allowed: true },
      {
        label: 'Hand over primary admin',
        allowed: true,
      },
    ],
    admin: [
      { label: 'Create projects, invoices and clients', allowed: true },
      { label: 'Approve timesheets and sign off weeks', allowed: true },
      { label: 'Edit pipeline stages and exit criteria', allowed: true },
      { label: 'Billing, plan and workspace settings', allowed: true },
      {
        label: 'Invite teammates and deactivate managers and contributors',
        allowed: true,
      },
      {
        label: 'Hand over primary admin - Primary Admin only',
        allowed: false,
      },
    ],
    manager: [
      { label: 'Run the projects assigned to you, end to end', allowed: true },
      {
        label: 'Approve timesheets and sign off deliverables on them',
        allowed: true,
      },
      { label: 'Raise and send invoices for those projects', allowed: true },
      {
        label: 'See projects, invoices or clients you are not assigned to',
        allowed: false,
      },
      {
        label: 'Change workspace settings, pipeline stages, plan or access',
        allowed: false,
      },
    ],
    contributor: [
      { label: 'See only the projects you are assigned to', allowed: true },
      { label: 'Log time and submit it for approval', allowed: true },
      {
        label: 'Open milestones, updates and deliverables on those projects',
        allowed: true,
      },
      {
        label: 'See rates, project value, margin or any invoice',
        allowed: false,
      },
      {
        label:
          'Reach other projects, the pipeline, reports, people or settings',
        allowed: false,
      },
    ],
    client: [
      { label: 'See progress, updates and deliverables', allowed: true },
      { label: 'Approve or reject what you are sent', allowed: true },
      { label: 'View and pay your invoices', allowed: true },
      { label: 'See internal time, rates or margin', allowed: false },
      { label: 'Reach anything outside your own projects', allowed: false },
    ],
  } satisfies Record<UserRole, RoleCapability[]>,
}
