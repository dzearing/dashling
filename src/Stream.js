Dashling.Stream = function(streamType, mediaSource, settings) {

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
            time: streamInfo.timeline[i],
            activeRequest: null,
            requests: []
        });
    }
};

Dashling.Stream.prototype = {

    canAppend: function(fragmentIndex) {
        var fragment = this.fragments[fragmentIndex];
        var initSegment = fragment ? this._initSegments[fragment.qualityIndex] : null;
        var maxInitSegment = this._initSegments[this._streamInfo.qualities.length - 1];

        return fragment && fragment.state == DashlingFragmentState.downloaded &&
            initSegment && initSegment.state == DashlingFragmentState.downloaded &&
            maxInitSegment && maxInitSegment.state == DashlingFragmentState.downloaded;
    },

    append: function(segmentIndex, onComplete) {
        var _this = this;
        var fragment = _this.fragments[segmentIndex];
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
            if (_this._initializedQualityIndex != fragment.qualityIndex) {
                fragmentsToAppend.push(_this._initSegments[fragment.qualityIndex]);
            }

            fragmentsToAppend.push(fragment.activeRequest);
            _appendNextEntry();
        }


        function _appendNextEntry() {
            var request = fragmentsToAppend[0];

            if (fragmentsToAppend.length) {
                buffer.addEventListener("update", _onAppendComplete);

                try {
                    console.log("Append started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""));
                    buffer.appendBuffer(request.data);
                }
                catch (e) {
                    fragment.state = DashlingFragmentState.error;
                    _this._isAppending = false;
                    // TODO: Fire error?
                }
            }
            else {
                fragment.state = DashlingFragmentState.appended;
                _this._isAppending = false;
                onComplete();
            }
        }

        function _onAppendComplete() {
            var request = fragmentsToAppend[0];

            buffer.removeEventListener("update", _onAppendComplete);

            request.timeAtAppended = new Date().getTime() - request.startTime;
            (request.clearDataAfterAppend) && (request.data = null);

            if (request.fragmentType === "init") {
                _this._initializedQualityIndex = request.qualityIndex;
            }

            console.log("Append complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""));
            fragmentsToAppend.shift();

            _appendNextEntry();
        }
    },

    load: function(segmentIndex, onFragmentAvailable) {
        var _this = this;
        var fragment = this.fragments[segmentIndex];

        if (fragment && fragment.state == DashlingFragmentState.idle) {
            if (!fragment.activeRequest) {

                fragment.state = DashlingFragmentState.downloading;
                fragment.qualityIndex = _this.qualityIndex;
                fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;

                _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);

                var request = {
                    url: _this._getUrl(segmentIndex, fragment),
                    state: DashlingFragmentState.downloading,
                    segmentIndex: segmentIndex,
                    fragmentType: "media",
                    qualityIndex: fragment.qualityIndex,
                    qualityId: fragment.qualityId,
                    clearDataAfterAppend: true
                };

                fragment.activeRequest = request;
                fragment.requests.push(request);

                console.log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""));

                _this._requestManager.load(request, true, _onSuccess, _onFailure);
            }
        }

        function _onSuccess(request) {
            fragment.state = DashlingFragmentState.downloaded;

            var timeDownloading = Math.round(request.timeAtLastByte - (request.timeAtEstimatedFirstByte || request.timeAtFirstByte));
            var timeWaiting = request.timeAtLastByte - timeDownloading;
            var maxParallelRequests = Math.max(1, Math.min(_this._settings.maxConcurrentRequestsPerStream, Math.round(timeWaiting / timeDownloading)));
            var newDelay = maxParallelRequests > 1 ? Math.max(timeWaiting / maxParallelRequests, timeDownloading) : 0; //  Math.round(Math.max(0, (timeWaiting - timeDownloading) / maxParallelRequests));

            console.log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + "index " + request.segmentIndex + " timeDownloading: " + timeDownloading + " timeWaiting:" + timeWaiting + " newDelay: " + newDelay + " maxReq: " + maxParallelRequests);

            _this._maxConcurrentRequestsPerQuality[request.qualityIndex] = maxParallelRequests;
            _this._delaysPerQuality[request.qualityIndex] = newDelay;

            onFragmentAvailable(fragment);
        }

        function _onFailure() {

            // TODO bubble error.
        }
    },

    assessQuality: function(durationRemaining, currentIndex) {
        var settings = this._settings;
            var averageBandwidth = this._requestManager.getAverageBandwidth();

        if (!settings.isABREnabled || !averageBandwidth) {
            this.qualityIndex = Math.min(this._streamInfo.qualities.length - 1, settings.targetQuality[ this._streamType]);
            this.canPlay = this._getTimeToDownloadAtQuality(this.qualityIndex, currentIndex) < durationRemaining;
        }
        else {
            var qualityIndex = 0;
            var maxQuality = this._streamInfo.qualities.length - 1;
            var timeToDownload = 0;
            var canPlay = false;

            for (; qualityIndex <= maxQuality; qualityIndex++) {
                timeToDownload = this._getTimeToDownloadAtQuality(qualityIndex, currentIndex);

                if (timeToDownload >= durationRemaining) {
                    qualityIndex = Math.max(0, qualityIndex - 1);
                    break;
                }

                canPlay = true;

                if (qualityIndex == maxQuality) {
                    break;
                }
            }

            if (this.qualityIndex != qualityIndex) {
                console.log("Quality change: " + this._streamType + " from " + this.qualityIndex + " to " + qualityIndex);
            }

            //this.qualityIndex = Math.min(Math.round(Math.random() * maxQuality), maxQuality);
            //this.qualityIndex = Math.min(4, maxQuality);
            this.qualityIndex = qualityIndex;
            this.canPlay = canPlay;
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

            console.log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""));

            _this._initRequestManager.load(request, true, _onSuccess, _onFailure);
        }

        function _onSuccess() {
            request.state = DashlingFragmentState.downloaded;

            console.log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""));

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

    _getUrl: function(segmentIndex, fragment) {
        var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);

        return this._manifest.baseUrl + urlPart;
    }

};

_mix(Dashling.Stream.prototype, EventingMixin);
