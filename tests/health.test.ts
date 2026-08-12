import { createApp } from '../src/app/server.js';
import { createLogger } from '../src/app/logger.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

describe('GET /health', () => {
  it('returns 200 with service status', async () => {
    const app = createApp(createLogger('error'));

    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ok',
      service: 'supermoskitka-jarvis',
    });
  });
});
