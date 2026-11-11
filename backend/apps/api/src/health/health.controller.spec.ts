import { HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import type { PrismaService } from '../database/prisma.service.js';
import { HealthController } from './health.controller.js';

function controller(healthy: boolean) {
  const prisma = { isHealthy: vi.fn().mockResolvedValue(healthy) };
  return {
    ctrl: new HealthController(prisma as unknown as PrismaService),
    prisma,
  };
}

function fakeRes() {
  return { status: vi.fn() } as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
  };
}

describe('HealthController', () => {
  it('live() reports ok without touching the database', () => {
    const { ctrl, prisma } = controller(false);
    expect(ctrl.live()).toEqual({ status: 'ok' });
    expect(prisma.isHealthy).not.toHaveBeenCalled();
  });

  it('ready() reports ok and leaves the status at 200 when the database is up', async () => {
    const { ctrl } = controller(true);
    const res = fakeRes();
    await expect(ctrl.ready(res)).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
    expect(res.status).not.toHaveBeenCalled();
  });

  it('ready() reports degraded with 503 when the database is down', async () => {
    const { ctrl } = controller(false);
    const res = fakeRes();
    await expect(ctrl.ready(res)).resolves.toEqual({
      status: 'degraded',
      database: 'down',
    });
    expect(res.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
  });

  it('is exempt from rate limiting so probes are never throttled', () => {
    const skip = new Reflector().get<boolean>(
      'THROTTLER:SKIPdefault',
      HealthController,
    );
    expect(skip).toBe(true);
  });
});
