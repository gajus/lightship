import { createLightship } from '../../../src/factories/createLightship.js';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN,
} from '../../../src/states.js';
import { type Lightship } from '../../../src/types.js';
import delay from 'delay';
import { type AddressInfo } from 'node:net';
import { expect, test, vi } from 'vitest';

type ProbeState = {
  readonly message?: string;
  readonly status: number;
};

type ServiceState = {
  readonly health: ProbeState;
  readonly live: ProbeState;
  readonly ready: ProbeState;
};

const getLightshipPort = (lightship: Lightship) => {
  const address = lightship.server.address() as AddressInfo;

  return address.port;
};

const getServiceState = async (
  lightship: Lightship,
  method: 'GET' | 'HEAD',
): Promise<ServiceState> => {
  const port = getLightshipPort(lightship);
  const base = 'http://127.0.0.1:' + port;

  const [healthResponse, liveResponse, readyResponse] = await Promise.all([
    fetch(base + '/health', { method }),
    fetch(base + '/live', { method }),
    fetch(base + '/ready', { method }),
  ]);

  const [healthBody, liveBody, readyBody] = await Promise.all([
    healthResponse.text(),
    liveResponse.text(),
    readyResponse.text(),
  ]);

  return {
    health: {
      message: healthBody,
      status: healthResponse.status,
    },
    live: {
      message: liveBody,
      status: liveResponse.status,
    },
    ready: {
      message: readyBody,
      status: readyResponse.status,
    },
  };
};

test('server starts in SERVER_IS_NOT_READY state', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  expect(lightship.isServerReady()).toBe(false);
  expect(lightship.isServerShuttingDown()).toBe(false);

  const serviceState = await getServiceState(lightship, 'GET');

  expect(serviceState.health.status).toBe(500);
  expect(serviceState.health.message).toBe(SERVER_IS_NOT_READY);

  expect(serviceState.live.status).toBe(200);
  expect(serviceState.live.message).toBe(SERVER_IS_NOT_SHUTTING_DOWN);

  expect(serviceState.ready.status).toBe(500);
  expect(serviceState.ready.message).toBe(SERVER_IS_NOT_READY);

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('server starts in SERVER_IS_NOT_READY state (HEAD)', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  expect(lightship.isServerReady()).toBe(false);
  expect(lightship.isServerShuttingDown()).toBe(false);

  const serviceState = await getServiceState(lightship, 'HEAD');

  expect(serviceState.health.status).toBe(500);
  expect(serviceState.live.status).toBe(200);
  expect(serviceState.ready.status).toBe(500);

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('calling `signalReady` changes server state to SERVER_IS_READY', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  lightship.signalReady();

  expect(lightship.isServerReady()).toBe(true);
  expect(lightship.isServerShuttingDown()).toBe(false);

  const serviceState = await getServiceState(lightship, 'GET');

  expect(serviceState.health.status).toBe(200);
  expect(serviceState.health.message).toBe(SERVER_IS_READY);

  expect(serviceState.live.status).toBe(200);
  expect(serviceState.live.message).toBe(SERVER_IS_NOT_SHUTTING_DOWN);

  expect(serviceState.ready.status).toBe(200);
  expect(serviceState.ready.message).toBe(SERVER_IS_READY);

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('calling `signalReady` changes server state to SERVER_IS_READY (HEAD)', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  lightship.signalReady();

  expect(lightship.isServerReady()).toBe(true);
  expect(lightship.isServerShuttingDown()).toBe(false);

  const serviceState = await getServiceState(lightship, 'GET');

  expect(serviceState.health.status).toBe(200);
  expect(serviceState.live.status).toBe(200);
  expect(serviceState.ready.status).toBe(200);

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('returns service state multiple time', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  await getServiceState(lightship, 'GET');
  await getServiceState(lightship, 'GET');
  await getServiceState(lightship, 'GET');

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('calling `signalReady` resolves `whenFirstReady`', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  setTimeout(() => {
    lightship.signalReady();
  }, 100);

  const startTime = Date.now();

  await lightship.whenFirstReady();

  expect(Date.now() - startTime).toBeGreaterThan(90);

  await lightship.shutdown();
});

test('`queueBlockingTask` forces service into SERVER_IS_NOT_READY until blocking tasks are resolved', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  let resolveBlockingTask: (() => void) | undefined;

  const blockingTask = new Promise<void>((resolve) => {
    resolveBlockingTask = resolve;
  });

  lightship.queueBlockingTask(blockingTask);

  lightship.signalReady();

  expect(lightship.isServerReady()).toBe(false);

  if (resolveBlockingTask) {
    resolveBlockingTask();
  }

  await delay(0);

  expect(lightship.isServerReady()).toBe(true);

  await lightship.shutdown();
});

test('`whenFirstReady` resolves when all blocking tasks are resolved', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  lightship.queueBlockingTask(
    new Promise<void>((resolve) => {
      setTimeout(() => {
        resolve();
      }, 200);
    }),
  );

  setTimeout(() => {
    lightship.signalReady();
  }, 100);

  const startTime = Date.now();

  await lightship.whenFirstReady();

  expect(Date.now() - startTime).toBeGreaterThan(190);

  await lightship.shutdown();
});

test('calling `signalNotReady` changes server state to SERVER_IS_NOT_READY', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  lightship.signalReady();
  lightship.signalNotReady();

  expect(lightship.isServerReady()).toBe(false);
  expect(lightship.isServerShuttingDown()).toBe(false);

  const serviceState = await getServiceState(lightship, 'GET');

  expect(serviceState.health.status).toBe(500);
  expect(serviceState.health.message).toBe(SERVER_IS_NOT_READY);

  expect(serviceState.live.status).toBe(200);
  expect(serviceState.live.message).toBe(SERVER_IS_NOT_SHUTTING_DOWN);

  expect(serviceState.ready.status).toBe(500);
  expect(serviceState.ready.message).toBe(SERVER_IS_NOT_READY);

  await lightship.shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('calling `shutdown` changes server state to SERVER_IS_SHUTTING_DOWN', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  let shutdown: ((value?: unknown) => void) | undefined;

  lightship.registerShutdownHandler(async () => {
    await new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  void lightship.shutdown();

  expect(lightship.isServerReady()).toBe(false);
  expect(lightship.isServerShuttingDown()).toBe(true);

  const serviceState = await getServiceState(lightship, 'GET');

  expect(serviceState.health.status).toBe(500);
  expect(serviceState.health.message).toBe(SERVER_IS_SHUTTING_DOWN);

  expect(serviceState.live.status).toBe(500);
  expect(serviceState.live.message).toBe(SERVER_IS_SHUTTING_DOWN);

  expect(serviceState.ready.status).toBe(500);
  expect(serviceState.ready.message).toBe(SERVER_IS_NOT_READY);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('invoking `shutdown` using a signal causes SERVER_IS_READY', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    detectKubernetes: false,
    shutdownDelay: 0,
    signals: ['LIGHTSHIP_TEST'],
    terminate,
  });

  // @ts-expect-error intentional dummy event
  process.emit('LIGHTSHIP_TEST');

  expect(lightship.isServerReady()).toBe(false);
  expect(lightship.isServerShuttingDown()).toBe(true);
});

test('error thrown from within a shutdown handler does not interrupt the shutdown sequence', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  const shutdownHandler0 = vi.fn(async () => {
    throw new Error('test');
  });

  let shutdown: (() => void) | undefined;

  const shutdownHandler1 = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler0);
  lightship.registerShutdownHandler(shutdownHandler1);

  void lightship.shutdown();

  await delay(500);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  shutdown();

  expect(shutdownHandler0).toHaveBeenCalledTimes(1);
  expect(shutdownHandler1).toHaveBeenCalledTimes(1);

  expect(terminate).not.toHaveBeenCalled();
});

test('calling `shutdown` multiple times results in shutdown handlers called once', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  let shutdown: (() => void) | undefined;

  const shutdownHandler = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  expect(shutdownHandler).not.toHaveBeenCalled();

  void lightship.shutdown();

  expect(shutdownHandler).toHaveBeenCalledTimes(1);

  void lightship.shutdown();

  expect(shutdownHandler).toHaveBeenCalledTimes(1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('presence of live beacons suspend the shutdown routine', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  let shutdown: (() => void) | undefined;

  const shutdownHandler = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  const beacon = lightship.createBeacon();

  expect(shutdownHandler).not.toHaveBeenCalled();

  void lightship.shutdown();

  expect(shutdownHandler).not.toHaveBeenCalled();

  await beacon.die();

  expect(shutdownHandler).toHaveBeenCalledTimes(1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('delays shutdown handlers', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 1_000,
    terminate,
  });

  let shutdown: (() => void) | undefined;

  const shutdownHandler = vi.fn(async () => {
    await new Promise<void>((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  void lightship.shutdown();

  await delay(500);

  expect(shutdownHandler).not.toHaveBeenCalled();

  await delay(1_000);

  expect(shutdownHandler).toHaveBeenCalledTimes(1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  shutdown();

  expect(terminate).not.toHaveBeenCalled();
});

test('errors produced by blocking tasks causes a service shutdown', async () => {
  const terminate = vi.fn();

  const lightship = await createLightship({
    shutdownDelay: 0,
    terminate,
  });

  let rejectBlockingTask: (() => void) | undefined;

  const blockingTask = new Promise<void>((resolve, reject) => {
    rejectBlockingTask = reject;
  });

  lightship.queueBlockingTask(blockingTask);

  lightship.signalReady();

  expect(lightship.isServerReady()).toBe(false);

  if (rejectBlockingTask) {
    rejectBlockingTask();
  }

  await delay(0);

  expect(lightship.isServerShuttingDown()).toBe(true);
  expect(lightship.isServerReady()).toBe(false);
});
