import { AppShell } from '../components/layout/AppShell'

export default function MainLayout({ title, subtitle, children }) {
  return <AppShell title={title} subtitle={subtitle}>{children}</AppShell>
}
