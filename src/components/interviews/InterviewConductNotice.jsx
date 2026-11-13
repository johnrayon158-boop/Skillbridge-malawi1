export function InterviewConductNotice({ audience = 'student' }) {
  const isEmployer = audience === 'employer'

  return (
    <aside className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">
      <p className="font-semibold">{isEmployer ? 'Interview conduct and privacy' : 'Your safety and privacy'}</p>
      <p className="mt-1">
        {isEmployer
          ? 'Keep questions and instructions relevant to the role. Do not request passwords, PINs, financial account details, or unrelated sensitive information.'
          : 'Interview notes and meeting details are supplied by the employer; they are not SkillBridge policies. You are not expected to share passwords, PINs, financial account details, or unrelated sensitive information.'}
      </p>
      <p className="mt-1">
        {isEmployer
          ? 'Students can report inappropriate instructions to the SkillBridge team.'
          : 'Keep the conversation job-related. Use “Report instructions” on an interview if you see discriminatory, invasive, unsafe, or otherwise inappropriate instructions.'}
      </p>
    </aside>
  )
}
