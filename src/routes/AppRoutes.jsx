import { Suspense, lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from '../contexts/AuthContext'
import ProtectedRoute from './ProtectedRoute'
import PublicOnlyRoute from './PublicOnlyRoute'
import RoleRoute from './RoleRoute'

const LandingPage = lazy(() => import('../pages/LandingPage'))
const AboutPage = lazy(() => import('../pages/AboutPage'))
const FeaturesPage = lazy(() => import('../pages/FeaturesPage'))
const ForEmployersPage = lazy(() => import('../pages/ForEmployersPage'))
const LoginPage = lazy(() => import('../pages/auth/LoginPage'))
const RegisterPage = lazy(() => import('../pages/auth/RegisterPage'))
const ForgotPasswordPage = lazy(() => import('../pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('../pages/ResetPasswordPage'))
const StudentDashboardPage = lazy(() => import('../pages/student/StudentDashboardPage'))
const InternshipsPage = lazy(() => import('../pages/student/InternshipsPage'))
const NotificationsPage = lazy(() => import('../pages/NotificationsPage'))
const EvaluationPage = lazy(() => import('../pages/EvaluationPage'))
const CareerAssistantPage = lazy(() => import('../pages/student/CareerAssistantPage'))
const CvPortfolioAnalyzerPage = lazy(() => import('../pages/student/CvPortfolioAnalyzerPage'))
const StudentModulePage = lazy(() => import('../pages/student/StudentModulePage'))
const EmployerModulePage = lazy(() => import('../pages/employer/EmployerModulePage'))
const AdminModulePage = lazy(() => import('../pages/admin/AdminModulePage'))

const routeFallback = (
  <div className="flex min-h-[40vh] items-center justify-center text-sm font-medium text-slate-600">
    Loading SkillBridge Malawi…
  </div>
)

export default function AppRoutes() {
  return (
    <AuthProvider>
      <BrowserRouter basename={import.meta.env.BASE_URL}>
        <Suspense fallback={routeFallback}>
          <Routes>
            <Route element={<PublicOnlyRoute />}>
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/features" element={<FeaturesPage />} />
              <Route path="/for-employers" element={<ForEmployersPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Route>

          <Route element={<ProtectedRoute />}>
            <Route path="/admin" element={<RoleRoute allowedRoles={['admin']}><Navigate to="/admin/dashboard" replace /></RoleRoute>} />
            <Route path="/student/dashboard" element={<RoleRoute allowedRoles={['student']}><StudentDashboardPage /></RoleRoute>} />
            <Route path="/student/internships" element={<RoleRoute allowedRoles={['student']}><InternshipsPage /></RoleRoute>} />
            <Route path="/student/internships/:id" element={<RoleRoute allowedRoles={['student']}><InternshipsPage /></RoleRoute>} />
            <Route path="/student/profile" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="profile" /></RoleRoute>} />
            <Route path="/student/career" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="career" /></RoleRoute>} />
            <Route path="/student/career/discovery" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="career" /></RoleRoute>} />
            <Route path="/student/career/roadmap" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="career" /></RoleRoute>} />
            <Route path="/student/career/history" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="progress" /></RoleRoute>} />
            <Route path="/student/career/:id" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="career" /></RoleRoute>} />
            <Route path="/student/skills" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="skills" /></RoleRoute>} />
            <Route path="/student/skills/:id" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="skills" /></RoleRoute>} />
            <Route path="/student/skills/evidence" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="evidence" /></RoleRoute>} />
            <Route path="/student/skills/gaps" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="skills" /></RoleRoute>} />
            <Route path="/student/career/simulator" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="simulator" /></RoleRoute>} />
            <Route path="/student/skills/gaps/:id" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="skills" /></RoleRoute>} />
            <Route path="/student/assessments" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/student/assessments/:id/results" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/student/assessments/:id" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/student/learning" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="learning" /></RoleRoute>} />
            <Route path="/student/learning/path" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="learning" /></RoleRoute>} />
            <Route path="/student/jobs" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="jobs" /></RoleRoute>} />
            <Route path="/student/jobs/:id/readiness" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="readiness" /></RoleRoute>} />
            <Route path="/student/jobs/:id" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="jobs" /></RoleRoute>} />
            <Route path="/student/career-assistant" element={<RoleRoute allowedRoles={['student']}><CareerAssistantPage /></RoleRoute>} />
            <Route path="/student/cv-analyzer" element={<RoleRoute allowedRoles={['student', 'graduate']}><CvPortfolioAnalyzerPage /></RoleRoute>} />
            <Route path="/student/career/market" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="market" /></RoleRoute>} />
            <Route path="/student/skills/demand" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="demand" /></RoleRoute>} />
            <Route path="/student/applications" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="applications" /></RoleRoute>} />
            <Route path="/student/applications/:id" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="applications" /></RoleRoute>} />
            <Route path="/student/interviews" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="interviews" /></RoleRoute>} />
            <Route path="/student/portfolio" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="portfolio" /></RoleRoute>} />
            <Route path="/student/readiness" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="readiness" /></RoleRoute>} />
            <Route path="/student/progress" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="progress" /></RoleRoute>} />
            <Route path="/student/interview-prep" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="interview-prep" /></RoleRoute>} />
            <Route path="/student/employment" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="employment" /></RoleRoute>} />
            <Route path="/student/notifications" element={<RoleRoute allowedRoles={['student', 'graduate']}><NotificationsPage /></RoleRoute>} />
            <Route path="/evaluation" element={<RoleRoute allowedRoles={['student', 'graduate', 'employer']}><EvaluationPage /></RoleRoute>} />
            <Route path="/student/settings" element={<RoleRoute allowedRoles={['student']}><StudentModulePage mode="settings" /></RoleRoute>} />
            <Route path="/student/feedback" element={<RoleRoute allowedRoles={['student', 'graduate']}><StudentModulePage mode="feedback" /></RoleRoute>} />

            <Route path="/employer/dashboard" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="dashboard" /></RoleRoute>} />
            <Route path="/employer/notifications" element={<RoleRoute allowedRoles={['employer']}><NotificationsPage /></RoleRoute>} />
            <Route path="/employer/company" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="company" /></RoleRoute>} />
            <Route path="/employer/jobs" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobs" /></RoleRoute>} />
            <Route path="/employer/jobs/create" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobEditor" /></RoleRoute>} />
            <Route path="/employer/jobs/:id/edit" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobEditor" /></RoleRoute>} />
            <Route path="/employer/jobs/:id/skills" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobSkills" /></RoleRoute>} />
            <Route path="/employer/jobs/:id/assessment" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobEditor" /></RoleRoute>} />
            <Route path="/employer/jobs/:id" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="jobEditor" /></RoleRoute>} />
            <Route path="/employer/candidates" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="candidates" /></RoleRoute>} />
            <Route path="/employer/candidates/:id" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="candidates" /></RoleRoute>} />
            <Route path="/employer/applications" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="applications" /></RoleRoute>} />
            <Route path="/employer/applications/:id/decision" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="applications" /></RoleRoute>} />
            <Route path="/employer/applications/:id" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="applications" /></RoleRoute>} />
            <Route path="/employer/assessments" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/employer/interviews" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="interviews" /></RoleRoute>} />
            <Route path="/employer/interviews/:id" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="interviews" /></RoleRoute>} />
            <Route path="/employer/recruitment" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="recruitment" /></RoleRoute>} />
            <Route path="/employer/feedback" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="feedback" /></RoleRoute>} />
            <Route path="/employer/employees" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="employees" /></RoleRoute>} />
            <Route path="/employer/employees/:id" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="employees" /></RoleRoute>} />
            <Route path="/employer/analytics" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="analytics" /></RoleRoute>} />
            <Route path="/employer/notifications" element={<RoleRoute allowedRoles={['employer']}><NotificationsPage /></RoleRoute>} />
            <Route path="/employer/settings" element={<RoleRoute allowedRoles={['employer']}><EmployerModulePage mode="settings" /></RoleRoute>} />

            <Route path="/admin/dashboard" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="dashboard" /></RoleRoute>} />
            <Route path="/admin/notifications" element={<RoleRoute allowedRoles={['admin']}><NotificationsPage /></RoleRoute>} />
            <Route path="/admin/users" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="users" /></RoleRoute>} />
            <Route path="/admin/users/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="users" /></RoleRoute>} />
            <Route path="/admin/employers" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="employers" /></RoleRoute>} />
            <Route path="/admin/employers/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="employers" /></RoleRoute>} />
            <Route path="/admin/jobs" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="jobs" /></RoleRoute>} />
            <Route path="/admin/jobs/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="jobs" /></RoleRoute>} />
            <Route path="/admin/skills" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="skills" /></RoleRoute>} />
            <Route path="/admin/skills/create" element={<RoleRoute allowedRoles={['admin']}><Navigate to="/admin/skills" replace /></RoleRoute>} />
            <Route path="/admin/skills/:id/edit" element={<RoleRoute allowedRoles={['admin']}><Navigate to="/admin/skills" replace /></RoleRoute>} />
            <Route path="/admin/careers" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="careers" /></RoleRoute>} />
            <Route path="/admin/careers/create" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="careers" /></RoleRoute>} />
            <Route path="/admin/careers/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="careers" /></RoleRoute>} />
            <Route path="/admin/careers/:id/edit" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="careers" /></RoleRoute>} />
            <Route path="/admin/learning" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="learning" /></RoleRoute>} />
            <Route path="/admin/learning/create" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="learning" /></RoleRoute>} />
            <Route path="/admin/learning/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="learning" /></RoleRoute>} />
            <Route path="/admin/learning/:id/edit" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="learning" /></RoleRoute>} />
            <Route path="/admin/opportunities" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="opportunities" /></RoleRoute>} />
            <Route path="/admin/assessments" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/admin/assessments/create" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/admin/assessments/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/admin/assessments/:id/edit" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="assessments" /></RoleRoute>} />
            <Route path="/admin/certificates" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="certificates" /></RoleRoute>} />
            <Route path="/admin/employer-verifications" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="employer-verifications" /></RoleRoute>} />
            <Route path="/admin/interview-reports" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="interview-reports" /></RoleRoute>} />
            <Route path="/admin/applications" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="applications" /></RoleRoute>} />
            <Route path="/admin/applications/:id" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="applications" /></RoleRoute>} />
            <Route path="/admin/analytics" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="analytics" /></RoleRoute>} />
            <Route path="/admin/evaluation" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="evaluation" /></RoleRoute>} />
            <Route path="/admin/data-quality" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="data-quality" /></RoleRoute>} />
            <Route path="/admin/security" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="security" /></RoleRoute>} />
            <Route path="/admin/system-health" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="health" /></RoleRoute>} />
            <Route path="/admin/labour-market" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/skills" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/careers" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/sectors" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/jobs" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/trends" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/labour-market/reports" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="labour-market" /></RoleRoute>} />
            <Route path="/admin/ai-monitoring" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="ai" /></RoleRoute>} />
            <Route path="/admin/reports" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="reports" /></RoleRoute>} />
            <Route path="/admin/audit-logs" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="audit" /></RoleRoute>} />
            <Route path="/admin/settings" element={<RoleRoute allowedRoles={['admin']}><AdminModulePage mode="settings" /></RoleRoute>} />
          </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  )
}
