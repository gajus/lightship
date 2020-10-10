// @flow

// eslint-disable-next-line fp/no-events
import EventEmitter from 'events';
import delay from 'delay';
import express from 'express';
import {
  createHttpTerminator,
} from 'http-terminator';
import {
  serializeError,
} from 'serialize-error';
import Logger from '../Logger';
import type {
  ConfigurationInputType,
  ConfigurationType,
  LightshipType,
  ShutdownHandlerType,
} from '../types';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN,
} from '../states';
import {
  isKubernetes,
} from '../utilities';

const log = Logger.child({
  namespace: 'factories/createLightship',
});

const defaultConfiguration = {
  detectKubernetes: true,
  gracefulShutdownTimeout: 60000,
  port: 9000,
  shutdownHandlerTimeout: 5000,
  signals: [
    'SIGTERM',
    'SIGHUP',
    'SIGINT',
  ],
  terminate: () => {
    // eslint-disable-next-line no-process-exit
    process.exit(1);
  },
};

export default (userConfiguration?: ConfigurationInputType): LightshipType => {
  const eventEmitter = new EventEmitter();

  const beacons = [];

  const shutdownHandlers: Array<ShutdownHandlerType> = [];

  const configuration: ConfigurationType = {
    ...defaultConfiguration,
    ...userConfiguration,
  };

  if (configuration.gracefulShutdownTimeout < configuration.shutdownHandlerTimeout) {
    throw new Error('gracefulShutdownTimeout cannot be lesser than shutdownHandlerTimeout.');
  }

  let serverIsReady = false;
  let serverIsShuttingDown = false;

  const app = express();

  const modeIsLocal = configuration.detectKubernetes === true && isKubernetes() === false;

  const server = app.listen(modeIsLocal ? undefined : configuration.port, () => {
    log.info('Lightship HTTP service is running on port %s', server.address().port);
  });

  const httpTerminator = createHttpTerminator({
    server,
  });

  app.get('/health', (request, response) => {
    if (serverIsShuttingDown) {
      response.status(500).send(SERVER_IS_SHUTTING_DOWN);
    } else if (serverIsReady) {
      response.send(SERVER_IS_READY);
    } else {
      response.status(500).send(SERVER_IS_NOT_READY);
    }
  });

  app.get('/live', (request, response) => {
    if (serverIsShuttingDown) {
      response.status(500).send(SERVER_IS_SHUTTING_DOWN);
    } else {
      response.send(SERVER_IS_NOT_SHUTTING_DOWN);
    }
  });

  app.get('/ready', (request, response) => {
    if (serverIsReady) {
      response.send(SERVER_IS_READY);
    } else {
      response.status(500).send(SERVER_IS_NOT_READY);
    }
  });

  const signalNotReady = () => {
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

  const shutdown = async (nextReady: boolean) => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    log.info('received request to shutdown the service');

    let gracefulShutdownTimeoutId;

    if (configuration.gracefulShutdownTimeout !== Infinity) {
      gracefulShutdownTimeoutId = setTimeout(() => {
        log.warn('graceful shutdown timeout; forcing termination');

        configuration.terminate();
      }, configuration.gracefulShutdownTimeout);

      // $FlowFixMe
      gracefulShutdownTimeoutId.unref();
    }

    // @see https://github.com/gajus/lightship/issues/12
    // @see https://github.com/gajus/lightship/issues/25
    serverIsReady = nextReady;
    serverIsShuttingDown = true;

    if (beacons.length) {
      await new Promise((resolve) => {
        const check = () => {
          log.debug('checking if there are live beacons');

          if (beacons.length > 0) {
            log.info({
              beacons,
            }, 'program termination is on hold because there are live beacons');
          } else {
            log.info('there are no live beacons; proceeding to terminate the Node.js process');

            eventEmitter.off('beaconStateChange', check);

            resolve();
          }
        };

        eventEmitter.on('beaconStateChange', check);

        check();
      });
    }

    if (gracefulShutdownTimeoutId) {
      clearTimeout(gracefulShutdownTimeoutId);
    }

    let shutdownHandlerTimeoutId;

    if (configuration.shutdownHandlerTimeout !== Infinity) {
      shutdownHandlerTimeoutId = setTimeout(() => {
        log.warn('shutdown handler timeout; forcing termination');

        configuration.terminate();
      }, configuration.shutdownHandlerTimeout);

      // $FlowFixMe
      shutdownHandlerTimeoutId.unref();
    }

    log.debug('running %d shutdown handler(s)', shutdownHandlers.length);

    for (const shutdownHandler of shutdownHandlers) {
      try {
        await shutdownHandler();
      } catch (error) {
        log.error({
          error: serializeError(error),
        }, 'shutdown handler produced an error');
      }
    }

    if (shutdownHandlerTimeoutId) {
      clearTimeout(shutdownHandlerTimeoutId);
    }

    log.debug('all shutdown handlers have run to completion; proceeding to terminate the Node.js process');

    await httpTerminator.terminate();

    setTimeout(() => {
      log.warn('process did not exit on its own; investigate what is keeping the event loop active');

      configuration.terminate();
    }, 1000)

      // $FlowFixMe
      .unref();
  };

  if (modeIsLocal) {
    log.warn('shutdown handlers are not used in the local mode');
  } else {
    for (const signal of configuration.signals) {
      process.on(signal, () => {
        log.debug({
          signal,
        }, 'received a shutdown signal');

        shutdown(true);
      });
    }
  }

  const createBeacon = (context) => {
    const beacon = {
      context: context || {},
    };

    beacons.push(beacon);

    return {
      die: async () => {
        log.trace({
          beacon,
        }, 'beacon has been killed');

        beacons.splice(beacons.indexOf(beacon), 1);

        eventEmitter.emit('beaconStateChange');

        await delay(0);
      },
    };
  };

  return {
    createBeacon,
    isServerReady: () => {
      return serverIsReady;
    },
    isServerShuttingDown: () => {
      return serverIsShuttingDown;
    },
    registerShutdownHandler: (shutdownHandler) => {
      shutdownHandlers.push(shutdownHandler);
    },
    server,
    shutdown: () => {
      return shutdown(false);
    },
    signalNotReady,
    signalReady,
  };
};
