// @flow

import test from 'ava';
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

test('server starts in SERVER_IS_NOT_READY state', async (t) => {
  const lightship = createLightship();

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

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_SHUTTING_DOWN);

  t.true(serviceState.live.status === 500);
  t.true(serviceState.live.message === SERVER_IS_SHUTTING_DOWN);

  t.true(serviceState.ready.status === 500);
  t.true(serviceState.ready.message === SERVER_IS_NOT_READY);

  await shutdown;
});
