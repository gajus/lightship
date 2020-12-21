<a name="lightship"></a>
# Lightship 🚢

[![Travis build status](http://img.shields.io/travis/gajus/lightship/master.svg?style=flat-square)](https://travis-ci.org/gajus/lightship)
[![Coveralls](https://img.shields.io/coveralls/gajus/lightship.svg?style=flat-square)](https://coveralls.io/github/gajus/lightship)
[![NPM version](http://img.shields.io/npm/v/lightship.svg?style=flat-square)](https://www.npmjs.org/package/lightship)
[![Canonical Code Style](https://img.shields.io/badge/code%20style-canonical-blue.svg?style=flat-square)](https://github.com/gajus/canonical)
[![Twitter Follow](https://img.shields.io/twitter/follow/kuizinas.svg?style=social&label=Follow)](https://twitter.com/kuizinas)

(Please read [Best practices](#best-practices) section.)

Abstracts readiness, liveness and startup checks and graceful shutdown of Node.js services running in Kubernetes.

* [Lightship 🚢](#lightship)
    * [Behaviour](#lightship-behaviour)
        * [Local-mode](#lightship-behaviour-local-mode)
        * [`/health`](#lightship-behaviour-health)
        * [`/live`](#lightship-behaviour-live)
        * [`/ready`](#lightship-behaviour-ready)
        * [Timeouts](#lightship-behaviour-timeouts)
    * [Usage](#lightship-usage)
        * [Kubernetes container probe configuration](#lightship-usage-kubernetes-container-probe-configuration)
        * [Logging](#lightship-usage-logging)
        * [Queueing service blocking tasks](#lightship-usage-queueing-service-blocking-tasks)
        * [Waiting for the server to become ready](#lightship-usage-waiting-for-the-server-to-become-ready)
    * [Usage examples](#lightship-usage-examples)
        * [Using with Express.js](#lightship-usage-examples-using-with-express-js)
        * [Beacons](#lightship-usage-examples-beacons)
    * [Best practices](#lightship-best-practices)
        * [Add a delay before stop handling incoming requests](#lightship-best-practices-add-a-delay-before-stop-handling-incoming-requests)
    * [FAQ](#lightship-faq)
        * [What is the reason that my liveness/ readiness endpoints are intermittently failing?](#lightship-faq-what-is-the-reason-that-my-liveness-readiness-endpoints-are-intermittently-failing)
        * [What is the reason for having separate `/live` and `/ready` endpoints?](#lightship-faq-what-is-the-reason-for-having-separate-live-and-ready-endpoints)
        * [How to detect what is holding the Node.js process alive?](#lightship-faq-how-to-detect-what-is-holding-the-node-js-process-alive)
    * [Related projects](#lightship-related-projects)


<a name="lightship-behaviour"></a>
## Behaviour

Creates a HTTP service used to check [container probes](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-probes).

Refer to the following Kubernetes documentation for information about the readiness and liveness checks:

* [Pod Lifecycle](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/)
* [Configure Liveness and Readiness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-probes/)

<a name="lightship-behaviour-local-mode"></a>
### Local-mode

If Lightship detects that it is running in a non-Kubernetes environment (e.g. your local machine) then it starts the HTTP service on any available HTTP port. This is done to avoid port collision when multiple services using Lightship are being developed on the same machine. This behaviour can be changed using `detectKubernetes` and `port` configuration.

<a name="lightship-behaviour-health"></a>
### <code>/health</code>

`/health` endpoint describes the current state of a Node.js service.

The endpoint responds:

* `200` status code, message "SERVER_IS_READY" when server is accepting new connections.
* `500` status code, message "SERVER_IS_NOT_READY" when server is initialising.
* `500` status code, message "SERVER_IS_SHUTTING_DOWN" when server is shutting down.

Used for human inspection.

<a name="lightship-behaviour-live"></a>
### <code>/live</code>

The endpoint responds:

* `200` status code, message "SERVER_IS_NOT_SHUTTING_DOWN".
* `500` status code, message "SERVER_IS_SHUTTING_DOWN".

Used to configure liveness probe.

<a name="lightship-behaviour-ready"></a>
### <code>/ready</code>

The endpoint responds:

* `200` status code, message "SERVER_IS_READY".
* `500` status code, message "SERVER_IS_NOT_READY".

Used to configure readiness probe.

<a name="lightship-behaviour-timeouts"></a>
### Timeouts

Lightship has two timeout configurations: `gracefulShutdownTimeout` and `shutdownHandlerTimeout`.

`gracefulShutdownTimeout` (default: 60 seconds) is a number of milliseconds Lightship waits for Node.js process to exit gracefully after it receives a shutdown signal (either via `process` or by calling `lightship.shutdown()`) before killing the process using `process.exit(1)`. This timeout should be sufficiently big to allow Node.js process to complete tasks (if any) that are active at the time that the shutdown signal is received (e.g. complete serving responses to all HTTP requests) (Note: You must explicitly inform Lightship about active tasks using [beacons](#beacons)).

`shutdownHandlerTimeout` (default: 5 seconds) is a number of milliseconds Lightship waits for shutdown handlers (see `registerShutdownHandler`) to complete before killing the process using `process.exit(1)`.

If after all beacons are dead and all shutdown handlers are resolved Node.js process does not exit gracefully, then Lightship will force terminate the process with an error. Refer to [How to detect what is holding the Node.js process alive?](#lightship-faq-how-to-detect-what-is-holding-the-node-js-process-alive).

<a name="lightship-usage"></a>
## Usage

Use `createLightship` to create an instance of Lightship.

```js
import {
  createLightship
} from 'lightship';

const configuration: ConfigurationInput = {};

const lightship: Lightship = createLightship(configuration);

```

The following types describe the configuration shape and the resulting Lightship instance interface.

```js
/**
 * A teardown function called when shutdown is initialized.
 */
type ShutdownHandler = () => Promise<void> | void;

/**
 * @property detectKubernetes Run Lightship in local mode when Kubernetes is not detected. Default: true.
 * @property gracefulShutdownTimeout A number of milliseconds before forcefull termination if process does not gracefully exit. The timer starts when `lightship.shutdown()` is called. This includes the time allowed to live beacons. Default: 60000.
 * @property port The port on which the Lightship service listens. This port must be different than your main service port, if any. The default port is 9000.
 * @property shutdownDelay Delays the shutdown handler by X milliseconds. This value should match `readinessProbe.periodSeconds`. Default 5000.
 * @property shutdownHandlerTimeout A number of milliseconds before forcefull termination if shutdown handlers do not complete. The timer starts when the first shutdown handler is called. Default: 5000.
 * @property signals An a array of [signal events]{@link https://nodejs.org/api/process.html#process_signal_events}. Default: [SIGTERM].
 * @property terminate Method used to terminate Node.js process. Default: `() => { process.exit(1) };`.
 */
export type ConfigurationInput = {|
  +detectKubernetes?: boolean,
  +gracefulShutdownTimeout?: number,
  +port?: number,
  +shutdownDelay?: number,
  +shutdownHandlerTimeout?: number,
  +signals?: $ReadOnlyArray<string>,
  +terminate?: () => void,
|};

/**
 * @property queueBlockingTask Forces service state to SERVER_IS_NOT_READY until all promises are resolved.
 * @property registerShutdownHandler Registers teardown functions that are called when shutdown is initialized. All registered shutdown handlers are executed in the order they have been registered. After all shutdown handlers have been executed, Lightship asks `process.exit()` to terminate the process synchronously.
 * @property shutdown Changes server state to SERVER_IS_SHUTTING_DOWN and initialises the shutdown of the application.
 * @property signalNotReady Changes server state to SERVER_IS_NOT_READY.
 * @property signalReady Changes server state to SERVER_IS_READY.
 * @property whenFirstReady Resolves the first time the service goes from `SERVER_IS_NOT_READY` to `SERVER_IS_READY` state.
 */
type Lightship = {|
  +createBeacon: (context?: BeaconContext) => BeaconController,
  +isServerReady: () => boolean,
  +isServerShuttingDown: () => boolean,
  +queueBlockingTask: (blockingTask: Promise<any>) => void,
  +registerShutdownHandler: (shutdownHandler: ShutdownHandler) => void,
  +server: http$Server,
  +shutdown: () => Promise<void>,
  +signalNotReady: () => void,
  +signalReady: () => void,
  +whenFirstReady: () => Promise<void>,
|};

```

<a name="lightship-usage-kubernetes-container-probe-configuration"></a>
### Kubernetes container probe configuration

This is an example of a reasonable [container probe](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#container-probes) configuration to use with Lightship.

```yaml
readinessProbe:
  httpGet:
    path: /ready
    port: 9000
  failureThreshold: 1
  initialDelaySeconds: 5
  periodSeconds: 5
  successThreshold: 1
  timeoutSeconds: 5
livenessProbe:
  httpGet:
    path: /live
    port: 9000
  failureThreshold: 3
  initialDelaySeconds: 10
  # Allow sufficient amount of time (90 seconds = periodSeconds * failureThreshold)
  # for the registered shutdown handlers to run to completion.
  periodSeconds: 30
  successThreshold: 1
  # Setting a very low timeout value (e.g. 1 second) can cause false-positive
  # checks and service interruption.
  timeoutSeconds: 5

# As per Kubernetes documentation (https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#when-should-you-use-a-startup-probe),
# startup probe should point to the same endpoint as the liveness probe.
#
# Startup probe is only needed when container is taking longer to start than
# `initialDelaySeconds + failureThreshold × periodSeconds` of the liveness probe.
startupProbe:
  httpGet:
    path: /live
    port: 9000
  failureThreshold: 3
  initialDelaySeconds: 10
  periodSeconds: 30
  successThreshold: 1
  timeoutSeconds: 5

```

<a name="lightship-usage-logging"></a>
### Logging

`lightship` is using [Roarr](https://github.com/gajus/roarr) to implement logging.

Set `ROARR_LOG=true` environment variable to enable logging.

<a name="lightship-usage-queueing-service-blocking-tasks"></a>
### Queueing service blocking tasks

Your service may not be ready until some asynchronous operation is complete, e.g. waiting for [`webpack-dev-middleware#waitUntilValid`](https://github.com/webpack/webpack-dev-middleware#waituntilvalidcallback). In this case, use `queueBlockingTask` to queue blocking tasks. This way, Lightship status will be set to `SERVER_IS_NOT_READY` until all blocking tasks are resolved (and `signalReady` has been called).

```js
import express from 'express';
import {
  createLightship
} from 'lightship';

const lightship = createLightship();

lightship.queueBlockingTask(new Promise((resolve) => {
  setTimeout(() => {
    // Lightship service status will be `SERVER_IS_NOT_READY` until all promises
    // submitted to `queueBlockingTask` are resolved.
    resolve();
  }, 1000);
}));

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const server = app.listen(8080, () => {
  // All signals will be queued until after all blocking tasks are resolved.
  lightship.signalReady();
});

```

<a name="lightship-usage-waiting-for-the-server-to-become-ready"></a>
### Waiting for the server to become ready

`whenFirstReady` can be used to wait until the first time the service becomes ready.

The promise returned by `whenFirstReady` is resolved only once. Use this function to delay execution of tasks that depend on the server to be ready.

```js
import express from 'express';
import {
  createLightship
} from 'lightship';

const lightship = createLightship();

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const server = app.listen(8080, () => {
  lightship.signalReady();
});

(async () => {
  // `whenFirstReady` returns a promise that is resolved the first time that
  // the service goes from `SERVER_IS_NOT_READY` to `SERVER_IS_READY` state.
  await lightship.whenFirstReady();

  await runIntegrationTests();
})();

```

<a name="lightship-usage-examples"></a>
## Usage examples

<a name="lightship-usage-examples-using-with-express-js"></a>
### Using with Express.js

Suppose that you have Express.js application that simply respond "Hello, World!".

```js
import express from 'express';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

app.listen(8080);

```

To create a liveness and readiness check, simply create an instance of Lightship and use `registerShutdownHandler` to register a server shutdown handler, e.g.

```js
import express from 'express';
import {
  createLightship
} from 'lightship';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const server = app
  .listen(8080, () => {
    // Lightship default state is "SERVER_IS_NOT_READY". Therefore, you must signal
    // that the server is now ready to accept connections.
    lightship.signalReady();
  })
  .on('error', () => {
    lightship.shutdown();
  });;

const lightship = createLightship();

lightship.registerShutdownHandler(() => {
  server.close();
});

```

Suppose that a requirement has been added that you need to ensure that you do not say "Hello, World!" more often than 100 times per minute.

Use `signalNotReady` method to change server state to "SERVER_IS_NOT_READY" and use `signalReady` to revert the server state to "SERVER_IS_READY".

```js
import express from 'express';
import {
  createLightship
} from 'lightship';

const app = express();

const minute = 60 * 1000;

let runningTotal = 0;

app.get('/', (req, res) => {
  runningTotal++;

  setTimeout(() => {
    runningTotal--;

    if (runningTotal < 100) {
      lightship.signalReady();
    } else {
      lightship.signalNotReady();
    }
  }, minute);

  res.send('Hello, World!');
});

const server = app.listen(8080);

const lightship = createLightship();

lightship.registerShutdownHandler(() => {
  server.close();
});

// Lightship default state is "SERVER_IS_NOT_READY". Therefore, you must signal
// that the server is now ready to accept connections.
lightship.signalReady();

```

How quick Kubernetes observes that the server state has changed depends on the [probe configuration](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-probes/#configure-probes), specifically `periodSeconds`, `successThreshold`
 and `failureThreshold`, i.e. expect requests to continue coming through for a while after the server state has changed.

Suppose that a requirement has been added that the server must shutdown after saying "Hello, World!" 1000 times.

Use `shutdown` method to change server state to "SERVER_IS_SHUTTING_DOWN", e.g.

```js
import express from 'express';
import delay from 'delay';
import {
  createLightship
} from 'lightship';

const app = express();

const minute = 60 * 1000;

let total = 0;
let runningTotal = 0;

app.get('/', (req, res) => {
  total++;
  runningTotal++;

  if (total === 1000) {
    lightship.shutdown();
  }

  setTimeout(() => {
    runningTotal--;

    if (runningTotal < 100) {
      lightship.signalReady();
    } else {
      lightship.signalNotReady();
    }
  }, minute);

  res.send('Hello, World!');
});

const server = app.listen(8080);

const lightship = createLightship();

lightship.registerShutdownHandler(async () => {
  // Allow sufficient amount of time to allow all of the existing
  // HTTP requests to finish before terminating the service.
  await delay(minute);

  server.close();
});

// Lightship default state is "SERVER_IS_NOT_READY". Therefore, you must signal
// that the server is now ready to accept connections.
lightship.signalReady();

```

Do not call `process.exit()` in a shutdown handler – Lighthouse calls `process.exit()` after all registered shutdown handlers have run to completion.

If for whatever reason a registered shutdown handler hangs, then (subject to the Pod's [restart policy](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#restart-policy)) Kubernetes will forcefully restart the Container after the `livenessProbe` deems the service to be failed.

<a name="lightship-usage-examples-beacons"></a>
### Beacons

Beacons are used to delay the registered shutdown handler routine.

A beacon can be created using `createBeacon()` method, e.g.

```js
const lightship = createLightship();

const beacon = lightship.createBeacon();

```

Beacon is live upon creation. Shutdown handlers are suspended until there are no live beacons.

To signal that a beacon is dead, use `die()` method:

```js
beacon.die();
// This beacon is now dead.

```

After beacon has been killed, it cannot be revived again.

Use beacons to suspend the registered shutdown handler routine when you are processing a job queue, e.g.

```js
for (const job of jobs) {
  if (lightship.isServerShuttingDown()) {
    log.info('detected that the service is shutting down; terminating the event loop');

    break;
  }

  const beacon = lightship.createBeacon();

  // Do the job.

  await beacon.die();
}

```

Additionally, you can provide beacons with context, e.g.

```js
for (const job of jobs) {
  if (lightship.isServerShuttingDown()) {
    log.info('detected that the service is shutting down; terminating the event loop');

    break;
  }

  const beacon = lightship.createBeacon({
    jobId: job.id
  });

  // Do the job.

  await beacon.die();
}

```

The logs will include messages describing the beacons that are holding the connection, e.g.

```json
{"context":{"package":"lightship","namespace":"factories/createLightship","logLevel":30,"beacons":[{"context":{"id":1}}]},"message":"program termination is on hold because there are live beacons","sequence":2,"time":1563892493825,"version":"1.0.0"}

```

<a name="lightship-best-practices"></a>
## Best practices

<a name="lightship-best-practices-add-a-delay-before-stop-handling-incoming-requests"></a>
### Add a delay before stop handling incoming requests

It is important that you do not cease to handle new incoming requests immediatelly after receiving the shutdown signal. This is because there is a high probability of the SIGTERM signal being sent well before the iptables rules are updated on all nodes. The result is that the pod may still receive client requests after it has received the termination signal. If the app stops accepting connections immediately, it causes clients to receive "connection refused" types of errors.

Properly shutting down an application includes these steps:

1. Wait for a few seconds, then stop accepting new connections,
2. Close all keep-alive connections that aren't in the middle of a request,
3. Wait for all active requests to finish, and then
4. Shut down completely.

See [Handling Client Requests Properly with Kubernetes](https://web.archive.org/web/20200807161820/https://freecontent.manning.com/handling-client-requests-properly-with-kubernetes/) for more information.

<a name="lightship-faq"></a>
## FAQ

<a name="lightship-faq-what-is-the-reason-that-my-liveness-readiness-endpoints-are-intermittently-failing"></a>
### What is the reason that my liveness/ readiness endpoints are intermittently failing?

You may discover that your service health checks are failing intermittently, e.g.

```
Warning  Unhealthy  4m17s (x3 over 4m27s)   kubelet, f95a4d94-jwfr  Liveness probe failed: Get http://10.24.7.155:9000/live: net/http: request canceled (Client.Timeout exceeded while awaiting headers)
Warning  Unhealthy  3m28s (x15 over 4m38s)  kubelet, f95a4d94-jwfr  Readiness probe failed: Get http://10.24.7.155:9000/ready: net/http: request canceled (Client.Timeout exceeded while awaiting headers)

```

This may happen if you are perfoming [event-loop blocking tasks](https://nodejs.org/ru/docs/guides/dont-block-the-event-loop/) for extended durations, e.g.

```js
const startTime = Date.now();

let index0 = 1000;

while (index0--) {
  let index1 = 1000;

  while (index1--) {
    console.log(index0 + ':' + index1);
  }
}

console.log(Date.now() - startTime);

```

If executed, the above operation would block the event-loop for couple of seconds (e.g. 8 seconds on my machine). During this time Lightship is going to be unresponsive.

Your options are:

* Use [`worker_threads`](https://nodejs.org/api/worker_threads.html) to execute the event-loop blocking task in the background.
* Refactor the code into [synchronous chunks](https://nodejs.org/ru/docs/guides/dont-block-the-event-loop/).

<a name="lightship-faq-what-is-the-reason-for-having-separate-live-and-ready-endpoints"></a>
### What is the reason for having separate <code>/live</code> and <code>/ready</code> endpoints?

Distinct endpoints are needed if you want your Container to be able to take itself down for maintenance (as done in the [Using with Express.js](#lightship-usage-examples-using-with-express-js) usage example). Otherwise, you can use `/health`.

<a name="lightship-faq-how-to-detect-what-is-holding-the-node-js-process-alive"></a>
### How to detect what is holding the Node.js process alive?

You may get a log message saying that your process did not exit on its own, e.g.

```
[2019-11-10T21:11:45.452Z] DEBUG (20) (@lightship) (#factories/createLightship): all shutdown handlers have run to completion; proceeding to terminate the Node.js process
[2019-11-10T21:11:46.455Z] WARN (40) (@lightship) (#factories/createLightship): process did not exit on its own; investigate what is keeping the event loop active

```

This means that there is some work that is scheduled to happen (e.g. a referenced `setTimeout`).

In order to understand what is keeping your Node.js process from exiting on its own, you need to identify all active handles and requests. This can be done with a help of utilities such as [`wtfnode`](https://www.npmjs.com/package/wtfnode) and [`why-is-node-running`](https://www.npmjs.com/package/why-is-node-running), e.g.

```js
import whyIsNodeRunning from 'why-is-node-running';
import express from 'express';
import {
  createLightship
} from 'lightship';

const app = express();

app.get('/', (req, res) => {
  res.send('Hello, World!');
});

const server = app.listen(8080);

const lightship = createLightship();

lightship.registerShutdownHandler(() => {
  server.close();

  whyIsNodeRunning();
});

lightship.signalReady();

```

In the above example, calling `whyIsNodeRunning` will print a list of all active handles that are keeping the process alive.

<a name="lightship-related-projects"></a>
## Related projects

* [Iapetus](https://github.com/gajus/iapetus) – Prometheus metrics server.
* [Preoom](https://github.com/gajus/preoom) – Retrieves & observes Kubernetes Pod resource (CPU, memory) utilisation.
