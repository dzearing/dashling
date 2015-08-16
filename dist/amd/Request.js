define(["require", "exports", './DashlingEnums', './EventGroup'], function (require, exports, DashlingEnums_1, EventGroup_1) {
    var Request = (function () {
        function Request(options, settings) {
            this._options = options;
            this._settings = settings;
            this.state = DashlingEnums_1.DashlingRequestState.idle;
            this.data = null;
            this.timeToFirstByte = -1;
            this.timeToLastByte = -1;
            this.statusCode = '';
            this.progressEvents = [];
            this.bytesLoaded = 0;
            this.bytesPerMillisecond = 0;
            this._events = new EventGroup_1.default(this);
            this._isAborted = false;
            this._requestAttempt = 0;
            this._xhrType = XMLHttpRequest;
        }
        Request.prototype.dispose = function () {
            if (this._xhr) {
                this.state = DashlingEnums_1.DashlingRequestState.aborted;
                this._isAborted = true;
                this._xhr.abort();
                this._xhr = null;
            }
            if (this._retryTimeoutId) {
                clearTimeout(this._retryTimeoutId);
                this._retryTimeoutId = null;
            }
            if (this._events) {
                this._events.dispose();
                this._events = null;
            }
        };
        Request.prototype.start = function () {
            var _this = this;
            var _a = this._options, url = _a.url, isArrayBuffer = _a.isArrayBuffer;
            var xhr = this._xhr = new this._xhrType();
            var startTime = this._startTime = new Date().getTime();
            this._requestAttempt++;
            xhr.open("GET", url, true);
            if (isArrayBuffer) {
                xhr.responseType = "arraybuffer";
            }
            xhr.timeout = this._settings.requestTimeout;
            // When readystate updates, update timeToFirstByte.
            xhr.onreadystatechange = function () {
                if (xhr.readyState > 0 && _this.timeToFirstByte < 0) {
                    _this.timeToFirstByte = (new Date().getTime() - startTime);
                }
            };
            // When progress is reported, push an event to progress events.
            xhr.onprogress = function (ev) {
                _this.progressEvents.push({
                    timeFromStart: new Date().getTime() - startTime,
                    bytesLoaded: ev.lengthComputable ? ev.loaded : -1
                });
                _this._postProgress();
            };
            // When the request has ended, parse the response and determine what to do next.
            xhr.onloadend = function () {
                _this._processResult();
            };
            this.state = DashlingEnums_1.DashlingRequestState.downloading;
            xhr.send();
        };
        Request.prototype._processResult = function () {
            var xhr = this._xhr;
            var progressEvents = this.progressEvents;
            var isArrayBuffer = this._options.isArrayBuffer;
            this._xhr = null;
            this.timeToLastByte = new Date().getTime() - this._startTime;
            if (xhr.status >= 200 && xhr.status <= 299) {
                this.bytesLoaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText ? xhr.responseText.length : 0;
                // Ensure we've recorded first byte time.
                xhr.onreadystatechange(null);
                // Update progress.
                this._postProgress(true);
                if (progressEvents.length > 2) {
                    var lastEvent = progressEvents[progressEvents.length - 1];
                    var firstEvent = progressEvents[0];
                    var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
                    var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;
                    this.bytesPerMillisecond = bytesLoaded / timeDifference;
                    this.timeToFirstByte = this.timeToLastByte - (this.bytesLoaded / this.bytesPerMillisecond);
                }
                this.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
                this.statusCode = String(xhr.status);
                this.state = DashlingEnums_1.DashlingRequestState.downloaded;
                if (this._options.onSuccess) {
                    this._options.onSuccess(this);
                }
            }
            else {
                this._processError(xhr);
            }
            if (this.state !== DashlingEnums_1.DashlingRequestState.downloading) {
                this._events.raise(Request.CompleteEvent);
            }
        };
        Request.prototype._processError = function (xhr) {
            var _this = this;
            var isTimedOut = (xhr.status === 0 && this.timeToLastByte >= this._settings.requestTimeout);
            var isRetriable = !this._isAborted && xhr.status !== 404 && this._requestAttempt < this._settings.maxRetries;
            var delaysBetweenRetries = this._settings.delaysBetweenRetries;
            if (isRetriable) {
                var timeToWait = delaysBetweenRetries[this._requestAttempt - 1] || delaysBetweenRetries[delaysBetweenRetries.length - 1];
                this._retryTimeoutId = setTimeout(function () { _this.start(); }, timeToWait);
            }
            else {
                this.state = DashlingEnums_1.DashlingRequestState.error;
                this.statusCode = this._isAborted ? 'aborted' : isTimedOut ? 'timeout' : String(xhr.status);
                //this.hasError = true;
                if (this._options.onError) {
                    this._options.onError(this);
                }
            }
        };
        Request.prototype._postProgress = function (isComplete) {
            var progressEvents = this.progressEvents;
            if (progressEvents.length > 2) {
                var lastEvent = progressEvents[progressEvents.length - 1];
                var firstEvent = progressEvents[0];
                var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;
                if (bytesLoaded > 10000) {
                    var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
                    if (timeDifference > 5) {
                        this._events.raise(Request.BandwidthUpdateEvent, (bytesLoaded * 1000) / timeDifference);
                    }
                }
            }
        };
        Request.BandwidthUpdateEvent = 'bandwidthupdate';
        Request.CompleteEvent = 'complete';
        return Request;
    })();
    exports.default = Request;
});
