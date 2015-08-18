import Settings from './Settings';
import MetricSet from './MetricSet';
import Request from './Request';
/** RequestManager is responsible for a few things:
 *  1. Creates Request objects for the caller and observes their progress.
 *  2. Exposes methods for accessing metrics gather from the requests going through it.
 *  3. Exposes a dispose which will abort all pending requests.
 */
export default class RequestManager {
    waitTimes: MetricSet;
    receiveTimes: MetricSet;
    bytesPerSeconds: MetricSet;
    private _settings;
    private _activeRequests;
    private _events;
    private _activeRequestCount;
    constructor(settings: Settings);
    dispose(): void;
    getActiveRequestCount(): number;
    abortAll(): void;
    start(request: Request): void;
    getAverageWait(): number;
    getAverageReceive(): number;
    getAverageBytesPerSecond(): number;
}
