define(["require", "exports", './MetricSet', './Request', './DashlingEnums', './EventGroup'], function (require, exports, MetricSet_1, Request_1, DashlingEnums_1, EventGroup_1) {
    var _requestIndex = 0;
    /** RequestManager is responsible for a few things:
     *  1. Creates Request objects for the caller and observes their progress.
     *  2. Exposes methods for accessing metrics gather from the requests going through it.
     *  3. Exposes a dispose which will abort all pending requests.
     */
    var RequestManager = (function () {
        function RequestManager(settings) {
            this._settings = settings;
            this._events = new EventGroup_1.default(this);
            this._activeRequests = {};
            this.waitTimes = new MetricSet_1.default(20);
            this.receiveTimes = new MetricSet_1.default(20);
            this.bytesPerSeconds = new MetricSet_1.default(20);
            this._activeRequestCount = 0;
        }
        RequestManager.prototype.dispose = function () {
            this.abortAll();
            this._events.dispose();
        };
        RequestManager.prototype.getActiveRequestCount = function () {
            return this._activeRequestCount;
        };
        RequestManager.prototype.abortAll = function () {
            for (var key in this._activeRequests) {
                this._activeRequests[key].dispose();
            }
            this._events.off();
            this._activeRequests = {};
        };
        RequestManager.prototype.start = function (request) {
            var _this = this;
            this._activeRequests[_requestIndex++] = request;
            this._activeRequestCount++;
            // Observe bandwidth notifications.
            this._events.on(request, Request_1.default.BandwidthUpdateEvent, function (bytesPerSecond) {
                _this.bytesPerSeconds.addMetric(bytesPerSecond);
            });
            // Observe request completion.
            this._events.on(request, Request_1.default.CompleteEvent, function () {
                _this._activeRequestCount--;
                _this._events.off(request);
                // Trace wait/receive times, but don't track for errors and cache hits.
                if (request.state === DashlingEnums_1.DashlingRequestState.downloaded && request.timeToLastByte > _this._settings.requestCacheThreshold) {
                    _this.waitTimes.addMetric(request.timeToFirstByte);
                    _this.receiveTimes.addMetric(request.timeToLastByte);
                }
            });
            // Start request.
            request.start();
        };
        // TODO: don't need these if MetricSets are being publicly exposed.
        RequestManager.prototype.getAverageWait = function () {
            return this.waitTimes.average || 0;
        };
        RequestManager.prototype.getAverageReceive = function () {
            return this.receiveTimes.average || 0;
        };
        RequestManager.prototype.getAverageBytesPerSecond = function () {
            return this.bytesPerSeconds.average || 0;
        };
        RequestManager.DownloadEvent = 'download';
        return RequestManager;
    })();
    exports.default = RequestManager;
});
