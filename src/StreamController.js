/// <summary>
/// </summary>

Dashling.StreamController = function(videoElement, mediaSource, settings) {
    var _this = this;

    // Provide a bound instanced callbacks.
    _this._onVideoSeeking = _bind(_this, _this._onVideoSeeking);
    _this._appendNextFragment = _bind(_this, _this._appendNextFragment);
    _this._onThrottledSeek = _bind(_this, _this._onThrottledSeek);

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
    _seekingTimerId: 0,

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

        if (_this._seekingTimerId) {
            clearTimeout(_this._seekingTimerId);
            _this._seekingTimerId = 0;
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
                else if (stream.canLoad(fragmentIndex)) {
                    downloadList.push({ streamIndex: streamIndex, fragmentIndex: fragmentIndex });
                    pendingDownloads++;
                }
            }

        }

        return downloadList;
    },

    _onVideoSeeking: function() {
        if (!this._seekingTimerId) {
            this._seekingTimerId = setTimeout(this._onThrottledSeek, 500);
        }
    },

    _onThrottledSeek: function() {
        var _this = this;
        var currentTime = _this._videoElement.currentTime;
        var fragmentIndex = Math.floor(currentTime / _this._streams[0].fragments[0].time.lengthSeconds);

        _this._seekingTimerId = 0;
        _log("Throttled seek: " + _this._videoElement.currentTime, _this._settings);

        if (_this._nextRequestTimerId) {
            clearTimeout(_this._nextRequestTimerId);
            _this._nextRequestTimerId = 0;
        }

        if (_this._appendIndex < fragmentIndex) {

            // Abortttttt
            for (var streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
                _this._streams[streamIndex].abortAll();
            }
        }

        _this._appendIndex = fragmentIndex;
        _this._appendNextFragment();
    }

};
