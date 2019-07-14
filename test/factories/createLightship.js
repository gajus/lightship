// @flow

import test, {
  afterEach,
  beforeEach
} from 'ava';
import sinon from 'sinon';
import delay from 'delay';
import axios from 'axios';
import createLightship from '../../src/factories/createLightship';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN
} from '../../src/states';

type ProbeStateType = {|
  +message: string,
  +status: number
|};

type ServiceStateType = {|
  +health: ProbeStateType,
  +live: ProbeStateType,
  +ready: ProbeStateType
|};

const getServiceState = async (port: number = 9000): Promise<ServiceStateType> => {
  const health = await axios('http://127.0.0.1:' + port + '/health', {
    validateStatus: () => {
      return true;
    }
  });

  const live = await axios('http://127.0.0.1:' + port + '/live', {
    validateStatus: () => {
      return true;
    }
  });

  const ready = await axios('http://127.0.0.1:' + port + '/ready', {
    validateStatus: () => {
      return true;
    }
  });

  return {
    health: {
      message: health.data,
      status: health.status
    },
    live: {
      message: live.data,
      status: live.status
    },
    ready: {
      message: ready.data,
      status: ready.status
    }
  };
};

beforeEach(() => {
  sinon.stub(process, 'exit');
});

afterEach(() => {
  process.exit.restore();
});

test('server starts in SERVER_IS_NOT_READY state', async (t) => {
  const lightship = createLightship();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === false);

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_NOT_READY);

  t.true(serviceState.live.status === 200);
  t.true(serviceState.live.message === SERVER_IS_NOT_SHUTTING_DOWN);

  t.true(serviceState.ready.status === 500);
  t.true(serviceState.ready.message === SERVER_IS_NOT_READY);

  await lightship.shutdown();
});

test('calling `signalReady` changes server state to SERVER_IS_READY', async (t) => {
  const lightship = createLightship();

  lightship.signalReady();

  t.true(lightship.isServerReady() === true);
  t.true(lightship.isServerShuttingDown() === false);

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 200);
  t.true(serviceState.health.message === SERVER_IS_READY);

  t.true(serviceState.live.status === 200);
  t.true(serviceState.live.message === SERVER_IS_NOT_SHUTTING_DOWN);

  t.true(serviceState.ready.status === 200);
  t.true(serviceState.ready.message === SERVER_IS_READY);

  await lightship.shutdown();
});

test('calling `signalNotReady` changes server state to SERVER_IS_NOT_READY', async (t) => {
  const lightship = createLightship();

  lightship.signalReady();
  lightship.signalNotReady();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === false);

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_NOT_READY);

  t.true(serviceState.live.status === 200);
  t.true(serviceState.live.message === SERVER_IS_NOT_SHUTTING_DOWN);

  t.true(serviceState.ready.status === 500);
  t.true(serviceState.ready.message === SERVER_IS_NOT_READY);

  await lightship.shutdown();
});

test('calling `shutdown` changes server state to SERVER_IS_SHUTTING_DOWN', async (t) => {
  const lightship = createLightship();

  let shutdown;

  lightship.registerShutdownHandler(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.shutdown();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === true);

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_SHUTTING_DOWN);

  t.true(serviceState.live.status === 500);
  t.true(serviceState.live.message === SERVER_IS_SHUTTING_DOWN);

  t.true(serviceState.ready.status === 500);
  t.true(serviceState.ready.message === SERVER_IS_NOT_READY);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();
});

test('error thrown from within a shutdown handler does not interrupt the shutdown sequence', async (t) => {
  const lightship = createLightship();

  const shutdownHandler0 = sinon.spy(async () => {
    throw new Error('test');
  });

  let shutdown;

  const shutdownHandler1 = sinon.spy(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler0);
  lightship.registerShutdownHandler(shutdownHandler1);

  lightship.shutdown();

  await delay(500);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();

  t.true(shutdownHandler0.callCount === 1);
  t.true(shutdownHandler1.callCount === 1);
});

test('calling `shutdown` multiple times results in shutdown handlers called once', async (t) => {
  const lightship = createLightship();

  let shutdown;

  const shutdownHandler = sinon.spy(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  t.true(shutdownHandler.callCount === 0);

  lightship.shutdown();

  t.true(shutdownHandler.callCount === 1);

  lightship.shutdown();

  t.true(shutdownHandler.callCount === 1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();
});

test('calling `signalReady` after `shutdown` does not have effect on server state', async (t) => {
  const lightship = createLightship();

  let shutdown;

  lightship.registerShutdownHandler(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === false);

  const serviceState0 = await getServiceState();

  t.true(serviceState0.health.status === 500);
  t.true(serviceState0.health.message === SERVER_IS_NOT_READY);

  lightship.shutdown();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === true);

  const serviceState1 = await getServiceState();

  t.true(serviceState1.health.status === 500);
  t.true(serviceState1.health.message === SERVER_IS_SHUTTING_DOWN);

  lightship.signalReady();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === true);

  const serviceState2 = await getServiceState();

  t.true(serviceState2.health.status === 500);
  t.true(serviceState2.health.message === SERVER_IS_SHUTTING_DOWN);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();
});

test('calling `signalNotReady` after `shutdown` does not have effect on server state', async (t) => {
  const lightship = createLightship();

  let shutdown;

  lightship.registerShutdownHandler(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.signalReady();

  t.true(lightship.isServerReady() === true);
  t.true(lightship.isServerShuttingDown() === false);

  const serviceState0 = await getServiceState();

  t.true(serviceState0.health.status === 200);
  t.true(serviceState0.health.message === SERVER_IS_READY);

  lightship.shutdown();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === true);

  const serviceState1 = await getServiceState();

  t.true(serviceState1.health.status === 500);
  t.true(serviceState1.health.message === SERVER_IS_SHUTTING_DOWN);

  lightship.signalNotReady();

  t.true(lightship.isServerReady() === false);
  t.true(lightship.isServerShuttingDown() === true);

  const serviceState2 = await getServiceState();

  t.true(serviceState2.health.status === 500);
  t.true(serviceState2.health.message === SERVER_IS_SHUTTING_DOWN);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();
});
