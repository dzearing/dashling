/// <summary>Dashling main object.</summary>

window.Dashling = function() {
  this.settings = _mix({}, Dashling.Settings);
};

// Mix in enums.
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

  load: function(videoElement, url) {
    /// <summary>Loads a video.</summary>
    /// <param name="videoElement">The video element to load into.</param>
    /// <param name="url">Url to manifest xml.</param>

    var _this = this;

    _this.reset();
    _this._setState(Dashling.initializing);
    _this._videoElement = videoElement;
    _this._initializeMediaSource(videoElement);
    _this._initializeManifest(url);
  },

  dispose: function() {
    /// <summary>Disposes dashling.</summary>

    this.reset();
  },

  reset: function() {
    /// <summary>Resets dashling; aborts all network requests, closes all shops in the mall, cancels the 3-ring circus.</summary>

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

      // Clear the manifest only if we were provided a video element.
      _this.settings.manifest = null;

      try {
        _this._videoElement.pause();
      } catch (e) {}

      _this._videoElement = null;
    }

    _this.videoElement = null;

    _this._mediaSource = null;

    _this._setState(DashlingSessionState.idle);
  },

  getRemainingBuffer: function() {
    return this._streamController ? this._streamController.getRemainingBuffer() : 0;
  },

  getBufferRate: function() {
    return this._streamController ? this._streamController.getBufferRate() : 0;
  },


  getPlayingQuality: function(streamType) {
    /// <summary>Gets the playing quality for the streamType at the current video location.</summary>

    return this._streamController ? this._streamController.getPlayingQuality(streamType) : this.settings[streamType];
  },

  getBufferingQuality: function(streamType) {
    /// <summary>Gets the current buffering quality for the streamType.</summary>

    return this._streamController ? this._streamController.getBufferingQuality(streamType) : this.settings[streamType];
  },

  getMaxQuality: function(streamType) {
    /// <summary>Gets the max quality for the streamType.</summary>

    var stream = this.settings.manifest ? this.settings.manifest.streams[streamType] : null;

    return stream ? stream.qualities.length - 1 : 0;
  },

  // Private methods

  _setState: function(state, error) {
    if (this._state != state) {

      this._state = state;
      this._lastError = error;

      this.raiseEvent(DashlingEvent.sessionStateChange, {
        state: state,
        error: error
      });
    }
  },

  _initializeMediaSource: function(videoElement) {
    var _this = this;
    var sessionIndex = _this._sessionIndex;
    var mediaSource;

    _this.raiseEvent(DashlingEvent.initMediaSourceStart);

    try {
      mediaSource = new MediaSource();
    } catch (e) {
      _this._setState(DashlingSessionState.error, Dashling.Error.mediaSourceInit);
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
    } else {
      this._parser = new Dashling.ManifestParser(_this.settings);
      this._parser.parse(url, _onManifestParsed, _onManifestFailed);
    }

    function _onManifestParsed(manifest) {
      if (_this._loadIndex == loadIndex && _this.state != DashlingSessionState.error) {
        _this.settings.manifest = manifest;
        _this._tryStart();
      }
    }

    function _onManifestFailed(error) {
      if (_this._loadIndex == loadIndex) {
        _this._setState(DashlingSessionState.error, Dashling.Error.manifestFailed);
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