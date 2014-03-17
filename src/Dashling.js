window.Dashling = function() {
    /// <summary></summary>

    this.settings = {
        targetQuality: { audio: 5, video: 5 },
        isABREnabled: true,
        shouldAutoPlay: true,
        safeBufferSeconds: 15,
        maxBufferSeconds: 180,

        // The number of concurrent downloads per stream.
        maxConcurrentRequestsPerStream: 4,

        // The number of segments to download beyond the current append cursor.
        maxDownloadsBeyondAppendPosition: 3,
        manifest: null
    };
};

mix(Dashling, {
    Event: DashlingEvent,
    SessionState: DashlingSessionState,
    FragmentState: DashlingFragmentState,
    Error: DashlingError,
});

Dashling.prototype = {
    // Private members
    _streamController: null,
    _sessionIndex: 0,
    _lastError: null,
    _state: DashlingSessionState.idle,

    // Public methods
    load: function (videoElement, url) {
        /// <summary></summary>
        /// <param name="videoElement"></param>
        /// <param name="url"></param>

        var _this = this;

        _this.reset();

        _this._setState(Dashling.intializing);

        _this._videoElement = videoElement;
        _this._initializeMediaSource(videoElement);
        _this._initializeManifest(url);
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
                _this._videoElement.stop();
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

mix(Dashling.prototype, EventingMixin);

