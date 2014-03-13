Dashling.StreamController = function(videoElement, mediaSource, settings) {
    var _this = this;

    // Provide a bound instanced callback to attach to the seek event.
    _this._onVideoSeeking = bind(_this, _this._onVideoSeeking);

    _this._videoElement = videoElement;
    _this._videoElement.addEventListener("seeking" _this._onVideoSeeking);
    _this._mediaSource = mediaSource;
    _this._settings = settings;

    _this._audioStream = new Dashling.Stream("audio", mediaSource, settings);
    _this._videoStream = new Dashling.Stream("video", mediaSource, settings);

    _this._loadNextFragment();
};

Dashling.StreamController.prototype = {
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

    _onVideoSeeking: function() {
        // TODO
    },

    _loadNextFragment: function() {
        var _this = this;

        if (_audioDownloadIndex < this._videoDownloadIndex + 2)
        _this._audioStream.loadFragment(this._audioDownloadIndex, function() {

        } this._tryAppendFragments);
        this._videoStream.loadFragment(this._videoDownloadIndex, this._tryAppendFragments);
    },

    _appendNextFragment: function() {
        if (this._audioStream && this._videoStream) {

            var audioState = this._audioStream.getState(this._appendIndex);
            var videoState = this._videoStream.getState(this._appendIndex);

            // Skip already appended fragments if necessary.
            while (audioState && audioState == DashlingFragmentState.appended &&
                videoState && videoState == DashlingFragmentState.appended) {
                this._appendIndex++;
                audioState = this._audioStream.getState(this._appendIndex);
                videoState = this._videoStream.getState(this._appendIndex);
            }

            // If the both streams are available, append.
            if (audioState && audioState == DashlingFragmentState.downloaded &&
                videoState == DashlingFragmentState.downloaded) {
                // If both audio and video buffers are downloaded, append both together.
                this._audioStream.append(this._fragmentIndex, this._tryAppendFragments);
                this._videoStream.append(this._fragmentIndex, this._tryAppendFragments);
            }
        }
    },

    _tryDownloadFragments: function() {
        var currentTime = this._videoElement.currentTime;
        var timeRemainingToPlay = this._manifest.mediaDuration - currentTime;
        var secondsPerSegment = this._manifest.
        var bufferSecondsAvailable =


        this._audioStream.downloadNextFragment();

        while (this._audioStream.pendingDownloads < this._settings.concurrentRequestsPerStream)
        this._audioStream.getNextDownloadIndex();

                this._assessQuality();
                if (this._audioStream.canPlay && this._videoStream.canPlay) {
                    this._videoElement.play();
                }
                this._loadNextFragment();
            }
    },

    _assestQuality: function() {}
};



        _assessQuality: function() {
            var timeRemainingToPlay = this._manifest.mediaDuration - this._videoElement.currentTime;

            this._audioStream.assessQuality(timeRemainingToPlay, this._fragmentIndex);
            this._videoStream.assessQuality(timeRemainingToPlay, this._fragmentIndex);
        },

        _tryAppendFragments: function() {
            var audioState = this._audioStream.getState(this._fragmentIndex);
            var videoState = this._videoStream.getState(this._fragmentIndex);

            if (audioState == Dashling.FragmentState.downloaded && videoState == Dashling.FragmentState.downloaded) {
                this._audioStream.append(this._fragmentIndex, this._tryAppendFragments);
                this._videoStream.append(this._fragmentIndex, this._tryAppendFragments);
            }
            else if (audioState == Dashling.FragmentState.appended && videoState == Dashling.FragmentState.appended) {
                this._fragmentIndex++;
                this._assessQuality();
                if (this._audioStream.canPlay && this._videoStream.canPlay) {
                    this._videoElement.play();
                }
                this._loadNextFragment();
            }
        },

        _tryStartPlaying: function() {

        },