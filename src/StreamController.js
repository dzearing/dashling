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

    dispose: function() {
        var _this = this;

        if (_this._videoElement) {
            _this._videoElement.removeEventListener("seeking", _this._onVideoSeeking);
            _this._videoElement = null;
        }

        _this._mediaSource = null;
        _this._audioStream = null;
        _this._videoStream = null;
    },

    getPlayingQuality: function(streamType) {

    },

    getBufferingQuality: function(streamType) {

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
            else if (!_this._timerId) {
                _this._timerId = setTimeout(function() {
                    _this._timerId = 0;
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
