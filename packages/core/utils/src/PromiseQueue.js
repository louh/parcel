// @flow strict-local

import {makeDeferredWithPromise, type Deferred} from './Deferred';

type PromiseQueueOpts = {
  maxConcurrent: number
};

export default class PromiseQueue {
  _deferred: ?Deferred<void>;
  _maxConcurrent: number;
  _numRunning: number = 0;
  _queue: Array<() => Promise<mixed>> = [];
  _runPromise: ?Promise<void> = null;

  constructor(opts: PromiseQueueOpts = {maxConcurrent: Infinity}) {
    if (opts.maxConcurrent <= 0) {
      throw new TypeError('maxConcurrent must be a positive, non-zero value');
    }

    this._maxConcurrent = opts.maxConcurrent;
  }

  add(fn: () => Promise<mixed>): void {
    return new Promise((resolve, reject) => {
      let wrapped = () =>
        fn().then(
          result => resolve(result),
          err => {
            reject(err);
            throw err;
          }
        );

      this._queue.push(wrapped);
    });
  }

  run(): Promise<void> {
    if (this._runPromise != null) {
      return this._runPromise;
    }

    if (this._queue.length === 0) {
      return Promise.resolve();
    }

    let {deferred, promise} = makeDeferredWithPromise();
    this._deferred = deferred;
    this._runPromise = promise;

    while (this._queue.length && this._numRunning < this._maxConcurrent) {
      this._next();
    }

    return promise;
  }

  async _next(): Promise<void> {
    let fn = this._queue.shift();
    await this._runFn(fn);
    if (this._queue.length) {
      this._next();
    } else if (this._numRunning === 0) {
      this._resolve();
    }
  }

  async _runFn(fn: () => mixed): Promise<void> {
    this._numRunning++;
    try {
      await fn();
      this._numRunning--;
    } catch (e) {
      this._reject(e);
      // rejecting resets state so numRunning is reset to 0 here
    }
  }

  _resetState(): void {
    this._queue = [];
    this._runPromise = null;
    this._numRunning = 0;
    this._deferred = null;
  }

  _reject(err: mixed): void {
    if (this._deferred != null) {
      this._deferred.reject(err);
    }
    this._resetState();
  }

  _resolve(): void {
    if (this._deferred != null) {
      this._deferred.resolve();
    }
    this._resetState();
  }
}
