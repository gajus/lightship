// @flow

import test from 'ava';
import axios from 'axios';
import createLightship from '../../src/factories/createLightship';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN
} from '../../src/states';

type ProbeStateType = {|
  +message: string,
  +status: number
|};

type ServiceStateType = {|
  +health: ProbeStateType
|};

const noop = () => {};

const getServiceState = async (port: number = 9000): Promise<ServiceStateType> => {
  const health = await axios('http://127.0.0.1:' + port + '/health', {
    validateStatus: () => {
      return true;
    }
  });

  return {
    health: {
      message: health.data,
      status: health.status
    }
  };
};

test('server starts in SERVER_IS_NOT_READY state', async (t) => {
  const lightship = createLightship({
    onShutdown: noop
  });

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_NOT_READY);

  await lightship.shutdown();
});

test('calling `signalReady` changes server state to SERVER_IS_READY', async (t) => {
  const lightship = createLightship({
    onShutdown: noop
  });

  lightship.signalReady();

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 200);
  t.true(serviceState.health.message === SERVER_IS_READY);

  await lightship.shutdown();
});

test('calling `signalNotReady` changes server state to SERVER_IS_NOT_READY', async (t) => {
  const lightship = createLightship({
    onShutdown: noop
  });

  lightship.signalReady();
  lightship.signalNotReady();

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_NOT_READY);

  await lightship.shutdown();
});

test('calling `shutdown` changes server state to SERVER_IS_SHUTTING_DOWN', async (t) => {
  let shutdown;

  const onShutdown = () => {
    return new Promise((resolve) => {
      shutdown = resolve;
    });
  };

  const lightship = createLightship({
    onShutdown
  });

  lightship.shutdown();

  const serviceState = await getServiceState();

  t.true(serviceState.health.status === 500);
  t.true(serviceState.health.message === SERVER_IS_SHUTTING_DOWN);

  await shutdown;
});
