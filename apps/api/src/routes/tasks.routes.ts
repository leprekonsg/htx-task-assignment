/** /api/tasks — list, get a subtree, create (optionally a whole tree), and update status/assignee. */
import {
  CreateTaskRequestSchema,
  ErrorResponseSchema,
  TaskSchema,
  UpdateTaskRequestSchema,
} from '@htx/shared';
import { z } from 'zod';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import type { TasksService } from '../modules/tasks/tasks.service.js';

const ParamsSchema = z.object({ id: z.coerce.number().int().positive() });

export function tasksRoutes(tasksService: TasksService): FastifyPluginAsyncZod {
  return async (app) => {
    app.get(
      '/tasks',
      {
        schema: {
          tags: ['tasks'],
          summary: 'List root tasks with nested subtasks',
          response: { 200: z.array(TaskSchema) },
        },
      },
      async () => tasksService.list(),
    );

    app.get(
      '/tasks/:id',
      {
        schema: {
          tags: ['tasks'],
          summary: 'Get a task and its subtree',
          params: ParamsSchema,
          response: { 200: TaskSchema, 404: ErrorResponseSchema },
        },
      },
      async (request) => tasksService.get(request.params.id),
    );

    app.post(
      '/tasks',
      {
        schema: {
          tags: ['tasks'],
          summary: 'Create a task, or a whole tree of tasks',
          body: CreateTaskRequestSchema,
          response: {
            201: TaskSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request, reply) => {
        const task = await tasksService.create(request.body);
        reply.status(201);
        return task;
      },
    );

    app.patch(
      '/tasks/:id',
      {
        schema: {
          tags: ['tasks'],
          summary: 'Update a task status and/or assignee',
          params: ParamsSchema,
          body: UpdateTaskRequestSchema,
          response: {
            200: TaskSchema,
            400: ErrorResponseSchema,
            404: ErrorResponseSchema,
            409: ErrorResponseSchema,
          },
        },
      },
      async (request) => tasksService.update(request.params.id, request.body),
    );
  };
}
