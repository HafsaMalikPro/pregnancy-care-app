import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types.js';

/** Calendar arithmetic independent of the API's own date code. */
export function shift(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const todayUtc = () => new Date().toISOString().slice(0, 10);

export const CONSENT = {
  purpose: 'health_data_processing',
  granted: true,
  policyVersion: '2026-10-01',
  source: 'test',
};

export const http = (app: INestApplication<App>) =>
  request(app.getHttpServer());
