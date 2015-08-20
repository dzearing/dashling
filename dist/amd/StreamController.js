define(["require", "exports", './EventGroup', './Async', './Stream', './MetricSet', './Utilities', './DashlingEnums'], function (require, exports, EventGroup_1, Async_1, Stream_1, MetricSet_1, Utilities_1, DashlingEnums_1) {
    // When we calculate how much buffer is remaining, we permit a small blank gap between segments.
    var PERMITTED_GAP_SECONDS_BETWEEN_RANGES = 0.06;
    // When we try to calculate which fragment a "currentTime" value aligns on, we subtract this value from currentTime first.
    var SEEK_TIME_BUFFER_SECONDS = 0.5;
    var MEDIASOURCE_READYSTATE_CLOSED = 0;
    var MEDIASOURCE_READYSTATE_OPEN = 1;
    var MEDIASOURCE_READYSTATE_ENDED = 2;
    var StreamController = (function () {
        function StreamController(videoElement, mediaSource, settings) {
            this._events = new EventGroup_1.default(this);
            this._async = new Async_1.default(this);
            this._mediaSource = mediaSource;
            this._settings = settings;
            this._bufferRate = new MetricSet_1.default(3);
            this._appendedSeconds = 0;
            this._requestTimerIds = [0, 0];
            this.streams = [];
            this._appendIndex = 0;
            this._nextStreamIndex = 0;
            this._appendIndex = 0;
            this._audioDownloadIndex = 0;
            this._videoDownloadIndex = 0;
            this._simultaneousDownloadsPerStream = 2;
            this._maxSegmentsAhead = 2;
            this._nextRequestTimerId = 0;
            this._seekingTimerId = 0;
            this.stalls = 0;
            this._lastCurrentTime = 0;
            this._lastTimeBeforeSeek = 0;
            this._startTime = 0;
            this._videoElement = videoElement;
            this._playbackMonitorId = 0;
            this._canPlay = false;
            this._timeAtStall = 0;
            this._intializeVideoElement();
            this._initializeStreams(videoElement, mediaSource, settings);
            // If we have streams and a start time defined in settings, try to initialize the appendIndex correctly.
            if (this.streams.length && settings && settings.startTime) {
                var stream = this.streams[0];
                var firstFragmentDuration = stream.fragments[0].time.lengthSeconds;
                this._appendIndex = Math.max(0, Math.min(stream.fragments.length - 1, (Math.floor((settings.startTime - SEEK_TIME_BUFFER_SECONDS) / firstFragmentDuration))));
            }
        }
        StreamController.prototype.dispose = function () {
            var _this = this;
            if (!_this._isDisposed) {
                _this._isDisposed = true;
                _this._adjustPlaybackMonitor(false);
                _this._events.dispose();
                _this._async.dispose();
                for (var i = 0; _this.streams && i < _this.streams.length; i++) {
                    _this.streams[i].dispose();
                }
                _this._videoElement = null;
                _this._mediaSource = null;
            }
        };
        StreamController.prototype.start = function () {
            this._startTime = new Date().getTime();
            this._setCanPlay(false);
            this._loadNextFragment();
            this._adjustPlaybackMonitor(true);
        };
        /** Gets the current playing fragment's quality for the given stream type. */
        StreamController.prototype.getPlayingQuality = function (streamType) {
            var qualityIndex = 0;
            if (!this._isDisposed) {
                for (var streamIndex = 0; streamIndex < this.streams.length; streamIndex++) {
                    var stream = this.streams[streamIndex];
                    if (stream.streamType == streamType) {
                        var currentTime = this._videoElement.currentTime;
                        var fragmentIndex = Math.min(stream.fragments.length - 1, Math.floor(currentTime / stream.fragments[0].time.lengthSeconds));
                        qualityIndex = stream.fragments[fragmentIndex].qualityIndex;
                        qualityIndex = qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
                        break;
                    }
                }
            }
            return qualityIndex;
        };
        /** Gets the current default current quality for the given stream type. */
        StreamController.prototype.getBufferingQuality = function (streamType) {
            var qualityIndex = 0;
            if (!this._isDisposed) {
                for (var _i = 0, _a = this.streams; _i < _a.length; _i++) {
                    var stream = _a[_i];
                    if (stream.streamType == streamType) {
                        qualityIndex = stream.qualityIndex;
                        break;
                    }
                }
            }
            return qualityIndex;
        };
        StreamController.prototype.getBufferRate = function () {
            return this._bufferRate.average;
        };
        StreamController.prototype.getRemainingBuffer = function (offsetFromCurrentTime) {
            var _this = this;
            var remainingBuffer = 0;
            if (!_this._isDisposed) {
                var currentTime = (_this._settings.startTime || _this._videoElement.currentTime) + (offsetFromCurrentTime || 0);
                var bufferRanges = _this._videoElement.buffered;
                // Workaround: if the currentTime is 0 and the first range start is less than 1s, default currentTime to start time.
                if (!currentTime && bufferRanges.length > 0 && bufferRanges.start(0) < 1) {
                    currentTime = bufferRanges.start(0);
                }
                for (var i = 0; i < bufferRanges.length; i++) {
                    if (currentTime >= bufferRanges.start(i) && currentTime <= bufferRanges.end(i)) {
                        // We've found the range containing currentTime. Now find the buffered end, ignore small gaps in between ranges.
                        var end = bufferRanges.end(i);
                        while (++i < bufferRanges.length && (bufferRanges.start(i) - end) < PERMITTED_GAP_SECONDS_BETWEEN_RANGES) {
                            end = bufferRanges.end(i);
                        }
                        remainingBuffer = end - currentTime;
                        break;
                    }
                }
            }
            return remainingBuffer;
        };
        StreamController.prototype.getTimeUntilUnderrun = function (offsetFromCurrentTime) {
            var timeUntilUnderrun = Number.MAX_VALUE;
            var _this = this;
            if (!_this._isDisposed) {
                var currentTime = (_this._settings.startTime || Math.max(0.5, _this._videoElement.currentTime));
                var remainingDuration = _this._settings.manifest.mediaDuration - currentTime - 0.5;
                var remainingBuffer = this.getRemainingBuffer(offsetFromCurrentTime);
                var bufferRate = this.getBufferRate();
                var confidence = (remainingBuffer / this._settings.safeBufferSeconds);
                confidence = Math.min(1, Math.max(0, confidence));
                if (remainingDuration > remainingBuffer) {
                    var estimatedAdditionalBuffer = remainingBuffer * bufferRate;
                    timeUntilUnderrun = remainingBuffer + (confidence * estimatedAdditionalBuffer);
                    // if we're 50% of the way to max or beyond duration.
                    if (timeUntilUnderrun > remainingDuration || (timeUntilUnderrun > (_this._settings.maxBufferSeconds * 0.5))) {
                        timeUntilUnderrun = Number.MAX_VALUE;
                    }
                }
            }
            return timeUntilUnderrun;
        };
        StreamController.prototype._intializeVideoElement = function () {
            var _this = this;
            var videoElement = this._videoElement;
            if (videoElement) {
                this._events.onAll(videoElement, {
                    'seeking': _this._onVideoSeeking,
                    'error': _this._onVideoError,
                    'play': _this._onPauseStateChange,
                    'pause': _this._onPauseStateChange,
                    'ended': _this._onVideoEnded,
                    'ratechange': _this._onVideoRateChange
                });
            }
        };
        StreamController.prototype._initializeStreams = function (videoElement, mediaSource, settings) {
            // Initializes streams based on manifest content.
            var _this = this;
            var manifestStreams = (settings && settings.manifest && settings.manifest.streams) ? settings.manifest.streams : null;
            _this.streams = [];
            if (manifestStreams) {
                if (manifestStreams['audio']) {
                    _this.streams.push(new Stream_1.default("audio", mediaSource, videoElement, settings));
                }
                if (manifestStreams['video']) {
                    _this.streams.push(new Stream_1.default("video", mediaSource, videoElement, settings));
                }
            }
            for (var _i = 0, _a = _this.streams; _i < _a.length; _i++) {
                var stream = _a[_i];
                _this._events.on(stream, DashlingEnums_1.DashlingEvent.download, _forwardDownloadEvent);
                _this._events.on(stream, DashlingEnums_1.DashlingEvent.sessionStateChange, _forwardSessionStateChange);
                stream.initialize();
            }
            function _forwardDownloadEvent(ev) {
                _this._events.raise(DashlingEnums_1.DashlingEvent.download, ev);
            }
            function _forwardSessionStateChange(args) {
                _this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, args);
            }
        };
        StreamController.prototype._loadNextFragment = function () {
            var _this = this;
            if (!_this._isDisposed) {
                var candidates = _this._getDownloadCandidates();
                for (var streamIndex = 0; streamIndex < candidates.downloads.length; streamIndex++) {
                    var streamDownloads = candidates.downloads[streamIndex];
                    var stream = _this.streams[streamIndex];
                    for (var downloadIndex = 0; downloadIndex < streamDownloads.length; downloadIndex++) {
                        var fragmentIndex = streamDownloads[downloadIndex];
                        var fragment = stream.fragments[fragmentIndex];
                        var previousFragment = stream.fragments[fragmentIndex - 1];
                        var previousRequest = previousFragment && previousFragment.activeRequest && previousFragment.activeRequest.state == DashlingEnums_1.DashlingRequestState.downloading ? previousFragment.activeRequest : null;
                        var minDelay = stream.getRequestStaggerTime();
                        var timeSincePreviousFragment = previousRequest ? new Date().getTime() - previousRequest.startTime : 0;
                        if (!previousRequest || timeSincePreviousFragment >= minDelay) {
                            stream.load(fragmentIndex, function () {
                                _this._appendNextFragment();
                            });
                        }
                        else {
                            _enqueueNextLoad(streamIndex, minDelay - timeSincePreviousFragment);
                            break;
                        }
                    }
                }
                // If we are at the end of our limit, poll every 300ms for more downloadable content.
                if (candidates.isAtMax) {
                    _enqueueNextLoad(0, 300);
                }
            }
            function _enqueueNextLoad(index, delay) {
                if (!_this._isDisposed) {
                    if (_this._requestTimerIds[index]) {
                        _this._async.clearTimeout(_this._requestTimerIds[index]);
                    }
                    _this._requestTimerIds[index] = _this._async.setTimeout(function () {
                        _this._requestTimerIds[index] = 0;
                        _this._loadNextFragment();
                    }, delay);
                }
            }
        };
        StreamController.prototype._appendNextFragment = function () {
            var _this = this;
            var streams = this.streams;
            var stream;
            var streamIndex;
            if (!_this._isDisposed) {
                var currentTime = _this._settings.startTime || _this._videoElement.currentTime;
                if (streams && streams.length && _this._mediaSource && _this._mediaSource.readyState !== MEDIASOURCE_READYSTATE_CLOSED) {
                    var streamsAppendable = true;
                    while (_this._appendIndex < streams[0].fragments.length) {
                        // Try to append the current index.
                        var canAppend = true;
                        var allStreamsAppended = true;
                        for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                            stream = streams[streamIndex];
                            canAppend = canAppend && stream.canAppend(_this._appendIndex);
                            allStreamsAppended = allStreamsAppended && stream.fragments[_this._appendIndex].state === DashlingEnums_1.DashlingRequestState.appended && !stream.isMissing(_this._appendIndex, currentTime);
                        }
                        if (canAppend) {
                            allStreamsAppended = false;
                            for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                                stream = streams[streamIndex];
                                stream.append(_this._appendIndex, function () {
                                    _this._appendNextFragment();
                                });
                                allStreamsAppended = allStreamsAppended && stream.fragments[_this._appendIndex].state === DashlingEnums_1.DashlingRequestState.appended;
                            }
                        }
                        // If the append index, and assess playback
                        if (allStreamsAppended) {
                            // Update buffer rate.
                            var fragment = _this.streams[0].fragments[_this._appendIndex];
                            if (!fragment.activeRequest._hasUpdatedBufferRate) {
                                fragment.activeRequest._hasUpdatedBufferRate = true;
                                _this._appendedSeconds += fragment.time.lengthSeconds;
                                var now = new Date().getTime();
                                var duration = (now - this._startTime) / 1000;
                                _this._bufferRate.addMetric(_this._appendedSeconds / (duration || 0.1));
                            }
                            _this._appendIndex++;
                            // After we're done appending, update the video element's time to the start time if provided.
                            if (_this._settings.startTime) {
                                try {
                                    _this._videoElement.currentTime = _this._settings.startTime;
                                    _this._settings.startTime = 0;
                                }
                                catch (e) { }
                            }
                            _this._checkCanPlay();
                        }
                        else {
                            break;
                        }
                    }
                    if (_this._appendIndex == streams[0].fragments.length && _this._mediaSource.readyState === MEDIASOURCE_READYSTATE_OPEN) {
                        _this._mediaSource.endOfStream();
                    }
                    _this._loadNextFragment();
                }
            }
        };
        StreamController.prototype._adjustPlaybackMonitor = function (isEnabled) {
            var _this = this;
            if (!isEnabled && _this._playbackMonitorId) {
                clearInterval(_this._playbackMonitorId);
                _this._playbackMonitorId = 0;
            }
            else if (isEnabled && !_this._playbackMonitorId) {
                _this._playbackMonitorId = setInterval(function () {
                    _this._checkCanPlay();
                }, 200);
            }
        };
        StreamController.prototype._checkCanPlay = function () {
            var _this = this;
            var timeUntilUnderrun = _this.getTimeUntilUnderrun();
            var allowedSeekAhead = 0.5;
            var canPlay = false;
            this._lastCurrentTime = _this._videoElement.currentTime;
            if (_this._canPlay && timeUntilUnderrun < 0.1 && !_this._timeAtStall) {
                _this._timeAtStall = this._lastCurrentTime;
                // We may be stalling! Check in 200ms if we haven't moved. If we have, then go into a buffering state.
                _this._async.setTimeout(function () {
                    var timeAtStall = _this._timeAtStall;
                    _this._timeAtStall = 0;
                    if (!_this._isDisposed && _this._videoElement.currentTime == timeAtStall) {
                        _this.stalls++;
                        _this._setCanPlay(false);
                    }
                }, 200);
            }
            if (!_this._canPlay) {
                if (timeUntilUnderrun > _this._settings.safeBufferSeconds) {
                    this._setCanPlay(true);
                }
                else if (_this.getTimeUntilUnderrun(allowedSeekAhead) > _this._settings.safeBufferSeconds) {
                    // Wiggle ahead the current time.
                    _this._videoElement.currentTime = Math.min(_this._videoElement.currentTime + allowedSeekAhead, _this._videoElement.duration);
                    this._setCanPlay(true);
                }
            }
            this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                state: this._canPlay ? (this._videoElement.paused ? DashlingEnums_1.DashlingSessionState.paused : DashlingEnums_1.DashlingSessionState.playing) : DashlingEnums_1.DashlingSessionState.buffering
            });
        };
        StreamController.prototype._allStreamsAppended = function (streams, fragmentIndex) {
            var allStreamsAppended = false;
            for (var _i = 0; _i < streams.length; _i++) {
                var stream = streams[_i];
                allStreamsAppended = allStreamsAppended && stream.fragments[fragmentIndex] == DashlingEnums_1.DashlingRequestState.appended;
            }
            return allStreamsAppended;
        };
        /**
        * This method builds up an array of arrays, one for each stream, where the contents are the fragment indexes that can
        * be downloaded.
        *
        * There are a number of criteria we need to look at to determine what the candidates are:
        *
        * 1. The fragment must be in "idle" or less state.
        * 2. The index must not start beyond the (currentTime + maxBufferSeconds) max index.
        * 3. Respect max concurrency: downloading the fragment will not result in concurrent requests than allowed in settings.
        * 4. The index must not be greater (than an amount specified in settings) than the first "non-ready"
        *    index of any other stream. (We don't want one stream to get too far ahead of another, it's a waste
        *    of bandwidth.)
        *
        * In order to find candidates that fit all of these criteria, we do this:
        *
        * 1. We start with a fragment range that's valid: fragmentAtCurrentTime to (currentTime + maxBufferTime).
        * 2. We ask the stream to ensure this range's states are correct (by scanning for fragments that report appended but are missing.)
        * 3. We need to understand what the soonest missing fragment of all streams is. We go find this minMissingIndex value.
        * 4. From there, we go through each stream and start adding missing indexes to an array, until either any of these occur:
        *      a. Our active requests + the current length is > max concurrent for the stream
        *      b. The index exceeds (startIndex + maxSegmentLeadCount)
        *
        * Once we have all stream's missing index arrays built, we return the result which is used to enqueue loading.
        */
        StreamController.prototype._getDownloadCandidates = function () {
            var _this = this;
            var currentRange = _this._getCurrentFragmentRange();
            var candidates = {
                downloads: [],
                isAtMax: false
            };
            var totalCandidates = 0;
            if (currentRange.start > -1) {
                _this._ensureStreamsUpdated(currentRange);
                var firstMissingIndex = _this._getMissingFragmentIndex(currentRange);
                if (firstMissingIndex >= 0) {
                    currentRange.start = Math.max(currentRange.start, firstMissingIndex);
                    for (var i = 0; i < _this.streams.length; i++) {
                        var stream = _this.streams[i];
                        candidates.downloads.push(_this._getDownloadableIndexes(stream, currentRange));
                        totalCandidates += candidates.downloads[candidates.downloads.length - 1].length;
                    }
                }
            }
            // Return a flag indicating when we're unable to return candidates because we have max buffer.
            // That way we know that we need to try to evaluate candidates again soon.
            candidates.isAtMax = !totalCandidates && currentRange.end >= 0 && (currentRange.end < (_this.streams[0].fragments.length - 1));
            return candidates;
        };
        /**
         * Gets the current fragment range, starting at video currentTime and ending at
         * video end, or time+maxBufferSeconds if it's sooner, and returns as an
         * object: { start: 0, stop: 0 }
         */
        StreamController.prototype._getCurrentFragmentRange = function () {
            var _this = this;
            var videoElement = _this._videoElement;
            var duration = _this._settings.manifest.mediaDuration;
            var range = {
                start: -1,
                end: -1
            };
            if (duration > 0) {
                var currentTime = _this._settings.startTime || videoElement.currentTime;
                var isAtEnd = (currentTime + 0.005) >= duration;
                var firstStream = _this.streams[0];
                var fragmentCount = firstStream.fragments.length;
                var fragmentLength = firstStream.fragments[0].time.lengthSeconds;
                if (!isAtEnd) {
                    if (currentTime > SEEK_TIME_BUFFER_SECONDS) {
                        currentTime -= SEEK_TIME_BUFFER_SECONDS;
                    }
                    range.start = Math.max(0, Math.min(fragmentCount - 1, Math.floor(currentTime / fragmentLength)));
                    range.end = Math.max(0, Math.min(fragmentCount - 1, Math.ceil((currentTime + _this._settings.maxBufferSeconds) / fragmentLength)));
                }
            }
            return range;
        };
        /** Assess quality level for ABR and check for missing fragments. */
        StreamController.prototype._ensureStreamsUpdated = function (range) {
            var _this = this;
            var currentTime = _this._videoElement.currentTime;
            for (var streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
                var stream = _this.streams[streamIndex];
                stream.assessQuality();
                for (var fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
                    if (stream.isMissing(fragmentIndex, currentTime)) {
                        var fragment = stream.fragments[fragmentIndex];
                        Utilities_1.default.log("Missing fragment reset: stream=" + stream.streamType + " index=" + fragmentIndex + " [" + fragment.time.startSeconds + "]", _this._settings);
                        stream.fragments[fragmentIndex].state = DashlingEnums_1.DashlingRequestState.idle;
                    }
                }
            }
        };
        /** Gets the first missing fragment index in all streams. */
        StreamController.prototype._getMissingFragmentIndex = function (range) {
            var _this = this;
            for (var fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
                for (var streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
                    var fragment = _this.streams[streamIndex].fragments[fragmentIndex];
                    if (fragment.state <= DashlingEnums_1.DashlingRequestState.idle) {
                        return fragmentIndex;
                    }
                }
            }
            return -1;
        };
        /**
         * Builds up an array of indexes of download candidates for the stream, taking into consideration
         * the range given, the lead count defined in settings, and the max concurrency for the stream.
         */
        StreamController.prototype._getDownloadableIndexes = function (stream, range) {
            var _this = this;
            var indexes = [];
            // Limit the range based on settings for the stream.
            var endIndex = Math.min(range.end, range.start + _this._settings.maxSegmentLeadCount[stream.streamType]);
            var maxRequests = _this._settings.maxConcurrentRequests[stream.streamType] - stream.getActiveRequestCount();
            for (var fragmentIndex = range.start; indexes.length < maxRequests && fragmentIndex <= endIndex; fragmentIndex++) {
                if (stream.fragments[fragmentIndex].state <= DashlingEnums_1.DashlingRequestState.idle) {
                    indexes.push(fragmentIndex);
                }
            }
            return indexes;
        };
        StreamController.prototype._setCanPlay = function (isAllowed) {
            if (this._canPlay !== isAllowed) {
                this._canPlay = isAllowed;
                this._onVideoRateChange();
            }
        };
        StreamController.prototype._onVideoSeeking = function () {
            if (!this._lastTimeBeforeSeek) {
                this._lastTimeBeforeSeek = this._lastCurrentTime;
            }
            if (this._seekingTimerId) {
                clearTimeout(this._seekingTimerId);
            }
            this._setCanPlay(false);
            this._settings.startTime = 0;
            this._seekingTimerId = this._async.setTimeout(this._onThrottledSeek, 300);
        };
        StreamController.prototype._onThrottledSeek = function () {
            var _this = this;
            if (!_this._isDisposed) {
                var currentTime = _this._videoElement.currentTime;
                var lastTimeBeforeSeek = this._lastTimeBeforeSeek;
                var fragmentIndex = Math.floor(Math.max(0, currentTime - SEEK_TIME_BUFFER_SECONDS) / _this.streams[0].fragments[0].time.lengthSeconds);
                var streamIndex;
                var isBufferAcceptable = _this._videoElement.buffered.length == 1 &&
                    _this._videoElement.buffered.start(0) <= (Math.max(0, currentTime - 2)) &&
                    _this._videoElement.buffered.end(0) > currentTime;
                Utilities_1.default.log("Throttled seek: " + _this._videoElement.currentTime, _this._settings);
                // Clear letiables tracking seek.
                _this._seekingTimerId = 0;
                _this._lastTimeBeforeSeek = 0;
                clearTimeout(_this._nextRequestTimerId);
                _this._nextRequestTimerId = 0;
                // If seeking ahead of the append index, abort all.
                if (_this._appendIndex < fragmentIndex) {
                    // Abortttttt
                    for (streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
                        _this.streams[streamIndex].abortAll();
                    }
                }
                if (_this._settings.manifest.mediaDuration > _this._settings.maxBufferSeconds && !isBufferAcceptable) {
                    Utilities_1.default.log("Clearing buffer", _this._settings);
                    for (streamIndex = 0; streamIndex < _this.streams.length; streamIndex++) {
                        _this.streams[streamIndex].clearBuffer();
                    }
                }
                _this._appendIndex = fragmentIndex;
                _this._appendNextFragment();
            }
        };
        StreamController.prototype._onVideoError = function () {
            this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                state: DashlingEnums_1.DashlingSessionState.error,
                errorType: DashlingEnums_1.DashlingError.videoElementError,
                errorMessage: Utilities_1.default.getVideoError(this._videoElement)
            });
        };
        StreamController.prototype._onPauseStateChange = function () {
            this._adjustPlaybackMonitor(!this._videoElement.paused);
            this._checkCanPlay();
        };
        StreamController.prototype._onVideoEnded = function () {
            this._events.raise(DashlingEnums_1.DashlingEvent.sessionStateChange, {
                state: DashlingEnums_1.DashlingSessionState.paused
            });
        };
        StreamController.prototype._onVideoRateChange = function () {
            var expectedRate = (this._canPlay ? 1 : 0);
            if (this._videoElement.playbackRate != expectedRate) {
                this._videoElement.playbackRate = this._videoElement.defaultPlaybackRate = expectedRate;
            }
        };
        return StreamController;
    })();
    exports.default = StreamController;
});
