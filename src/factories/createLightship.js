// @flow

import express from 'express';
import serializeError from 'serialize-error';
import Logger from '../Logger';
import {
  isKubernetes
} from '../utilities';
import type {
  ConfigurationType,
  LightshipType,
  ShutdownHandlerType,
  UserConfigurationType
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
  detectKubernetes: true,
  port: 9000,
  signals: [
    'SIGTERM',
    'SIGHUP',
    'SIGINT'
  ],
  timeout: 60000
};

export default (userConfiguration?: UserConfigurationType): LightshipType => {
  const shutdownHandlers: Array<ShutdownHandlerType> = [];

  const configuration: ConfigurationType = {
    ...defaultConfiguration,
    ...userConfiguration
  };

  let serverIsReady = false;
  let serverIsShuttingDown = false;

  if (configuration.detectKubernetes === true && isKubernetes() === false) {
    log.warn('Lightship could not detect Kubernetes; operating in a no-op mode');

    return {
      isServerReady: () => {
        return serverIsReady;
      },
      isServerShuttingDown: () => {
        return serverIsShuttingDown;
      },
      registerShutdownHandler: () => {},
      shutdown: async () => {
        serverIsReady = false;
        serverIsShuttingDown = true;
      },
      signalNotReady: () => {
        serverIsReady = false;
      },
      signalReady: () => {
        serverIsReady = true;
      }
    };
  }

  const app = express();

  const server = app.listen(configuration.port);

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
      log.warn('server is already in a SERVER_IS_NOT_READY state');
    }

    log.info('signaling that the server is not ready to accept connections');

    serverIsReady = false;
  };

  const signalReady = () => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    log.info('signaling that the server is ready');

    serverIsReady = true;
  };

  const shutdown = async () => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    if (configuration.timeout !== Infinity) {
      setTimeout(() => {
        log.warn('timeout occured before all the shutdown handlers could run to completion; forcing termination');

        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }, configuration.timeout);
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

    server.close((error) => {
      if (error) {
        log.error({
          error: serializeError(error)
        }, 'server was terminated with an error');
      }

      const timeoutId = setTimeout(() => {
        log.warn('process did not exit on its own; invetigate what is keeping the event loop active');

        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }, 1000);

      // $FlowFixMe
      timeoutId.unref();
    });
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
    isServerReady: () => {
      return serverIsReady;
    },
    isServerShuttingDown: () => {
      return serverIsShuttingDown;
    },
    registerShutdownHandler: (shutdownHandler) => {
      shutdownHandlers.push(shutdownHandler);
    },
    shutdown,
    signalNotReady,
    signalReady
  };
};
