window.Dashling = function() {
    /// <summary></summary>

    this.settings = {
        targetQuality: { audio: 0, video: 0 },
        isABREnabled: true,
        shouldAutoPlay: true,
        safeBufferSeconds: 15,
        maxBufferSeconds: 180,
        manifest: null
    };
};

Dashling.prototype = {
    _sessionIndex: 0,
    _lastError: null,
    _state: DashlingSessionState.idle,

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

        if (this._streamController) {
            this._streamController.dispose();
            this._streamController = null;
        }

        if (this._parser) {
            this._parser.dispose();
            this._parser = null;
        }

        if (this._videoElement) {
            try {
                this._videoElement.stop();
                this._videoElement.src = "";
            }
            catch (e) {}

            this._videoElement = null;
        }

        _this.videoElement = null;
        _this.settings.manifest = null;

        _this._mediaSource = null;

        this._setState(DashlingSessionState.idle);
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

        _this.raiseEvent(DashlingEvents.initMediaSourceStart);

        try {
            mediaSource = new MediaSource();
        }
        catch (e) {
            _this._setState(DashlingSessionState.error, DashlingError.mediaSourceInit);
        }

        mediaSource.addEventListener("sourceopen", _onOpened, false);

        videoElement.autoplay = false;
        videoElement.src = window.URL.createObjectURL(mediaSource);

        function _onOpened() {
            mediaSource.removeEventListener("sourceopen", _onOpened);

            if (_this._sessionIndex = sessionIndex) {
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
                _this._setState(DashlingSessionState.error, DashlingError.manifestFailed);
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

mix(Dashling, EventingMixin);

