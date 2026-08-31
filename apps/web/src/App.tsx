// Top of the component tree (rendered by main.tsx). Two jobs: `AppShell` is the page frame — a
// masthead with the app name and navigation — that wraps every page, and `<Routes>` maps URLs to
// pages: `/` is the task list, `/tasks/new` is the create-task form, anything else is the 404 page.
// react-router matches the current URL against these routes and renders whichever element matches;
// `NavLink` below is like an `<a>` but knows when its own route is active so it can style itself.
//
// The frame is built like the top of a printed sheet rather than like an app chrome bar. The reX
// wordmark keeps the ink plate structural and concentrates the violet in its one drawn glyph (see
// components/Wordmark.tsx); under it, a monospace line says plainly what the thing does. The whole
// band is closed by a single heavy rule, which is the app's one structural gesture — the same rule
// reappears under each page's title and between table rows, at decreasing weights. Using one
// gesture at three weights is what makes the app feel like one document instead of a set of
// screens.
//
// The active nav item is marked with a violet underline rather than a filled pill. A pill would be
// a small floating UI object; an underline is a printed mark on the same baseline as the word, and
// "which page am I on" is a state, which is one of the four jobs the accent plate is allowed to do.
import { NavLink, Route, Routes } from 'react-router';
import type { ReactNode } from 'react';
import CreateTaskPage from './pages/CreateTaskPage';
import NotFoundPage from './pages/NotFoundPage';
import TaskListPage from './pages/TaskListPage';
import Wordmark from './components/Wordmark';
import { microLabelClass } from './components/typeStyles';

function AppShell({ children }: { children: ReactNode }) {
  // Underline in violet when active; when not, only the word changes colour on hover, so the
  // baseline never shifts and the nav doesn't twitch as the pointer crosses it.
  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `border-b-2 pb-1 font-mono text-xs tracking-[0.08em] transition-colors ${
      isActive
        ? 'border-accent font-medium text-accent'
        : 'border-transparent text-text-muted hover:text-text'
    }`;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b-2 border-text bg-surface-raised">
        <div className="mx-auto flex max-w-5xl flex-wrap items-end justify-between gap-x-8 gap-y-4 px-4 py-5 sm:px-6">
          <div className="flex flex-col gap-1.5">
            {/* `self-start` keeps the link (and its focus ring) hugging the mark instead of
                stretching across the column, which a flex child does by default. */}
            <NavLink
              to="/"
              aria-label="reX home"
              className="self-start transition-opacity hover:opacity-70"
            >
              <Wordmark />
            </NavLink>
            {/* Descriptive, not promotional: it tells a first-time visitor what the app is for. */}
            <p className={microLabelClass}>Skill-matched work allocation</p>
          </div>
          <nav className="flex items-center gap-6">
            <NavLink to="/" end className={navLinkClass}>
              Tasks
            </NavLink>
            <NavLink to="/tasks/new" className={navLinkClass}>
              Create task
            </NavLink>
          </nav>
        </div>
      </header>
      {/* Generous vertical air: the empty paper around the content is part of the design, not
          leftover room, and it's what keeps a dense table from reading as cramped. */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
        {children}
      </main>
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
