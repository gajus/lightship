// @flow

/**
 * @property port The port on which the Lightship service listens. This port must be different than your main service port, if any. The default port is 9000.
 * @property onShutdown A teardown function called when shutdown is initialized.
 * @property signals An a array of [signal events]{@link https://nodejs.org/api/process.html#process_signal_events}. Default: [SIGTERM].
 */
export type LightshipConfigurationType = {|
  +port?: number,
  +onShutdown: () => Promise<void> | void,
  +signals?: $ReadOnlyArray<string>
|};

/**
 * @property shutdown Changes server state to SERVER_IS_SHUTTING_DOWN and initialises the shutdown of the application.
 * @property signalNotReady Changes server state to SERVER_IS_NOT_READY.
 * @property signalReady Changes server state to SERVER_IS_READY.
 */
export type LightshipType = {|
  +shutdown: () => Promise<void>,
  +signalNotReady: () => void,
  +signalReady: () => void
|};
