// @flow

import test from 'ava';
import sinon from 'sinon';
import delay from 'delay';
import axios from 'axios';
import createLightship from '../../../src/factories/createLightship';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN,
} from '../../../src/states';

type ProbeStateType = {|
  +message: string,
  +status: number,
|};

type ServiceStateType = {|
  +health: ProbeStateType,
  +live: ProbeStateType,
  +ready: ProbeStateType,
|};

const getServiceState = async (port: number = 9000): Promise<ServiceStateType> => {
  const health = await axios('http://127.0.0.1:' + port + '/health', {
    validateStatus: () => {
      return true;
    },
  });

  const live = await axios('http://127.0.0.1:' + port + '/live', {
    validateStatus: () => {
      return true;
    },
  });

  const ready = await axios('http://127.0.0.1:' + port + '/ready', {
    validateStatus: () => {
      return true;
    },
  });

  return {
    health: {
      message: health.data,
      status: health.status,
    },
    live: {
      message: live.data,
      status: live.status,
    },
    ready: {
      message: ready.data,
      status: ready.status,
    },
  };
};

test('server starts in SERVER_IS_NOT_READY state', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  t.is(lightship.isServerReady(), false);
  t.is(lightship.isServerShuttingDown(), false);

  const serviceState = await getServiceState(lightship.server.address().port);

  t.is(serviceState.health.status, 500);
  t.is(serviceState.health.message, SERVER_IS_NOT_READY);

  t.is(serviceState.live.status, 200);
  t.is(serviceState.live.message, SERVER_IS_NOT_SHUTTING_DOWN);

  t.is(serviceState.ready.status, 500);
  t.is(serviceState.ready.message, SERVER_IS_NOT_READY);

  await lightship.shutdown();

  t.is(terminate.called, false);
});

test('calling `signalReady` changes server state to SERVER_IS_READY', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  lightship.signalReady();

  t.is(lightship.isServerReady(), true);
  t.is(lightship.isServerShuttingDown(), false);

  const serviceState = await getServiceState(lightship.server.address().port);

  t.is(serviceState.health.status, 200);
  t.is(serviceState.health.message, SERVER_IS_READY);

  t.is(serviceState.live.status, 200);
  t.is(serviceState.live.message, SERVER_IS_NOT_SHUTTING_DOWN);

  t.is(serviceState.ready.status, 200);
  t.is(serviceState.ready.message, SERVER_IS_READY);

  await lightship.shutdown();

  t.is(terminate.called, false);
});

test('calling `signalNotReady` changes server state to SERVER_IS_NOT_READY', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  lightship.signalReady();
  lightship.signalNotReady();

  t.is(lightship.isServerReady(), false);
  t.is(lightship.isServerShuttingDown(), false);

  const serviceState = await getServiceState(lightship.server.address().port);

  t.is(serviceState.health.status, 500);
  t.is(serviceState.health.message, SERVER_IS_NOT_READY);

  t.is(serviceState.live.status, 200);
  t.is(serviceState.live.message, SERVER_IS_NOT_SHUTTING_DOWN);

  t.is(serviceState.ready.status, 500);
  t.is(serviceState.ready.message, SERVER_IS_NOT_READY);

  await lightship.shutdown();

  t.is(terminate.called, false);
});

test('calling `shutdown` changes server state to SERVER_IS_SHUTTING_DOWN', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  let shutdown;

  lightship.registerShutdownHandler(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.shutdown();

  t.is(lightship.isServerReady(), false);
  t.is(lightship.isServerShuttingDown(), true);

  const serviceState = await getServiceState(lightship.server.address().port);

  t.is(serviceState.health.status, 500);
  t.is(serviceState.health.message, SERVER_IS_SHUTTING_DOWN);

  t.is(serviceState.live.status, 500);
  t.is(serviceState.live.message, SERVER_IS_SHUTTING_DOWN);

  t.is(serviceState.ready.status, 500);
  t.is(serviceState.ready.message, SERVER_IS_NOT_READY);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();

  t.is(terminate.called, false);
});

test('invoking `shutdown` using a signal causes SERVER_IS_READY', (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    detectKubernetes: false,
    signals: [
      'LIGHTSHIP_TEST',
    ],
    terminate,
  });

  process.emit('LIGHTSHIP_TEST');

  t.is(lightship.isServerReady(), false);
  t.is(lightship.isServerShuttingDown(), true);
});

test('error thrown from within a shutdown handler does not interrupt the shutdown sequence', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

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

  t.is(shutdownHandler0.callCount, 1);
  t.is(shutdownHandler1.callCount, 1);

  t.is(terminate.called, false);
});

test('calling `shutdown` multiple times results in shutdown handlers called once', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  let shutdown;

  const shutdownHandler = sinon.spy(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  t.is(shutdownHandler.callCount, 0);

  lightship.shutdown();

  t.is(shutdownHandler.callCount, 1);

  lightship.shutdown();

  t.is(shutdownHandler.callCount, 1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();

  t.is(terminate.called, false);
});

test('presence of live beacons suspend the shutdown routine', async (t) => {
  const terminate = sinon.stub();

  const lightship = createLightship({
    terminate,
  });

  let shutdown;

  const shutdownHandler = sinon.spy(() => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  });

  lightship.registerShutdownHandler(shutdownHandler);

  const beacon = lightship.createBeacon();

  t.is(shutdownHandler.callCount, 0);

  lightship.shutdown();

  t.is(shutdownHandler.callCount, 0);

  await beacon.die();

  t.is(shutdownHandler.callCount, 1);

  if (!shutdown) {
    throw new Error('Unexpected state.');
  }

  await shutdown();

  t.is(terminate.called, false);
});
