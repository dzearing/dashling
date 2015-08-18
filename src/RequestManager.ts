import Settings from './Settings';
import Utilities from './Utilities';
import MetricSet from './MetricSet';
import Request, { IRequestOptions } from './Request';
import { DashlingEvent, DashlingRequestState } from './DashlingEnums';
import EventGroup from './EventGroup';

let _requestIndex = 0;

/** RequestManager is responsible for a few things:
 *  1. Creates Request objects for the caller and observes their progress.
 *  2. Exposes methods for accessing metrics gather from the requests going through it.
 *  3. Exposes a dispose which will abort all pending requests.
 */
export default class RequestManager {
  public waitTimes: MetricSet;
  public receiveTimes: MetricSet;
  public bytesPerSeconds: MetricSet;

  private _settings: Settings;
  private _activeRequests: { [key: string]: Request };

  private _events: EventGroup;
  private _activeRequestCount: number;

  constructor(settings: Settings) {
    this._settings = settings;
    this._events = new EventGroup(this);
    this._activeRequests = {};

    this.waitTimes = new MetricSet(20);
    this.receiveTimes = new MetricSet(20);
    this.bytesPerSeconds = new MetricSet(20);

    this._activeRequestCount = 0;
  }

  public dispose() {
    this.abortAll();
    this._events.dispose();
  }

  public getActiveRequestCount() {
    return this._activeRequestCount;
  }

  public abortAll() {
    for (let key in this._activeRequests) {
      this._activeRequests[key].dispose();
    }
    this._events.off();
    this._activeRequests = {};
  }

  public start(request: Request) {
    this._activeRequests[_requestIndex++] = request;
    this._activeRequestCount++;

    // Observe bandwidth notifications.
    this._events.on(request, Request.BandwidthUpdateEvent, (bytesPerSecond: number) => {
      this.bytesPerSeconds.addMetric(bytesPerSecond);
    });

    // Observe request completion.
    this._events.on(request, Request.CompleteEvent, () => {
      this._activeRequestCount--;
      this._events.off(request);

      // Trace wait/receive times, but don't track for errors and cache hits.
      if (request.state === DashlingRequestState.downloaded) {
        let isFromCache = request.timeAtLastByte > this._settings.requestCacheThreshold;

        if (!isFromCache) {
          this.waitTimes.addMetric(request.timeAtFirstByte);
          this.receiveTimes.addMetric(request.timeAtLastByte);
        }

        this._events.raise(DashlingEvent.download, request);
      }
    });

    // Start request.
    request.start();
  }

  // TODO: don't need these if MetricSets are being publicly exposed.
  public getAverageWait() {
    return this.waitTimes.average || 0;
  }

  public getAverageReceive() {
    return this.receiveTimes.average || 0;
  }

  public getAverageBytesPerSecond() {
    return this.bytesPerSeconds.average || 0;
  }
}

