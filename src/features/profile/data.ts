export const PROFILE = {
  back: { label: 'Back to dashboard', href: '/' },
  title: 'Profile',
  subtitle: 'Your account details for this workspace.',
  fields: { name: 'Full name', email: 'Email', role: 'Role' },
  managed:
    'Managed by your workspace admin — contact them to change your email or role.',
  signOut: 'Sign out',
  changePassword: 'Change password',
  passwordHref: 'profile/password',
  edit: {
    start: 'Edit name',
    save: 'Save name',
    cancel: 'Cancel editing',
  },
  saved: 'Name updated.',
  noName: 'Not set',
} as const
