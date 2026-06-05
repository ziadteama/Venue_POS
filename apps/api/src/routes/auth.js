import { z } from 'zod';
import { loginManager, loginCashier } from '../services/auth-service.js';
import { validationError } from '../utils/errors.js';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const pinSchema = z.object({
  pin: z.string().min(4).max(6),
});

export async function authRoutes(app) {
  app.post('/api/v1/auth/login', async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    const result = await loginManager(parsed.data.username, parsed.data.password);
    return reply.send(result);
  });

  app.post('/api/v1/auth/pin', async (request, reply) => {
    const parsed = pinSchema.safeParse(request.body);
    if (!parsed.success) throw validationError('Invalid request', parsed.error.flatten());

    const terminalId = request.headers['x-terminal-id'];
    const terminalSecret = request.headers['x-terminal-secret'];
    const result = await loginCashier(parsed.data.pin, terminalId, terminalSecret);
    return reply.send(result);
  });

  app.post('/api/v1/auth/logout', async (_, reply) => {
    return reply.status(204).send();
  });
}
