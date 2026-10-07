import Fastify, { type FastifyInstance } from 'fastify';
import { config } from './config.js';

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: { level: config.NODE_ENV === 'test' ? 'silent' : 'info' } });

  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'activityops-api',
    // Integration state is deliberately separate from readiness (spec sec. 10/11).
    integrationState: 'HEALTHY',
  }));

  return app;
}
