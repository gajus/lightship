import {
  EventEmitter,
} from 'events';
import {
  captureException,
} from '@sentry/node';
import delay from 'delay';
import createFastify from 'fastify';
import {
  serializeError,
} from 'serialize-error';
import Logger from '../Logger';
import {
  SERVER_IS_NOT_READY,
  SERVER_IS_NOT_SHUTTING_DOWN,
  SERVER_IS_READY,
  SERVER_IS_SHUTTING_DOWN,
} from '../states';
import type {
  BeaconContext,
  BlockingTask,
  ConfigurationInput,
  Configuration,
  Lightship,
  ShutdownHandler,
  BeaconController,
} from '../types';
import {
  isKubernetes,
} from '../utilities';

const log = Logger.child({
  namespace: 'factories/createLightship',
});

const {
  LIGHTSHIP_PORT,
// eslint-disable-next-line node/no-process-env
} = process.env;

const defaultConfiguration: Configuration = {
  detectKubernetes: true,
  gracefulShutdownTimeout: 60_000,
  port: LIGHTSHIP_PORT ? Number(LIGHTSHIP_PORT) : 9_000,
  shutdownDelay: 5_000,
  shutdownHandlerTimeout: 5_000,
  signals: [
    'SIGTERM',
    'SIGHUP',
    'SIGINT',
  ],
  terminate: () => {
    // eslint-disable-next-line node/no-process-exit
    process.exit(1);
  },
};

type Beacon = {
  context: BeaconContext,
};

export default async (userConfiguration?: ConfigurationInput): Promise<Lightship> => {
  let blockingTasks: BlockingTask[] = [];

  let resolveFirstReady: () => void;
  const deferredFirstReady = new Promise<void>((resolve) => {
    resolveFirstReady = resolve;
  });

  void deferredFirstReady.then(() => {
    log.info('service became available for the first time');
  });

  const eventEmitter = new EventEmitter();

  const beacons: Beacon[] = [];

  const shutdownHandlers: ShutdownHandler[] = [];

  const configuration: Configuration = {
    ...defaultConfiguration,
    ...userConfiguration,
  };

  if (configuration.gracefulShutdownTimeout < configuration.shutdownHandlerTimeout) {
    throw new Error('gracefulShutdownTimeout cannot be lesser than shutdownHandlerTimeout.');
  }

  let serverIsReady = false;
  let serverIsShuttingDown = false;

  const isServerReady = () => {
    if (blockingTasks.length > 0) {
      log.debug('service is not ready because there are blocking tasks');

      return false;
    }

    return serverIsReady;
  };

  const app = createFastify({ exposeHeadRoutes: true });

  app.addHook('onError', (request, reply, error, done) => {
    // Only send Sentry errors when not in development
    // eslint-disable-next-line node/no-process-env
    if (process.env.NODE_ENV !== 'development') {
      captureException(error);
    }

    done();
  });

  app.get('/health', async (request, reply) => {
    if (serverIsShuttingDown) {
      await reply
        .code(500)
        .send(SERVER_IS_SHUTTING_DOWN);
    } else if (serverIsReady) {
      await reply
        .send(SERVER_IS_READY);
    } else {
      await reply
        .code(500)
        .send(SERVER_IS_NOT_READY);
    }
  });

  app.get('/live', async (request, reply) => {
    if (serverIsShuttingDown) {
      await reply
        .code(500)
        .send(SERVER_IS_SHUTTING_DOWN);
    } else {
      await reply
        .send(SERVER_IS_NOT_SHUTTING_DOWN);
    }
  });

  app.get('/ready', async (request, reply) => {
    if (isServerReady()) {
      await reply
        .send(SERVER_IS_READY);
    } else {
      await reply
        .code(500)
        .send(SERVER_IS_NOT_READY);
    }
  });

  const modeIsLocal = configuration.detectKubernetes === true && isKubernetes() === false;

  await app.listen(modeIsLocal ? 0 : configuration.port, '0.0.0.0');

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

    if (blockingTasks.length > 0) {
      log.debug('service will not become immediately ready because there are blocking tasks');
    }

    serverIsReady = true;

    if (blockingTasks.length === 0) {
      resolveFirstReady();
    }
  };

  const shutdown = async (nextReady: boolean) => {
    if (serverIsShuttingDown) {
      log.warn('server is already shutting down');

      return;
    }

    // @see https://github.com/gajus/lightship/issues/12
    // @see https://github.com/gajus/lightship/issues/25
    serverIsReady = nextReady;
    serverIsShuttingDown = true;

    log.info('received request to shutdown the service');

    if (configuration.shutdownDelay) {
      log.debug('delaying shutdown handler by %d seconds', configuration.shutdownDelay / 1_000);

      await delay(configuration.shutdownDelay);
    }

    let gracefulShutdownTimeoutId;

    if (configuration.gracefulShutdownTimeout !== Number.POSITIVE_INFINITY) {
      gracefulShutdownTimeoutId = setTimeout(() => {
        log.warn('graceful shutdown timeout; forcing termination');

        configuration.terminate();
      }, configuration.gracefulShutdownTimeout);

      gracefulShutdownTimeoutId.unref();
    }

    if (beacons.length) {
      await new Promise<void>((resolve) => {
        const check = () => {
          log.debug('checking if there are live beacons');

          if (beacons.length > 0) {
            log.info({
              beacons,
            } as {}, 'program termination is on hold because there are live beacons');
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

    if (configuration.shutdownHandlerTimeout !== Number.POSITIVE_INFINITY) {
      shutdownHandlerTimeoutId = setTimeout(() => {
        log.warn('shutdown handler timeout; forcing termination');

        configuration.terminate();
      }, configuration.shutdownHandlerTimeout);

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

    void app.close();

    setTimeout(() => {
      log.warn('process did not exit on its own; investigate what is keeping the event loop active');

      configuration.terminate();
    }, 1_000)

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

        void shutdown(false);
      });
    }
  }

  const createBeacon = (context?: BeaconContext): BeaconController => {
    const beacon = {
      context: context ?? {},
    };

    beacons.push(beacon);

    return {
      die: async () => {
        log.trace({
          beacon,
        } as {}, 'beacon has been killed');

        beacons.splice(beacons.indexOf(beacon), 1);

        eventEmitter.emit('beaconStateChange');

        await delay(0);
      },
    };
  };

  return {
    createBeacon,
    isServerReady,
    isServerShuttingDown: () => {
      return serverIsShuttingDown;
    },
    queueBlockingTask: (blockingTask: BlockingTask) => {
      blockingTasks.push(blockingTask);

      void blockingTask.then(() => {
        blockingTasks = blockingTasks.filter((maybeTargetBlockingTask) => {
          return maybeTargetBlockingTask !== blockingTask;
        });

        if (blockingTasks.length === 0 && serverIsReady === true) {
          resolveFirstReady();
        }
      });
    },
    registerShutdownHandler: (shutdownHandler) => {
      shutdownHandlers.push(shutdownHandler);
    },
    server: app.server,
    shutdown: () => {
      return shutdown(false);
    },
    signalNotReady,
    signalReady,
    whenFirstReady: () => {
      return deferredFirstReady;
    },
  };
};
