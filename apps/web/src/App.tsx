// Top of the component tree (rendered by main.tsx). Two jobs: `AppShell` is the page frame — a
// header with the app name and a "Create task" link — that wraps every page, and `<Routes>` maps
// URLs to pages: `/` is the task list, `/tasks/new` is the create-task form, anything else is the
// 404 page. react-router matches the current URL against these routes and renders whichever
// element matches; `NavLink` below is like an `<a>` but knows when its own route is active so it
// can style itself accordingly.
import { NavLink, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import CreateTaskPage from './pages/CreateTaskPage';
import NotFoundPage from './pages/NotFoundPage';
import TaskListPage from './pages/TaskListPage';

function AppShell({ children }: { children: ReactNode }) {
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium ${
      isActive ? 'bg-accent-soft text-accent' : 'text-text-muted hover:text-text'
    }`;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <NavLink to="/" className="text-base font-semibold text-text">
            Task Assignment
          </NavLink>
          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>
              Tasks
            </NavLink>
            <NavLink to="/tasks/new" className={navLinkClass}>
              Create task
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<TaskListPage />} />
        <Route path="/tasks/new" element={<CreateTaskPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </AppShell>
  );
}
