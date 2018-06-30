// @flow

/**
 * A teardown function called when shutdown is initialized.
 */
export type ShutdownHandlerType = () => Promise<void> | void;

/**
 * @property port The port on which the Lightship service listens. This port must be different than your main service port, if any. The default port is 9000.
 * @property signals An a array of [signal events]{@link https://nodejs.org/api/process.html#process_signal_events}. Default: [SIGTERM].
 */
export type LightshipConfigurationType = {|
  +port?: number,
  +signals?: $ReadOnlyArray<string>
|};

/**
 * @property registerShutdownHandler Registers teardown functions that are called when shutdown is initialized. All registered shutdown handlers are executed in the order they have been registered. After all shutdown handlers have been executed, Lightship asks `process.exit()` to terminate the process synchronously.
 * @property shutdown Changes server state to SERVER_IS_SHUTTING_DOWN and initialises the shutdown of the application.
 * @property signalNotReady Changes server state to SERVER_IS_NOT_READY.
 * @property signalReady Changes server state to SERVER_IS_READY.
 */
export type LightshipType = {|
  +registerShutdownHandler: (shutdownHandler: ShutdownHandlerType) => void,
  +shutdown: () => Promise<void>,
  +signalNotReady: () => void,
  +signalReady: () => void
|};
