// @flow

import express from 'express';
import Logger from '../Logger';
import type {
  LightshipConfigurationType,
  LightshipType
} from '../types';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN
} from '../states';

const log = Logger.child({
  namespace: 'factories/createLightship'
});

const defaultSignals = [
  'SIGTERM'
];

export default (configuration?: LightshipConfigurationType): LightshipType => {
  const app = express();

  const signals = configuration && configuration.signals || defaultSignals;

  const server = app.listen(configuration && configuration.port || 9000);

  let serverIsReady = false;
  let serverIsShuttingDown = false;

  app.get('/health', (req, res) => {
    if (serverIsShuttingDown) {
      res.status(500).send(SERVER_IS_SHUTTING_DOWN);
    } else if (serverIsReady === false) {
      res.status(500).send(SERVER_IS_NOT_READY);
    } else {
      res.send(SERVER_IS_READY);
    }
  });

  const signalNotReady = () => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    if (serverIsReady === false) {
      log.warn('server is already is a NOT READY state');
    }

    log.info('signaling that the server is not ready to accept connections');

    serverIsReady = false;
  };

  const signalReady = () => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    log.info('signaling that the server is ready to accept connections');

    serverIsReady = true;
  };

  const shutdown = async () => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    serverIsShuttingDown = true;

    if (configuration && configuration.onShutdown) {
      await configuration.onShutdown();
    }

    server.close();
  };

  for (const signal of signals) {
    process.on(signal, () => {
      log.debug({
        signal
      }, 'received a shutdown signal');

      shutdown();
    });
  }

  return {
    shutdown,
    signalNotReady,
    signalReady
  };
};
