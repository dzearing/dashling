define(["require", "exports", './RequestManager', './Request', './EventGroup', './Utilities', './Async', './MetricSet', './DashlingEnums'], function (require, exports, RequestManager_1, Request_1, EventGroup_1, Utilities_1, Async_1, MetricSet_1, DashlingEnums_1) {
    var BANDWIDTH_LOCAL_STORAGE_KEY = 'Dashling.Stream.bytesPerSecond';
    var Stream = (function () {
        function Stream(streamType, mediaSource, videoElement, settings) {
            var _this = this;
            var streamInfo = settings.manifest.streams[streamType];
            var fragmentCount = streamInfo.timeline.length;
            _this._events = new EventGroup_1.default(_this);
            _this._async = new Async_1.default(_this);
            _this.fragments = [];
            _this.streamType = streamType;
            _this.qualityIndex = Math.max(0, Math.min(streamInfo.qualities.length - 1, settings.targetQuality[streamType]));
            _this.bufferRate = new MetricSet_1.default(5);
            _this._startTime = new Date().getTime();
            _this._appendLength = 0;
            _this._appendTimeoutId = 0;
            _this._initializedQualityIndex = -1;
            _this._initRequestManager = new RequestManager_1.default(settings);
            _this._requestManager = new RequestManager_1.default(settings);
            _this._mediaSource = mediaSource;
            _this._videoElement = videoElement;
            _this._settings = settings;
            _this._manifest = settings.manifest;
            _this._streamInfo = streamInfo;
            _this._buffer = null;
            _this._hasInitializedBuffer = false;
            _this._initSegments = [];
            for (var i = 0; i < fragmentCount; i++) {
                _this.fragments.push({
                    state: DashlingEnums_1.DashlingRequestState.idle,
                    qualityIndex: -1,
                    qualityId: '',
                    requestType: 'media',
                    fragmentIndex: i,
                    time: streamInfo.timeline[i],
                    activeRequest: null,
                    requests: []
                });
            }
            var _forwardDownloadEvent = function (request) {
                _this._events.raise(DashlingEnums_1.DashlingEvent.download, request);
            };
            _this._events.on(_this._requestManager, DashlingEnums_1.DashlingEvent.download, _forwardDownloadEvent);
            _this._events.on(_this._initRequestManager, DashlingEnums_1.DashlingEvent.download, _forwardDownloadEvent);
        }
        Stream.prototype.dispose = function () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                this._events.dispose();
                this._async.dispose();
                this._requestManager.dispose();
                this._initRequestManager.dispose();
            }
        };
        Stream.prototype.initialize = function () {
            var bufferType = this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs;
            if (!this._buffer) {
                try {
                    Utilities_1.default.log("Creating " + bufferType + " buffer", this._settings);
                    this._buffer = this._mediaSource.addSourceBuffer(bufferType);
                }
                catch (e) {
                    this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                        state: DashlingEnums_1.DashlingSessionState.error,
                        errorType: DashlingEnums_1.DashlingError.sourceBufferInit,
                        errorMessage: "type=" + bufferType + " error=" + e
                    });
                }
            }
        };
        Stream.prototype.abortAll = function () {
            this._initRequestManager.abortAll();
            this._requestManager.abortAll();
        };
        Stream.prototype.clearBuffer = function () {
            // Any pending async appends should be cleared/canceled before clearing the buffer.
            clearTimeout(this._appendTimeoutId);
            this._isAppending = false;
            this.abortAll();
            try {
                this._buffer.remove(0, this._videoElement.duration);
            }
            catch (e) { }
            for (var _i = 0, _a = this.fragments; _i < _a.length; _i++) {
                var fragment = _a[_i];
                if (fragment.state !== DashlingEnums_1.DashlingRequestState.downloaded) {
                    fragment.state = DashlingEnums_1.DashlingRequestState.idle;
                }
            }
        };
        Stream.prototype.canAppend = function (fragmentIndex) {
            var fragment = this.fragments[fragmentIndex];
            var initSegment = fragment ? this._initSegments[fragment.qualityIndex] : null;
            var maxInitSegment = this._initSegments[this._streamInfo.qualities.length - 1];
            return fragment && fragment.state == DashlingEnums_1.DashlingRequestState.downloaded &&
                initSegment && initSegment.state >= DashlingEnums_1.DashlingRequestState.downloaded &&
                maxInitSegment && maxInitSegment.state >= DashlingEnums_1.DashlingRequestState.downloaded;
        };
        Stream.prototype.append = function (fragmentIndex, onComplete) {
            var _this = this;
            var fragment = _this.fragments[fragmentIndex];
            var maxQualityIndex = _this._streamInfo.qualities.length - 1;
            var fragmentsToAppend = [];
            var buffer = _this._buffer;
            if (!_this._isAppending && fragment && fragment.state === DashlingEnums_1.DashlingRequestState.downloaded) {
                // We only append one segment at a time.
                _this._isAppending = true;
                fragment.state = DashlingEnums_1.DashlingRequestState.appending;
                // On first time initialization, add the top quality init segment.
                if (!this._hasInitializedBuffer) {
                    this._hasInitializedBuffer = true;
                    if (maxQualityIndex > fragment.qualityIndex) {
                        fragmentsToAppend.push(_this._initSegments[maxQualityIndex]);
                    }
                }
                // append initsegment if changing qualities.
                //if (_this._initializedQualityIndex != fragment.qualityIndex) {
                fragmentsToAppend.push(_this._initSegments[fragment.qualityIndex]);
                //}
                fragmentsToAppend.push(fragment.activeRequest);
                _appendNextEntry();
            }
            function _appendNextEntry() {
                if (!_this._isDisposed) {
                    // Gaurd against buffer clearing and appending too soon afterwards.
                    if (_this._buffer.updating) {
                        _this._appendTimeoutId = setTimeout(_appendNextEntry, 10);
                    }
                    else {
                        var request = fragmentsToAppend[0];
                        if (fragmentsToAppend.length) {
                            buffer.addEventListener("update", _onAppendComplete);
                            try {
                                Utilities_1.default.log("Append started: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
                                buffer.appendBuffer(request.data);
                            }
                            catch (e) {
                                _onAppendError(DashlingEnums_1.DashlingError.sourceBufferAppendException, e);
                            }
                        }
                        else {
                            // We need to give a small slice of time because the video's buffered region doesn't update immediately after
                            // append is complete.
                            _this._appendTimeoutId = setTimeout(function () {
                                if (!_this._isDisposed) {
                                    fragment.state = DashlingEnums_1.DashlingRequestState.appended;
                                    _this._isAppending = false;
                                    if (_this.isMissing(fragmentIndex, _this._videoElement.currentTime)) {
                                        _onAppendError(DashlingEnums_1.DashlingError.sourceBufferAppendMissing, "Buffer missing appended fragment");
                                    }
                                    else {
                                        var timeSinceStart = (new Date().getTime() - _this._startTime) / 1000;
                                        _this._appendLength += fragment.time.lengthSeconds;
                                        _this.bufferRate.addMetric(_this._appendLength / timeSinceStart);
                                        onComplete(fragment);
                                    }
                                }
                            }, 30);
                        }
                    }
                }
            }
            function _onAppendComplete() {
                if (!_this._isDisposed) {
                    var request = fragmentsToAppend[0];
                    buffer.removeEventListener("update", _onAppendComplete);
                    request.timeAtAppended = new Date().getTime() - request.startTime;
                    request.state = DashlingEnums_1.DashlingRequestState.appended;
                    if (request.clearDataAfterAppend) {
                        request.data = null;
                    }
                    if (request.requestType === "init") {
                        _this._initializedQualityIndex = request.qualityIndex;
                    }
                    Utilities_1.default.log("Append complete: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
                    fragmentsToAppend.shift();
                    _appendNextEntry();
                }
            }
            function _onAppendError(errorType, errorMessage) {
                errorMessage = errorMessage || "";
                var statusCode = "error=" + errorMessage + " (quality=" + fragment.qualityId + (fragment.fragmentIndex !== undefined ? " index=" + fragment.fragmentIndex : "") + ")";
                fragment.state = DashlingEnums_1.DashlingRequestState.error;
                _this._isAppending = false;
                Utilities_1.default.log("Append exception: " + statusCode);
                _this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                    state: DashlingEnums_1.DashlingSessionState.error,
                    errorType: errorType,
                    errorMessage: statusCode
                });
            }
        };
        Stream.prototype.getBufferRate = function () {
            return this.bufferRate.average || 0;
        };
        Stream.prototype.getActiveRequestCount = function () {
            return this._requestManager.getActiveRequestCount();
        };
        Stream.prototype.getRequestStaggerTime = function () {
            // TODO Remove 1.4 magic ratio
            return Math.round(this._estimateDownloadSeconds(this.qualityIndex) * 1400);
        };
        Stream.prototype.isMissing = function (fragmentIndex, currentTime) {
            var fragment = this.fragments[fragmentIndex];
            return (fragment.state == DashlingEnums_1.DashlingRequestState.appended) && !this.isBuffered(fragmentIndex, currentTime);
        };
        Stream.prototype.isBuffered = function (fragmentIndex, currentTime) {
            var fragment = this.fragments[fragmentIndex];
            var isBuffered = false;
            if (fragment) {
                var bufferRanges = this._buffer.buffered;
                var fragmentTime = fragment.time;
                // Allow for up to .5 second of wiggle room at start of playback. else be more meticulous.
                var atStart = fragmentTime.startSeconds < 0.3;
                var atEnd = (fragmentTime.startSeconds + fragmentTime.lengthSeconds + 0.3) >= (this._manifest.mediaDuration);
                var safeStartTime = Math.max(currentTime, fragmentTime.startSeconds + (atStart ? 0.8 : 0.15));
                var safeEndTime = fragmentTime.startSeconds + fragmentTime.lengthSeconds - (atEnd ? 0.8 : 0.15);
                try {
                    // validate that the buffered area in the video element still contains the fragment.
                    for (var bufferedIndex = 0; bufferedIndex < bufferRanges.length; bufferedIndex++) {
                        if ((bufferRanges.start(bufferedIndex) <= safeStartTime) && (bufferRanges.end(bufferedIndex) >= safeEndTime)) {
                            isBuffered = true;
                            break;
                        }
                    }
                }
                catch (e) {
                    // Accessing the buffer can fail with an InvalidState error if an error has occured with the mediasource. (like a decode error)
                    // TODO: Something better, for now marks as buffered so we don't spin trying to get the item.
                    isBuffered = true;
                }
            }
            return isBuffered;
        };
        Stream.prototype.canLoad = function (fragmentIndex) {
            return (this.fragments[fragmentIndex].state <= DashlingEnums_1.DashlingRequestState.idle);
        };
        Stream.prototype.load = function (fragmentIndex, onFragmentAvailable) {
            var _this = this;
            var fragment = this.fragments[fragmentIndex];
            var request;
            var requestType = 'media';
            if (fragment && fragment.state <= DashlingEnums_1.DashlingRequestState.idle) {
                fragment.state = DashlingEnums_1.DashlingRequestState.downloading;
                fragment.qualityIndex = _this.qualityIndex;
                fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;
                _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);
                request = new Request_1.default({
                    url: _this._getUrl(fragmentIndex, fragment),
                    fragmentIndex: fragmentIndex,
                    requestType: requestType,
                    qualityIndex: fragment.qualityIndex,
                    qualityId: fragment.qualityId,
                    clearDataAfterAppend: true,
                    isArrayBuffer: true,
                    onSuccess: _onSuccess,
                    onError: _onError
                }, this._settings);
                fragment.activeRequest = request;
                fragment.requests.push(request);
                Utilities_1.default.log("Download started: " + fragment.qualityId + " " + requestType + " " + "index=" + fragmentIndex + " time=" + (new Date().getTime() - _this._startTime) + "ms stagger=" + _this.getRequestStaggerTime() + "ms", _this._settings);
                _this._requestManager.start(request);
            }
            function _onSuccess(request) {
                if (!_this._isDisposed) {
                    fragment.state = DashlingEnums_1.DashlingRequestState.downloaded;
                    var timeDownloading = Math.round(request.timeAtLastByte - request.timeAtFirstByte);
                    var timeWaiting = request.timeAtLastByte - timeDownloading;
                    Utilities_1.default.log("Download complete: " + request.qualityId + " " + request.requestType + " index: " + request.fragmentIndex + " waiting: " + timeWaiting + "ms receiving: " + timeDownloading, _this._settings);
                    onFragmentAvailable();
                }
            }
            function _onError(request) {
                if (!_this._isDisposed) {
                    if (!request.isAborted) {
                        fragment.state = DashlingEnums_1.DashlingRequestState.error;
                        // Stop the session on a fragment download failure.
                        _this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                            state: DashlingEnums_1.DashlingSessionState.error,
                            errorType: DashlingEnums_1.DashlingError.mediaSegmentDownload,
                            errorMessage: request.statusCode
                        });
                    }
                    else {
                        fragment.state = DashlingEnums_1.DashlingRequestState.idle;
                        fragment.activeRequest = null;
                        fragment.requests = [];
                    }
                }
            }
        };
        Stream.prototype.assessQuality = function () {
            var _this = this;
            var settings = _this._settings;
            var bytesPerSecond = _this._requestManager.getAverageBytesPerSecond();
            var maxQuality = _this._streamInfo.qualities.length - 1;
            if (!bytesPerSecond) {
                bytesPerSecond = parseFloat(localStorage.getItem(BANDWIDTH_LOCAL_STORAGE_KEY));
            }
            else if (this.streamType === "video") {
                localStorage.setItem(BANDWIDTH_LOCAL_STORAGE_KEY, String(bytesPerSecond));
            }
            if (!settings.isABREnabled || !bytesPerSecond) {
                _this.qualityIndex = Math.min(_this._streamInfo.qualities.length - 1, settings.targetQuality[_this.streamType]);
            }
            else if (settings.isRBREnabled) {
                _this.qualityIndex = Math.round(Math.random() * maxQuality);
            }
            else {
                var targetQuality = 0;
                var logEntry = "Quality check " + _this.streamType + ": bps=" + Math.round(bytesPerSecond);
                var segmentLength = _this._streamInfo.timeline[0].lengthSeconds;
                var averageWaitPerSegment = segmentLength * 0.4;
                for (var qualityIndex = 0; qualityIndex <= maxQuality; qualityIndex++) {
                    var duration = _this._estimateDownloadSeconds(qualityIndex, 0);
                    logEntry += " " + qualityIndex + "=" + duration.toFixed(2) + "s";
                    if ((duration + averageWaitPerSegment) < segmentLength) {
                        targetQuality = qualityIndex;
                    }
                }
                _this._async.throttle(function () {
                    Utilities_1.default.log(logEntry, _this._settings);
                }, "assess", 1000, false, false);
                _this.qualityIndex = targetQuality;
            }
        };
        Stream.prototype._estimateDownloadSeconds = function (qualityIndex, fragmentIndex) {
            var _this = this;
            var duration = 0;
            var quality = _this._streamInfo.qualities[qualityIndex];
            var segmentLength = _this._streamInfo.timeline[fragmentIndex || 0].lengthSeconds;
            var bandwidth = quality.bandwidth / 8;
            var totalBytes = bandwidth * segmentLength;
            var bytesPerSecond = _this._requestManager.getAverageBytesPerSecond();
            if (!bytesPerSecond) {
                bytesPerSecond = parseFloat(localStorage.getItem(BANDWIDTH_LOCAL_STORAGE_KEY));
            }
            else if (this.streamType === "video") {
                localStorage.setItem(BANDWIDTH_LOCAL_STORAGE_KEY, String(bytesPerSecond));
            }
            var averageBytesPerSecond = bytesPerSecond || _this._settings.defaultBandwidth;
            return totalBytes / averageBytesPerSecond;
        };
        Stream.prototype._loadInitSegment = function (qualityIndex, onFragmentAvailable) {
            var _this = this;
            var maxQualityIndex = this._streamInfo.qualities.length - 1;
            var qualityId = this._streamInfo.qualities[qualityIndex].id;
            var requestType = 'init';
            var request;
            // Ensure we always have the max init segment loaded.
            if (qualityIndex != maxQualityIndex) {
                _this._loadInitSegment(maxQualityIndex, onFragmentAvailable);
            }
            if (!_this._initSegments[qualityIndex]) {
                request = _this._initSegments[qualityIndex] = new Request_1.default({
                    url: this._getInitUrl(qualityIndex),
                    state: DashlingEnums_1.DashlingRequestState.downloading,
                    timeAtDownloadStarted: new Date().getTime(),
                    requestType: requestType,
                    qualityIndex: qualityIndex,
                    qualityId: qualityId,
                    isArrayBuffer: true,
                    onSuccess: _onSuccess,
                    onError: _onError
                }, this._settings);
                Utilities_1.default.log("Download started: " + _this.streamType + ' ' + qualityId + ' ' + requestType, _this._settings);
                _this._initRequestManager.start(request);
            }
            function _onSuccess() {
                if (!_this._isDisposed) {
                    request.state = DashlingEnums_1.DashlingRequestState.downloaded;
                    Utilities_1.default.log("Download complete: " + _this.streamType + ' ' + qualityId + ' ' + requestType, _this._settings);
                    onFragmentAvailable(request);
                }
            }
            function _onError() {
                if (!_this._isDisposed) {
                    request.state = DashlingEnums_1.DashlingRequestState.error;
                    // Stop the session on a fragment download failure.
                    _this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                        state: DashlingEnums_1.DashlingSessionState.error,
                        errorType: DashlingEnums_1.DashlingError.initSegmentDownload,
                        errorMessage: request.statusCode
                    });
                }
            }
        };
        Stream.prototype._getInitUrl = function (qualityIndex) {
            var urlPart = this._streamInfo.initUrlFormat.replace("$RepresentationID$", this._streamInfo.qualities[qualityIndex].id);
            return this._manifest.baseUrl + urlPart;
        };
        Stream.prototype._getUrl = function (fragmentIndex, fragment) {
            var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);
            return this._manifest.baseUrl + urlPart;
        };
        return Stream;
    })();
    exports.default = Stream; /** done */
});
