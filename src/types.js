// @flow

import type {
  Server
} from 'http';

/**
 * A teardown function called when shutdown is initialized.
 */
export type ShutdownHandlerType = () => Promise<void> | void;

/**
 * @property detectKubernetes Run Lightship in local mode when Kubernetes is not detected. Default: true.
 * @property port The port on which the Lightship service listens. This port must be different than your main service port, if any. The default port is 9000.
 * @property signals An a array of [signal events]{@link https://nodejs.org/api/process.html#process_signal_events}. Default: [SIGTERM].
 * @property timeout A number of milliseconds before forcefull termination. Default: 60000.
 */
export type UserConfigurationType = {|
  +detectKubernetes?: boolean,
  +port?: number,
  +signals?: $ReadOnlyArray<string>,
  +timeout?: number
|};

export type ConfigurationType = {|
  +detectKubernetes: boolean,
  +port: number,
  +signals: $ReadOnlyArray<string>,
  +timeout: number
|};

export opaque type StateType =
  'SERVER_IS_NOT_READY' |
  'SERVER_IS_NOT_SHUTTING_DOWN' |
  'SERVER_IS_READY' |
  'SERVER_IS_SHUTTING_DOWN';

/**
 * @property registerShutdownHandler Registers teardown functions that are called when shutdown is initialized. All registered shutdown handlers are executed in the order they have been registered. After all shutdown handlers have been executed, Lightship asks `process.exit()` to terminate the process synchronously.
 * @property shutdown Changes server state to SERVER_IS_SHUTTING_DOWN and initialises the shutdown of the application.
 * @property signalNotReady Changes server state to SERVER_IS_NOT_READY.
 * @property signalReady Changes server state to SERVER_IS_READY.
 */
export type LightshipType = {|
  +server: Server,
  +isServerReady: () => boolean,
  +isServerShuttingDown: () => boolean,
  +registerShutdownHandler: (shutdownHandler: ShutdownHandlerType) => void,
  +shutdown: () => Promise<void>,
  +signalNotReady: () => void,
  +signalReady: () => void
|};
