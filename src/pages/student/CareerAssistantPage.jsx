import { CareerAssistantWidget } from '../../components/chatbot/CareerAssistantWidget'
import { AppShell } from '../../components/layout/AppShell'

export default function CareerAssistantPage() {
  return (
    <AppShell title="Career Assistant" subtitle="Ask anything, or get personalized career guidance based on your SkillBridge profile." showBackButton>
      <div className="mx-auto max-w-5xl">
        <CareerAssistantWidget />
      </div>
    </AppShell>
  )
}
