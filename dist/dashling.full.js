(function() {

function _mix(dest, source) {
    for (var i in source) {
        if (source.hasOwnProperty(i)) {
            dest[i] = source[i];
        }
    }

    return dest;
}

function _bind(obj, func) {
    return function() { return func.apply(obj, arguments); };
}

function _average(numbers, startIndex) {
    var total = 0;


    for (var i = Math.max(0, startIndex || 0); numbers && i < numbers.length; i++) {
        total += numbers[i];
    }

    return total / (numbers.length || 1);
}

function _log(message, settings) {
    if (!settings || settings.logToConsole) {
        console.log(message);
    }
}

function _getXmlNodeValue(xmlDoc, elementName, defaultValue) {
    var element = xmlDoc.getElementsByTagName(elementName)[0];
    var elementText = element ? element.childNodes[0] : null;

    return elementText ? elementText.nodeValue : defaultValue;
}

function _fromISOToSeconds(isoString) {
    // "PT0H0M29.367S";
    var seconds = 0;
    var tempString = isoString.substring("2"); // Remove PT
    var tempIndex = tempString.indexOf("H");

    if (tempIndex > -1) {
        seconds += Number(tempString.substring(0, tempIndex)) * 60 * 60;
        tempString = tempString.substring(tempIndex + 1);
    }

    tempIndex = tempString.indexOf("M");
    if (tempIndex > -1) {
        seconds += Number(tempString.substring(0, tempIndex)) * 60;
        tempString = tempString.substring(tempIndex + 1);
    }

    tempIndex = tempString.indexOf("S");
    if (tempIndex > -1) {
        seconds += Number(tempString.substring(0, tempIndex));
    }

    return seconds;
}

var EventingMixin = {
    on: function(eventName, callback) {
        this.__events = this.__events || {};
        var eventList = this.__events[eventName] = this.__events[eventName] || [];

        eventList.push(callback);
    },

    off: function(eventName, callback) {
        var eventList = this.__events && this.__events[eventName];

        if (eventList) {
            var index = eventList.indexOf(callback);
        }
    },

    raiseEvent: function(eventName, args) {
        var events = this.__events && this.__events[eventName];

        for (var i = 0; events && i < events.length; i++) {
            if (events[i].call(this, args) === false) {
                break;
            }
        }
    }
};

var DashlingEvent = {
    sessionStateChange: "sessionstatechange"
};

var DashlingError = {
    manifestDownload: "manifestDownload",
    manifestParse: "manifestParse",
    mediaSourceInit: "mediaSourceInit",
    mediaSourceAppend: "mediaSourceAppend",
    initSegmentDownload: "initSegmentDownload",
    mediaSegmentDownload: "fragmentDownload",
    append: "append"
};

var DashlingSessionState = {
    error: -1,
    idle: 0,
    intializing: 1,
    loading: 2,
    playbackInProgress: 4,
    paused: 5
};

var DashlingFragmentState = {
    error: -1,
    idle: 0,
    downloading: 1,
    downloaded: 2,
    appending: 3,
    appended: 4
};

window.Dashling = function() {
    /// <summary>Dashling main object.</summary>

    this.settings = {
        targetQuality: { audio: 5, video: 5 },
        isABREnabled: true,
        shouldAutoPlay: true,
        safeBufferSeconds: 15,
        maxBufferSeconds: 180,
        logToConsole: true,
        // The number of concurrent downloads per stream.
        maxConcurrentRequestsPerStream: 4,

        // The number of segments to download beyond the current append cursor.
        maxDownloadsBeyondAppendPosition: 3,
        manifest: null
    };
};

_mix(Dashling, {
    Event: DashlingEvent,
    SessionState: DashlingSessionState,
    FragmentState: DashlingFragmentState,
    Error: DashlingError
});

Dashling.prototype = {
    // Private members
    _streamController: null,
    _sessionIndex: 0,
    _lastError: null,
    _state: DashlingSessionState.idle,

    // Public methods
    load: function (videoElement, url) {
        /// <summary>Loads a video.</summary>
        /// <param name="videoElement">The video element to load into.</param>
        /// <param name="url">Url to manifest xml.</param>

        var _this = this;

        _this.reset();

        _this._setState(Dashling.intializing);

        _this._videoElement = videoElement;
        _this._initializeMediaSource(videoElement);
        _this._initializeManifest(url);
    },

    dispose: function() {
        this.reset();
    },

    reset: function() {
        /// <summary></summary>

        var _this = this;

        if (_this._streamController) {
            _this._streamController.dispose();
            _this._streamController = null;
        }

        if (_this._parser) {
            _this._parser.dispose();
            _this._parser = null;
        }

        if (_this._videoElement) {
            try {
                _this._videoElement.pause();
                _this._videoElement.src = "";
            }
            catch (e) {}

            _this._videoElement = null;
        }

        _this.videoElement = null;
        _this.settings.manifest = null;

        _this._mediaSource = null;

        _this._setState(DashlingSessionState.idle);
    },

    getPlayingQuality: function(streamType) {
        return this._streamController ? this._streamController.getPlayingQuality(streamType) : this.settings[streamType];
    },

    getBufferingQuality: function(streamType) {
        return this._streamController ? this._streamController.getBufferingQuality(streamType) : this.settings[streamType];
    },

    getMaxQuality: function(streamType) {
        return this.settings.manifest ? this.settings.manifest.streams[streamType].qualities.length - 1 : 0;
    },

    _setState: function(state, error) {
        if (this._state != state) {

            this._state = state;
            this._lastError = error;

            this.raiseEvent(DashlingEvent.sessionStateChange, { state: state, error: error });
        }
    },

    _initializeMediaSource: function(videoElement) {
        var _this = this;
        var sessionIndex = _this._sessionIndex;
        var mediaSource;

        _this.raiseEvent(DashlingEvent.initMediaSourceStart);

        try {
            mediaSource = new MediaSource();
        }
        catch (e) {
            _this._setState(DashlingSessionState.error, DashlingSessionError.mediaSourceInit);
        }

        mediaSource.addEventListener("sourceopen", _onOpened, false);

        videoElement.autoplay = false;
        videoElement.src = window.URL.createObjectURL(mediaSource);

        function _onOpened() {
            mediaSource.removeEventListener("sourceopen", _onOpened);

            if (_this._sessionIndex == sessionIndex) {
                _this._mediaSource = mediaSource;
                _this._tryStart();
            }
        }
    },

    _initializeManifest: function(url) {
        var _this = this;
        var loadIndex = _this._loadIndex;

        if (_this.settings.manifest) {
            _onManifestParsed(_this.settings.manifest);
        }
        else {
            this._parser = new Dashling.ManifestParser();
            this._parser.parse(url, _onManifestParsed, _onManifestFailed);
        }

        function _onManifestParsed(manifest) {
            if (_this._loadIndex == loadIndex && _this.state != DashlingSessionState.error) {
                _this.settings.manifest = manifest;
                _this._tryStart();
            }
        }

        function _onManifestFailed(error) {
            if (_this._loadIndex == _loadIndex) {
                _this._setState(DashlingSessionState.error, DashlingSessionError.manifestFailed);
            }
        }
    },

    _tryStart: function() {
        var _this = this;

        if (_this._state != DashlingSessionState.error &&
            _this._mediaSource &&
            _this.settings.manifest) {

            _this._setState(DashlingSessionState.loading);

            _this._mediaSource.duration = _this.settings.manifest.mediaDuration;

            _this._streamController = new Dashling.StreamController(
                _this._videoElement,
                _this._mediaSource,
                _this.settings);
        }
    }
};

_mix(Dashling.prototype, EventingMixin);


Dashling.ManifestParser = function() {
    this._requestManager = new Dashling.RequestManager();
};

Dashling.ManifestParser.prototype = {
    _parseIndex: 0,

    dispose: function() {
        if (this._requestManager) {
            this._requestManager.dispose();
            this._requestManager = null;
        }
    },

    parse: function(url, onSuccess, onError) {
        var _this = this;
        var parseIndex = ++_this._parseIndex;
        var request = { url: url };

        this._requestManager.load(request, false, _onSuccess, _onError);

        function _onSuccess() {
            if (_this._parseIndex == parseIndex) {
                onSuccess(_this._parseManifest(request.data));
            }
        }

        function _onError() {
            if (_this._parseIndex == parseIndex) {
                onError(request);
            }
        }
    },

    _parseManifest: function(manifestText) {
        var manifest = {};
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(manifestText,"text/xml");
        var i;

        manifest.baseUrl = _getXmlNodeValue(xmlDoc, "BaseURL", "");
        manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
        manifest.streams = {};

        var adaptations = [
            xmlDoc.querySelector("AdaptationSet[contentType='audio']"),
            xmlDoc.querySelector("AdaptationSet[contentType='video']")
        ];

        for (var adaptIndex = 0 ; adaptIndex < adaptations.length; adaptIndex++) {
            var adaptationElement = adaptations[adaptIndex];

            if (adaptationElement) {
                var contentType = adaptationElement.getAttribute("contentType");
                var representationElements = adaptationElement.querySelectorAll("Representation");
                var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
                var timelineElements = adaptationElement.querySelectorAll("S");
                var stream = manifest.streams[contentType] = {
                    streamType: contentType,
                    mimeType: adaptationElement.getAttribute("mimeType"),
                    codecs: adaptationElement.getAttribute("codecs"),
                    initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
                    fragUrlFormat: segmentTemplateElement.getAttribute("media"),
                    qualities: [],
                    timeline: []
                };

                var timeScale = segmentTemplateElement.getAttribute("timescale");


                for (var repIndex = 0; repIndex < representationElements.length; repIndex++) {
                    var repElement = representationElements[repIndex];
                    var quality = {
                        id: repElement.getAttribute("id"),
                        bandwidth: repElement.getAttribute("bandwidth")
                    };

                    if (repElement.getAttribute("height")) {
                        quality.width = Number(repElement.getAttribute("width"));
                        quality.height = Number(repElement.getAttribute("height"));
                    }

                    stream.qualities.push(quality);
                }

                var startTime = 0;

                for (var timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
                    var timelineElement = timelineElements[timelineIndex];
                    var repeatCount = Number(timelineElement.getAttribute("r")) || 0;
                    var duration = Number(timelineElement.getAttribute("d"));

                    for (i = 0; i <= repeatCount; i++) {
                        stream.timeline.push({
                            start: startTime,
                            startSeconds: startTime / timeScale,
                            length: duration,
                            lengthSeconds: duration / timeScale });

                        startTime += duration;
                    }
                }
            }
        }

        return manifest;
    }
};


/// <summary>
/// </summary>

Dashling.StreamController = function(videoElement, mediaSource, settings) {
    var _this = this;

    // Provide a bound instanced callback to attach to the seek event.
    _this._onVideoSeeking = _bind(_this, _this._onVideoSeeking);
    _this._appendNextFragment = _bind(_this, _this._appendNextFragment);

    _this._videoElement = videoElement;
    _this._videoElement.addEventListener("seeking", _this._onVideoSeeking);

    _this._mediaSource = mediaSource;
    _this._settings = settings;

    _this._streams = [
        _this._audioStream = new Dashling.Stream("audio", mediaSource, settings),
        _this._videoStream = new Dashling.Stream("video", mediaSource, settings)
    ];

    _this._loadNextFragment();
};

Dashling.StreamController.prototype = {
    _nextStreamIndex: 0,
    _appendIndex: 0,
    _audioDownloadIndex: 0,
    _videoDownloadIndex: 0,
    _simultaneousDownloadsPerStream: 2,
    _maxSegmentsAhead: 2,
    _nextRequestTimerId: 0,

    dispose: function() {
        var _this = this;

        if (_this._videoElement) {
            _this._videoElement.removeEventListener("seeking", _this._onVideoSeeking);
            _this._videoElement = null;
        }

        for (var i = 0; _this._streams && i < _this._streams.length; i++) {
            _this._streams[i].dispose();
        }

        if (_this._nextRequestTimerId) {
            clearTimeout(_this._nextRequestTimerId);
            _this._nextRequestTimerId = 0;
        }

       _this._streams = null;
        _this._mediaSource = null;
    },

    getPlayingQuality: function(streamType) {
        var currentTime = this._videoElement.currentTime;
        var stream = streamType == "video" ? this._videoStream : streamType._audioStream;
        var fragmentIndex = Math.floor(currentTime / stream.fragments[0].time.lengthSeconds);
        var qualityIndex = stream.fragments[fragmentIndex].qualityIndex;

        return qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
    },

    getBufferingQuality: function(streamType) {
        var stream = streamType == "video" ? this._videoStream : this._audioStream;

        return stream.qualityIndex;
    },

    _loadNextFragment: function() {
        var _this = this;
        var downloads = _this._getDownloadList();

        for (var i = 0; i < downloads.length; i++) {

            var download = downloads[i];
            var stream = _this._streams[download.streamIndex];
            var fragment = stream.fragments[download.fragmentIndex];
            var previousFragment = stream.fragments[download.fragmentIndex - 1];
            var previousRequest = previousFragment && previousFragment.activeRequest && previousFragment.activeRequest.state == DashlingFragmentState.downloading ? previousFragment.activeRequest : null;
            var now = new Date().getTime();
            var minDelay = stream._getMinDelayBetweenRequests(stream.qualityIndex);
            var timeSincePreviousFragment = previousRequest ? now - previousRequest.startTime : 0;

            if ((!previousRequest && this._appendIndex == download.fragmentIndex) || timeSincePreviousFragment > minDelay) {
                stream.load(download.fragmentIndex, this._appendNextFragment);
            }
            else if (!_this._nextRequestTimerId) {
                _this._nextRequestTimerId = setTimeout(function() {
                    _this._nextRequestTimerId = 0;
                    _this._loadNextFragment();
                }, minDelay - timeSincePreviousFragment);
            }
        }
    },

    _appendNextFragment: function(fragmentLoaded) {
        var _this = this;
        var streams = this._streams;
        var stream;
        var streamIndex;

        if (streams && streams.length) {
            var streamsAppendable = true;

            while (_this._appendIndex < streams[0].fragments.length) {
                // Try to append the current index.
                var canAppend = true;
                var allStreamsAppended = true;

                for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                    stream = streams[streamIndex];
                    canAppend &= stream.canAppend(_this._appendIndex);
                    allStreamsAppended &= stream.fragments[_this._appendIndex].state == DashlingFragmentState.appended;
                }

                if (canAppend) {
                    allStreamsAppended = false;

                    for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                        var stream = streams[streamIndex];

                        stream.append(_this._appendIndex, _this._appendNextFragment);
                        allStreamsAppended &= stream.fragments[_this._appendIndex].state == DashlingFragmentState.appended;
                    }
                }

                // If the append index, and assess quality
                if (allStreamsAppended) {
                    var canPlay = true;

                    _this._appendIndex++;
                    for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                        var secondsRemaining = _this._settings.manifest.mediaDuration - _this._videoElement.currentTime;
                        var stream = streams[streamIndex];

                        stream.assessQuality(secondsRemaining, _this._appendIndex);
                        canPlay &= stream.canPlay;
                    }

                    if (canPlay && this._settings.shouldAutoPlay && !this._hasAutoPlayed) {
                        this._hasAutoPlayed = true;
                        this._videoElement.play();
                    }
                }
                else {
                    break;
                }
            }

            _this._loadNextFragment();
        }
    },

   _getDownloadList: function() {
        var _this = this;
        var downloadList = [];
        var settings = _this._settings;
        var maxFragmentIndex = Math.min(this._appendIndex + settings.maxDownloadsBeyondAppendPosition, _this._streams[0].fragments.length - 1);

        for (var streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
            var stream = _this._streams[streamIndex];
            var maxDownloads = stream._getMaxConcurrentRequests(stream.qualityIndex);
            var pendingDownloads = 0;

            for (var fragmentIndex = _this._appendIndex; fragmentIndex <= maxFragmentIndex && pendingDownloads < maxDownloads; fragmentIndex++) {
                var fragment = stream.fragments[fragmentIndex];

                if (fragment.state == DashlingFragmentState.downloading) {
                    pendingDownloads++;
                }
                else if (fragment.state == DashlingFragmentState.idle) {
                    downloadList.push({ streamIndex: streamIndex, fragmentIndex: fragmentIndex });
                    pendingDownloads++;
                }
            }

        }

        return downloadList;
    },

    _isFragmentDownloadable: function(fragment) {
        return (fragment.state == DashlingFragmentState.idle);
    },

    _onVideoSeeking: function() {
        // TODO
    }


};

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
    dispose: function() {
        if (this._requestManager) {
            this._requestManager.dispose();
            this._requestManager = null;
         }
    },

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
                    _log("Append started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""), _this._settings);
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

            _log("Append complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""), _this._settings);
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

                _log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""), _this._settings);

                _this._requestManager.load(request, true, _onSuccess, _onFailure);
            }
        }

        function _onSuccess(request) {
            fragment.state = DashlingFragmentState.downloaded;

            var timeDownloading = Math.round(request.timeAtLastByte - (request.timeAtEstimatedFirstByte || request.timeAtFirstByte));
            var timeWaiting = request.timeAtLastByte - timeDownloading;
            var maxParallelRequests = Math.max(1, Math.min(_this._settings.maxConcurrentRequestsPerStream, Math.round(timeWaiting / timeDownloading)));
            var newDelay = maxParallelRequests > 1 ? Math.max(timeWaiting / maxParallelRequests, timeDownloading) : 0; //  Math.round(Math.max(0, (timeWaiting - timeDownloading) / maxParallelRequests));

            _log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + "index " + request.segmentIndex + " timeDownloading: " + timeDownloading + " timeWaiting:" + timeWaiting + " newDelay: " + newDelay + " maxReq: " + maxParallelRequests, _this._settings);

            _this._maxConcurrentRequestsPerQuality[request.qualityIndex] = maxParallelRequests;
            _this._delaysPerQuality[request.qualityIndex] = newDelay;

            onFragmentAvailable(fragment);
        }

        function _onFailure() {

            // TODO bubble error.
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

            for (; qualityIndex <= maxQuality; qualityIndex++) {
                timeToDownload = _this._getTimeToDownloadAtQuality(qualityIndex, currentIndex);

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

            _log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""), _this._settings);

            _this._initRequestManager.load(request, true, _onSuccess, _onFailure);
        }

        function _onSuccess() {
            request.state = DashlingFragmentState.downloaded;

            _log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + ( request.segmentIndex !== undefined ? "index " + request.segmentIndex : ""), _this._settings);

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

Dashling.RequestManager = function() {
    this._activeRequests = {};
    this._latencies = [];
    this._bandwidths = [];
};

var RequestManagerState = {
    noPendingRequests: 0,
    waitingForResponse: 1,
    receivingData: 2,
    receivingParallelData: 3
};

Dashling.RequestManager.prototype = {
    maxRetries: 3,
    delayBetweenRetries: [ 200, 1500, 3000 ],
    _requestIndex: 0,
    _state: RequestManagerState.noPendingRequests,

    _xhrType: XMLHttpRequest,

    dispose: function() {
        this.abortAll();
    },

    abortAll: function() {
        for (var requestIndex in this._activeRequests) {
            this._activeRequests[requestIndex].isAborted = true;
            this._activeRequests[requestIndex].abort();
        }

        this._activeRequests = {};
    },

    load: function(request, isArrayBuffer, onSuccess, onFailure) {
        var _this = this;
        var maxRetries = this.maxRetries;
        var retryIndex = -1;
        var delayBetweenRetries = this.delayBetweenRetries;

        request.retryCount = 0;
        _startRequest();

        function _startRequest() {
            var xhr = new _this._xhrType();
            var requestIndex = ++_this._requestIndex;

            _this._activeRequests[requestIndex] = xhr;

            xhr.open("GET", request.url, true);
            isArrayBuffer && (xhr.responseType = "arraybuffer");

            xhr.onreadystatechange = function() {
                if (xhr.readyState > 0 && request.timeAtFirstByte < 0) {
                    request.timeAtFirstByte = new Date().getTime() - request.startTime
                }
            };

            xhr.onprogress = function(ev) {
                request.progressEvents.push({
                    timeFromStart: new Date().getTime() - request.startTime,
                    bytesLoaded: ev.lengthComputable ? ev.loaded : -1
                });
            };

            xhr.onloadend = function() {
                if (!xhr.isAborted) {
                    delete _this._activeRequests[requestIndex];

                    if (xhr.status >= 200 && xhr.status <= 299) {
                        request.timeAtLastByte = new Date().getTime() - request.startTime;
                        request.bytesLoaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText.length;

                        // Ensure we've recorded firstbyte time.
                        xhr.onreadystatechange();

                        if (request.progressEvents.length > 1) {
                            var lastEvent = request.progressEvents[request.progressEvents.length - 1];
                            var firstEvent = request.progressEvents[0];
                            var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
                            var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

                            request.bytesPerMillisecond = bytesLoaded / timeDifference;
                            request.timeAtEstimatedFirstByte = request.timeAtLastByte - (request.bytesLoaded / request.bytesPerMillisecond);

                            if (bytesLoaded > 10000 && timeDifference > 5) {
                                _this._bandwidths.push(request.bytesPerMillisecond);
                                _this._latencies.push(request.timeAtEstimatedFirstByte);
                            }
                        }

                        request.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
                        request.statusCode = xhr.status;
                        request.state = DashlingFragmentState.downloaded;

                        onSuccess && onSuccess(request);
                    }
                    else {
                        _onError(request);
                    }
                }
            };

            function _onError() {
                if (++retryIndex < maxRetries) {
                    request.timeAtFirstByte = -1;
                    request.timeAtLastByte = -1;

                    request.retryCount++;
                    setTimeout(_startRequest, delayBetweenRetries[Math.min(delayBetweenRetries.length - 1, retryIndex)]);
                }
                else {
                    request.state = DashlingFragmentState.error;
                    request.statusCode = xhr.status;

                    onFailure && onFailure(request);
                }
            };

            request.state = DashlingFragmentState.downloading;

            request.progressEvents = [];
            request.timeAtFirstByte = -1;
            request.timeAtLastByte = -1;
            request.startTime = new Date().getTime();

            xhr.send();
        }
    },

    getAverageLatency: function() {
        return _average(this._latencies, this._bandwidths.length - 5);
    },

    getAverageBandwidth: function() {
        return _average(this._bandwidths, this._bandwidths.length - 5);
    }
};

})();
