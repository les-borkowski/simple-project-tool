import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { ThemeStyle } from './components/layout/ThemeStyle'
import { ProtectedRoute } from './components/layout/ProtectedRoute'
import { AppShell } from './components/layout/AppShell'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { StoryDetailPage } from './pages/StoryDetailPage'
import { TaskDetailPage } from './pages/TaskDetailPage'
import { BacklogPage } from './pages/BacklogPage'
import { InvitationsPage } from './pages/InvitationsPage'
import { ConfigPage } from './pages/ConfigPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { SearchResultsPage } from './pages/SearchResultsPage'

function ProtectedLayout() {
  return (
    <AppShell>
      <ProtectedRoute />
    </AppShell>
  )
}

function ThemedApp() {
  const { accent } = useTheme()
  return (
    <>
      <ThemeStyle accent={accent} />
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
            <Route
              path="/projects/:projectId/tasks/:taskId"
              element={<TaskDetailPage />}
            />
            <Route
              path="/projects/:projectId/backlog"
              element={<BacklogPage />}
            />
            <Route path="/invitations" element={<InvitationsPage />} />
            <Route path="/config" element={<ConfigPage />} />
            <Route path="/search" element={<SearchResultsPage />} />
          </Route>

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ThemedApp />
      </ToastProvider>
    </ThemeProvider>
  )
}
