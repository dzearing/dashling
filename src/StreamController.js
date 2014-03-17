/// <summary>
/// </summary>

Dashling.StreamController = function(videoElement, mediaSource, settings) {
    var _this = this;

    // Provide a bound instanced callback to attach to the seek event.
    _this._onVideoSeeking = bind(_this, _this._onVideoSeeking);
    _this._appendNextFragment = bind(_this, _this._appendNextFragment);

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
        var streamIndex;

        if (streams && streams.length) {
            var streamsAppendable = true;

            while (_this._appendIndex < streams[0].fragments.length) {
                // Try to append the current index.
                var canAppend = true;
                var allStreamsAppended = true;

                for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
                    var stream = streams[streamIndex];

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

                // If the append index.
                if (allStreamsAppended) {
                    _this._appendIndex++;
                }
                else {
                    break;
                }
            }

            _this._loadNextFragment();
        }
    },

   _getDownloadList: function() {
        var downloadList = [];
        var streamIndex = this._nextStreamIndex;
        var fragmentIndex = this._appendIndex;
        var maxFragmentIndex = Math.min(this._appendIndex + this._settings.maxDownloadsBeyondAppendPosition, this._streams[0].fragments.length - 1);
        var now = new Date().getTime();
        var downloadCount = 0;
        var addedDownloads = true;

        for (var streamIndex = 0; streamIndex < this._streams.length; streamIndex++) {
            var stream = this._streams[streamIndex];
            var maxDownloads = stream._getMaxConcurrentRequests(stream.qualityIndex);
            var pendingDownloads = 0;

            for (var fragmentIndex = this._appendIndex; fragmentIndex <= maxFragmentIndex && pendingDownloads < maxDownloads; fragmentIndex++) {
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
