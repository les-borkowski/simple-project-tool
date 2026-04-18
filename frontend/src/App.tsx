import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { StoryDetailPage } from './pages/StoryDetailPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { InvitationsPage } from './pages/InvitationsPage'
import { ConfigPage } from './pages/ConfigPage'
import { NotFoundPage } from './pages/NotFoundPage'

function ProtectedLayout() {
  return (
    <AppShell>
      <ProtectedRoute />
    </AppShell>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />

          {/* Protected */}
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/projects/:id" element={<ProjectDetailPage />} />
            <Route
              path="/projects/:projectId/stories/:storyId"
              element={<StoryDetailPage />}
            />
            <Route
              path="/stories/:storyId/tasks/:taskId"
              element={<TaskDetailPage />}
            />
            <Route path="/invitations" element={<InvitationsPage />} />
            <Route path="/config" element={<ConfigPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  )
}
