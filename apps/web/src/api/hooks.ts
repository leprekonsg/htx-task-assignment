/*
 * TanStack Query hooks: the only place components go to read or write server data. A "query"
 * (useTasks/useDevelopers/useSkills) fetches and caches data under a key; any component that calls
 * the same hook shares that cache, so we never fetch the same list twice or wire up useEffect by
 * hand. A "mutation" (useCreateTask/useUpdateTask) sends a write and, on success, invalidates the
 * ['tasks'] key — that tells Query "the tasks list may be stale," which triggers a refetch and
 * re-renders every component reading it. This is also why the Task List doesn't do optimistic
 * updates: after a PATCH, the refetched server response is simply the new truth, so a row that
 * fails just re-renders with its old (server) value.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskRequest, Developer, Skill, Task, UpdateTaskRequest } from '@htx/shared';
import { apiGet, apiPatch, apiPost } from './client';

export function useTasks() {
  return useQuery({
    queryKey: ['tasks'],
    queryFn: () => apiGet<Task[]>('/api/tasks'),
  });
}

export function useDevelopers() {
  return useQuery({
    queryKey: ['developers'],
    queryFn: () => apiGet<Developer[]>('/api/developers'),
  });
}

export function useSkills() {
  return useQuery({
    queryKey: ['skills'],
    queryFn: () => apiGet<Skill[]>('/api/skills'),
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateTaskRequest) => apiPost<Task>('/api/tasks', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: UpdateTaskRequest & { id: number }) =>
      apiPatch<Task>(`/api/tasks/${id}`, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });
}
