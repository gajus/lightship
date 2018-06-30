// @flow

import express from 'express';
import serializeError from 'serialize-error';
import Logger from '../Logger';
import type {
  ShutdownHandlerType,
  LightshipConfigurationType,
  LightshipType
} from '../types';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN
} from '../states';

const log = Logger.child({
  namespace: 'factories/createLightship'
});

const defaultConfiguration = {
  port: 9000,
  signals: [
    'SIGTERM'
  ]
};

export default (userConfiguration?: LightshipConfigurationType): LightshipType => {
  const shutdownHandlers: Array<ShutdownHandlerType> = [];

  const configuration = {
    ...defaultConfiguration,
    ...userConfiguration
  };

  const app = express();

  const server = app.listen(configuration.port);

  let serverIsReady = false;
  let serverIsShuttingDown = false;

  app.get('/health', (req, res) => {
    if (serverIsShuttingDown) {
      res.status(500).send(SERVER_IS_SHUTTING_DOWN);
    } else if (serverIsReady) {
      res.send(SERVER_IS_READY);
    } else {
      res.status(500).send(SERVER_IS_NOT_READY);
    }
  });

  app.get('/live', (req, res) => {
    if (serverIsShuttingDown) {
      res.status(500).send(SERVER_IS_SHUTTING_DOWN);
    } else {
      res.send(SERVER_IS_NOT_SHUTTING_DOWN);
    }
  });

  app.get('/ready', (req, res) => {
    if (serverIsReady) {
      res.send(SERVER_IS_READY);
    } else {
      res.status(500).send(SERVER_IS_NOT_READY);
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

    serverIsReady = false;
    serverIsShuttingDown = true;

    for (const shutdownHandler of shutdownHandlers) {
      try {
        await shutdownHandler();
      } catch (error) {
        log.error({
          error: serializeError(error)
        }, 'shutdown handler produced an error');
      }
    }

    log.debug('all shutdown handlers have run to completion; proceeding to terminate the Node.js process');

    server.close();

    // eslint-disable-next-line no-process-exit
    process.exit();
  };

  for (const signal of configuration.signals) {
    process.on(signal, () => {
      log.debug({
        signal
      }, 'received a shutdown signal');

      shutdown();
    });
  }

  return {
    registerShutdownHandler: (shutdownHandler) => {
      shutdownHandlers.push(shutdownHandler);
    },
    shutdown,
    signalNotReady,
    signalReady
  };
};
