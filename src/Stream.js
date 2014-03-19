Dashling.Stream = function(streamType, mediaSource, videoElement, settings) {

    var _this = this;
    var streamInfo = settings.manifest.streams[streamType];

    _mix(_this, {
        fragments: [],
        qualityIndex:  Math.max(0, Math.min(streamInfo.qualities.length - 1, settings.targetQuality[streamType])),

        _initializedQualityIndex: -1,
        _initRequestManager: new Dashling.RequestManager(),
        _requestManager: new Dashling.RequestManager(),
        _streamType: streamType,
        _mediaSource: mediaSource,
        _videoElement: videoElement,
        _settings: settings,
        _manifest: settings.manifest,
        _streamInfo: streamInfo,
        _buffer: null,
        _initSegments: [],
        _delaysPerQuality: {},
        _maxConcurrentRequestsPerQuality: {},
        _latenciesPerQuality: {}
    });

    var fragmentCount = streamInfo.timeline.length;

    for (var i = 0; i < fragmentCount; i++) {
        _this.fragments.push({
            state: DashlingFragmentState.idle,
            qualityIndex: -1,
            qualityId: "",
            fragmentType: "media",
            fragmentIndex: i,
            time: streamInfo.timeline[i],
            activeRequest: null,
            requests: []
        });
    }
};

Dashling.Stream.prototype = {
    dispose: function() {
        if (this._requestManager) {
            this._requestManager.dispose();
            this._requestManager = null;
         }
    },

    abortAll: function() {
        this._requestManager.abortAll();
    },

    canAppend: function(fragmentIndex) {
        var fragment = this.fragments[fragmentIndex];
        var initSegment = fragment ? this._initSegments[fragment.qualityIndex] : null;
        var maxInitSegment = this._initSegments[this._streamInfo.qualities.length - 1];

        return fragment && fragment.state == DashlingFragmentState.downloaded &&
            initSegment && initSegment.state >= DashlingFragmentState.downloaded &&
            maxInitSegment && maxInitSegment.state >= DashlingFragmentState.downloaded;
    },

    append: function(fragmentIndex, onComplete) {
        var _this = this;
        var fragment = _this.fragments[fragmentIndex];
        var maxQualityIndex = _this._streamInfo.qualities.length - 1;
        var fragmentsToAppend = [];
        var buffer = _this._buffer;

        if (!_this._isAppending && fragment && fragment.state === DashlingFragmentState.downloaded) {
            // We only append one segment at a time.
            _this._isAppending = true;
            fragment.state = DashlingFragmentState.appending;

            // On first time initialization, add the top quality init segment.
            if (!buffer) {
                buffer = _this._getSourceBuffer();
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
            var request = fragmentsToAppend[0];

            if (fragmentsToAppend.length) {
                buffer.addEventListener("update", _onAppendComplete);

                try {
                    _log("Append started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
                    buffer.appendBuffer(request.data);
                }
                catch (e) {
                    request.state = fragment.state = DashlingFragmentState.error;
                    _this._isAppending = false;

                    onComplete();
                    // TODO: Fire error?
                }
            }
            else {
                fragment.state = DashlingFragmentState.appended;
                _this._isAppending = false;
                onComplete(fragment);
            }
        }

        function _onAppendComplete() {
            var request = fragmentsToAppend[0];

            buffer.removeEventListener("update", _onAppendComplete);

            request.timeAtAppended = new Date().getTime() - request.startTime;
            request.state = DashlingFragmentState.appended;

            (request.clearDataAfterAppend) && (request.data = null);

            if (request.fragmentType === "init") {
                _this._initializedQualityIndex = request.qualityIndex;
            }

            _log("Append complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
            fragmentsToAppend.shift();

            _appendNextEntry();
        }
    },

    canLoad: function(fragmentIndex) {
        var canLoad = false;
        var fragment = this.fragments[fragmentIndex];

        if (fragment) {
            if (fragment.state == DashlingFragmentState.appended) {
                var videoBuffer = this._buffer.buffered;
                var fragmentTime = fragment.time;
                var wiggleRoom = 0.05;

                // validate that the buffered area in the video element still contains the fragment.
                var isBuffered = false;

                for (var bufferedIndex = 0; bufferedIndex < videoBuffer.length; bufferedIndex++) {
                    if ((videoBuffer.start(bufferedIndex) - wiggleRoom) <= fragmentTime.startSeconds && (videoBuffer.end(bufferedIndex) + wiggleRoom) >= (fragmentTime.startSeconds + fragmentTime.lengthSeconds)) {
                        isBuffered = true;
                        break;
                    }
                }

                // We found an appended segment no longer in the playlist. move it back to idle.
                if (!isBuffered) {
                    fragment.state = DashlingFragmentState.idle;
                }
            }

            canLoad = (fragment.state <= DashlingFragmentState.idle);
        }

        return canLoad;
    },

    load: function(fragmentIndex, onFragmentAvailable) {
        var _this = this;
        var fragment = this.fragments[fragmentIndex];

        this.assessQuality2(fragmentIndex);

        if (fragment && fragment.state <= DashlingFragmentState.idle) {
            fragment.state = DashlingFragmentState.downloading;
            fragment.qualityIndex = _this.qualityIndex;
            fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;

            _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);

            var request = {
                url: _this._getUrl(fragmentIndex, fragment),
                state: DashlingFragmentState.downloading,
                fragmentIndex: fragmentIndex,
                fragmentType: "media",
                qualityIndex: fragment.qualityIndex,
                qualityId: fragment.qualityId,
                clearDataAfterAppend: true
            };

            fragment.activeRequest = request;
            fragment.requests.push(request);

            _log("Download started: " + request.qualityId + " " + request.fragmentType + " " + ( request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

            _this._requestManager.load(request, true, _onSuccess, _onFailure);
        }

        function _onSuccess(request) {
            fragment.state = DashlingFragmentState.downloaded;

            var timeDownloading = Math.round(request.timeAtLastByte - (request.timeAtEstimatedFirstByte || request.timeAtFirstByte));
            var timeWaiting = request.timeAtLastByte - timeDownloading;
            var maxParallelRequests = Math.max(2, Math.min(_this._settings.maxConcurrentRequestsPerStream, Math.round(timeWaiting / timeDownloading)));
            var newDelay = maxParallelRequests > 1 ? Math.round(Math.max(timeWaiting / maxParallelRequests, timeDownloading)) : 0; //  Math.round(Math.max(0, (timeWaiting - timeDownloading) / maxParallelRequests));

            _log("Download complete: " + request.qualityId + " " + request.fragmentType + " index: " + request.fragmentIndex + " waiting: " + timeWaiting + "ms receiving: " + timeDownloading  + "ms nextDelay: " + newDelay + " maxReq: " + maxParallelRequests, _this._settings);

            _this._maxConcurrentRequestsPerQuality[request.qualityIndex] = maxParallelRequests;
            _this._delaysPerQuality[request.qualityIndex] = newDelay;

            onFragmentAvailable(fragment);
        }

        function _onFailure() {

            if (fragment.state != "aborted") {
                fragment.state = DashlingFragmentState.error;
            }
            else {
                fragment.state = DashlingFragmentState.idle;
                fragment.activeRequest = null;
                fragment.requests = [];
            }
        }
    },

    assessQuality2: function(currentIndex) {
        var _this = this;
        var settings = _this._settings;
        var averageBandwidth = _this._requestManager.getAverageBandwidth();
        var maxQuality = this._streamInfo.qualities.length - 1;

        if (!settings.isABREnabled || !averageBandwidth) {
            _this.qualityIndex = Math.min(this._streamInfo.qualities.length - 1, settings.targetQuality[ _this._streamType]);
            //_this.canPlay = _this._getTimeToDownloadAtQuality(_this.qualityIndex, currentIndex) < durationRemaining;
        }
        else {
            var targetQuality = 0;
            var logEntry = "Assess " + this._streamType + ": bps=" + Math.round(averageBandwidth * 1000);
            var segmentLength = this._streamInfo.timeline[0].lengthSeconds;
            var averageWaitPerSegment = segmentLength * .5;

            for (var qualityIndex = 0; qualityIndex <= maxQuality; qualityIndex++) {
                var duration = 0;
                var quality = this._streamInfo.qualities[qualityIndex];
                var bandwidth = quality.bandwidth / 8;
                var totalBytes = bandwidth * segmentLength;
                var averageBytesPerSecond = (averageBandwidth * 1000) || 100000;

                duration = totalBytes / averageBytesPerSecond;

                logEntry += " " + qualityIndex + "=" + Math.round(duration) + "s";

                if ((duration + averageWaitPerSegment) < segmentLength) {
                    targetQuality = qualityIndex;
                }
            }

            _log(logEntry, _this.settings);
            _this.qualityIndex = targetQuality;
        }
    },

    assessQuality: function(durationRemaining, currentIndex) {
        var _this = this;
        var settings = _this._settings;
            var averageBandwidth = _this._requestManager.getAverageBandwidth();

        if (!settings.isABREnabled || !averageBandwidth) {
            _this.qualityIndex = Math.min(this._streamInfo.qualities.length - 1, settings.targetQuality[ _this._streamType]);
            _this.canPlay = _this._getTimeToDownloadAtQuality(_this.qualityIndex, currentIndex) < durationRemaining;
        }
        else {
            var qualityIndex = 0;
            var maxQuality = _this._streamInfo.qualities.length - 1;
            var timeToDownload = 0;
            var canPlay = false;
            var logEntry = "Assess " + this._streamType + ": remaining=" + Math.round(durationRemaining) + "s";

            for (; qualityIndex <= maxQuality; qualityIndex++) {
                timeToDownload = _this._getTimeToDownloadAtQuality(qualityIndex, currentIndex);
                logEntry += " " + qualityIndex + "=" + Math.round(timeToDownload) + "s ";

                if (timeToDownload >= durationRemaining) {
                    qualityIndex = Math.max(0, qualityIndex - 1);
                    break;
                }

                canPlay = true;

                if (qualityIndex == maxQuality) {
                    break;
                }
            }

            _log(logEntry, _this.settings);

            if (this.qualityIndex != qualityIndex) {
                _log("Quality change: " + _this._streamType + " from " + _this.qualityIndex + " to " + qualityIndex, _this.settings);
            }

            //this.qualityIndex = Math.min(Math.round(Math.random() * maxQuality), maxQuality);
            //this.qualityIndex = Math.min(4, maxQuality);
            _this.qualityIndex = qualityIndex;
            _this.canPlay = canPlay;
        }
    },

    _getSourceBuffer: function() {
        if (!this._buffer) {
            this._buffer = this._mediaSource.addSourceBuffer(this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs);
        }

        return this._buffer;
    },

    _getTimeToDownloadAtQuality: function(qualityIndex, fragmentIndex) {
        var duration = 0;

        for (var i = fragmentIndex; i < this.fragments.length; i++) {
            var fragment = this.fragments[i];

            if (!fragment.state < DashlingFragmentState.downloaded) {
                duration += this._getEstimatedDuration(qualityIndex, fragmentIndex);
            }
        }

        return duration;
    },

    _getMaxConcurrentRequests: function(qualityIndex) {
        return this._maxConcurrentRequestsPerQuality[qualityIndex] || 1;
    },

    _getMinDelayBetweenRequests: function(qualityIndex) {
        return this._delaysPerQuality[qualityIndex] || 1000;
    },

    _getEstimatedDuration: function(qualityIndex, fragmentIndex) {
        var duration = 0;
        var quality = this._streamInfo.qualities[qualityIndex];
        var bandwidth = quality.bandwidth / 8;
        var totalBytes = bandwidth * this._streamInfo.timeline[fragmentIndex].lengthSeconds;
        var averageBytesPerSecond = (this._requestManager.getAverageBandwidth() * 1000) || 100000;

        duration = totalBytes / averageBytesPerSecond;

        return duration + (this._requestManager.getAverageLatency() / 1000);
    },



    _loadInitSegment: function(qualityIndex, onFragmentAvailable) {
        var _this = this;
        var maxQualityIndex = this._streamInfo.qualities.length - 1;

        // Ensure we always have the max init segment loaded.
        if (qualityIndex != maxQualityIndex) {
            _this._loadInitSegment(maxQualityIndex, onFragmentAvailable);
        }

        //
        if (!_this._initSegments[qualityIndex]) {
            var request = _this._initSegments[qualityIndex] = {
                url: this._getInitUrl(qualityIndex),
                state: DashlingFragmentState.downloading,
                timeAtDownloadStarted: new Date().getTime(),
                fragmentType: "init",
                qualityIndex: qualityIndex,
                qualityId: this._streamInfo.qualities[qualityIndex].id
            };

            _log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

            _this._initRequestManager.load(request, true, _onSuccess, _onFailure);
        }

        function _onSuccess() {
            request.state = DashlingFragmentState.downloaded;

            _log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

            onFragmentAvailable(request);
        }

        function _onFailure(response) {
            request.state = DashlingFragmentState.error;
        }
    },

    _getInitUrl: function(qualityIndex) {
        var urlPart = this._streamInfo.initUrlFormat.replace("$RepresentationID$", this._streamInfo.qualities[qualityIndex].id);

        return this._manifest.baseUrl + urlPart;
    },

    _getUrl: function(fragmentIndex, fragment) {
        var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);

        return this._manifest.baseUrl + urlPart;
    }

};

_mix(Dashling.Stream.prototype, EventingMixin);
