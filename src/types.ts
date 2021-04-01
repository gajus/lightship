import type {
  Server,
} from 'http';

/**
 * A teardown function called when shutdown is initialized.
 */
export type ShutdownHandler = () => Promise<void> | void;

/**
 * @property detectKubernetes Run Lightship in local mode when Kubernetes is not detected. Default: true.
 * @property gracefulShutdownTimeout A number of milliseconds before forcefull termination if process does not gracefully exit. The timer starts when `lightship.shutdown()` is called. This includes the time allowed to live beacons and shutdown handlers. Default: 60000.
 * @property port The port on which the Lightship service listens. This port must be different than your main service port, if any. The default port is 9000.
 * @property shutdownDelay Delays the shutdown handler by X milliseconds. This value should match `readinessProbe.periodSeconds`. Default 5000.
 * @property shutdownHandlerTimeout A number of milliseconds before forcefull termination if shutdown handlers do not complete. The timer starts when the first shutdown handler is called. Default: 5000.
 * @property signals An a array of [signal events]{@link https://nodejs.org/api/process.html#process_signal_events}. Default: [SIGTERM].
 * @property terminate Method used to terminate Node.js process. Default: `() => { process.exit(1) };`.
 */
export type ConfigurationInput = {
  readonly detectKubernetes?: boolean,
  readonly gracefulShutdownTimeout?: number,
  readonly port?: number,
  readonly shutdownDelay?: number,
  readonly shutdownHandlerTimeout?: number,
  readonly signals?: readonly string[],
  readonly terminate?: () => void,
};

export type Configuration = {
  readonly detectKubernetes: boolean,
  readonly gracefulShutdownTimeout: number,
  readonly port: number,
  readonly shutdownDelay: number,
  readonly shutdownHandlerTimeout: number,
  readonly signals: readonly string[],
  readonly terminate: () => void,
};

export type BeaconContext = {
  [key: string]: unknown,
};

export type BeaconController = {
  readonly die: () => Promise<void>,
};

export type BlockingTask = Promise<unknown>;

export type State = 'SERVER_IS_NOT_READY' | 'SERVER_IS_NOT_SHUTTING_DOWN' | 'SERVER_IS_READY' | 'SERVER_IS_SHUTTING_DOWN';

/**
 * @property registerShutdownHandler Registers teardown functions that are called when shutdown is initialized. All registered shutdown handlers are executed in the order they have been registered. After all shutdown handlers have been executed, Lightship asks `process.exit()` to terminate the process synchronously.
 * @property shutdown Changes server state to SERVER_IS_SHUTTING_DOWN and initialises the shutdown of the application.
 * @property signalNotReady Changes server state to SERVER_IS_NOT_READY.
 * @property signalReady Changes server state to SERVER_IS_READY.
 * @property queueBlockingTask Forces service state to SERVER_IS_NOT_READY until all promises are resolved.
 */
export type Lightship = {
  readonly createBeacon: (context?: BeaconContext) => BeaconController,
  readonly isServerReady: () => boolean,
  readonly isServerShuttingDown: () => boolean,
  readonly queueBlockingTask: (blockingTask: BlockingTask) => void,
  readonly registerShutdownHandler: (shutdownHandler: ShutdownHandler) => void,
  readonly server: Server,
  readonly shutdown: () => Promise<void>,
  readonly signalNotReady: () => void,
  readonly signalReady: () => void,
  readonly whenFirstReady: () => Promise<void>,
};
