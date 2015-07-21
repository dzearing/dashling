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
  return function() {
    return func.apply(obj, arguments);
  };
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

function _addMetric(array, val, max) {
  var average = array.average || 0;

  array.average = average + ((val - average) / (array.length + 1));
  array.push(val);

  while (array.length > max) {
    _removeFirstMetric(array);
  }
}

function _removeFirstMetric(array) {
  var val = array.shift();
  var average = array.average;

  array.average = average + ((average - val) / array.length);
}
var ThrottleMixin = {
  throttle: function(func, id, minTime, shouldReset, shouldCallImmediately) {
    var _this = this;

    if (!_this._throttleIds) {
      _this._throttleIds = {};
    }

    if (shouldReset) {
      _this.clearThrottle(id);
    }

    if (!_this._throttleIds[id]) {
      _this._throttleIds[id] = setTimeout(function() {
        if (!shouldCallImmediately) {
          func();
        }

        delete _this._throttleIds[id];
      }, minTime);

      if (shouldCallImmediately) {
        shouldCallImmediately = false;
        func();
      }
    }
  },

  clearThrottle: function(id) {
    if (this._throttleIds) {
      clearTimeout(this._throttleIds[id]);
      delete this._throttleIds[id];
    }
  },

  clearAllThrottles: function() {
    if (this._throttleIds) {
      for (var id in this._throttleIds) {
        clearTimeout(this._throttleIds[id]);
      }
      this._throttleIds = null;
    }
  }
};
var EventingMixin = {
  addEventListener: function(eventName, callback) {
    this.__events = this.__events || {};
    var eventList = this.__events[eventName] = this.__events[eventName] || [];

    eventList.push(callback);
  },

  removeEventListener: function(eventName, callback) {
    var eventList = this.__events && this.__events[eventName];

    if (eventList) {
      var index = eventList.indexOf(callback);

      if (index > -1) {
        eventList.splice(index, 1);
      }
    }
  },

  removeAllEventListeners: function() {
    this.__events = null;
  },

  raiseEvent: function(eventName) {
    var events = this.__events && this.__events[eventName];

    for (var i = 0; events && i < events.length; i++) {
      if (events[i].apply(this, Array.prototype.slice.apply(arguments, [1])) === false) {
        break;
      }
    }
  }
};
var DashlingEvent = {
  sessionStateChange: "sessionstatechange",
  download: "download"
};

var DashlingError = {
  // Occurs when the manifest fails to download.
  manifestDownload: "manifestDownload",

  // Occurs when the initSegment fails to download.
  initSegmentDownload: "initSegmentDownload",

  // Occurs when the mediaSegment fails to download.
  mediaSegmentDownload: "mediaSegmentDownload",

  // Occurs when we can't parse the manifest.
  manifestParse: "manifestParse",

  // Occurs when we can't initialize a sourceBuffer from the mediaSource.
  sourceBufferInit: "sourceBufferInit",

  // Occurs when we try to append a segment but it doesn't seem to append.
  sourceBufferAppendException: "sourceBufferAppendException",

  // Occurs when we try to append a segment, and afterwards don't find it in the buffer.
  sourceBufferAppendMissing: "sourceBufferAppendMissing"

};

var DashlingSessionState = {
  error: -1,
  idle: 0,
  initializing: 1,
  buffering: 2,
  playing: 4,
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

  state: DashlingSessionState.idle,
  lastError: null,

  startTime: null,
  timeAtFirstCanPlay: null,

  // Public methods

  load: function(videoElement, url) {
    /// <summary>Loads a video.</summary>
    /// <param name="videoElement">The video element to load into.</param>
    /// <param name="url">Url to manifest xml.</param>

    var _this = this;

    _this.reset();

    _this.startTime = new Date().getTime();
    _this._setState(DashlingSessionState.initializing);
    _this._videoElement = videoElement;
    _this._initializeMediaSource(videoElement);
    _this._initializeManifest(url);
  },

  dispose: function() {
    /// <summary>Disposes dashling.</summary>

    this.isDisposed = true;
    this.reset();
  },

  reset: function() {
    /// <summary>Resets dashling; aborts all network requests, closes all shops in the mall, cancels the 3-ring circus.</summary>

    var _this = this;

    _this.startTime = null;
    _this.timeAtFirstCanPlay = null;
    _this.lastError = null;

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

  _setState: function(state, errorType, errorMessage) {
    if (!this.isDisposed && this.state != state) {
      this.state = state;
      this.lastError = errorType ? (errorType + " " + (errorMessage ? "(" + errorMessage + ")" : "")) : null;

      // Stop stream controller immediately.
      if (state == DashlingSessionState.error && this._streamController) {
        this._streamController.dispose();
      }

      if (!this.timeAtFirstCanPlay && (state == DashlingSessionState.playing || state == DashlingSessionState.paused)) {
        this.timeAtFirstCanPlay = new Date().getTime() - this.startTime;
      }

      this.raiseEvent(DashlingEvent.sessionStateChange, state, errorType, errorMessage);
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

    if (mediaSource) {
      mediaSource.addEventListener("sourceopen", _onOpened, false);
      videoElement.src = window.URL.createObjectURL(mediaSource);
    }

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
      _this._parser = new Dashling.ManifestParser(_this.settings);

      _this._parser.addEventListener(DashlingEvent.download, function(ev) {
        _this.raiseEvent(Dashling.Event.download, ev);
      });

      this._parser.parse(url, _onManifestParsed, _onManifestFailed);
    }

    function _onManifestParsed(manifest) {
      if (_this._loadIndex == loadIndex && _this.state != DashlingSessionState.error) {
        _this.settings.manifest = manifest;
        _this._tryStart();
      }
    }

    function _onManifestFailed(errorType, errorMessage) {
      if (_this._loadIndex == loadIndex) {
        _this._setState(DashlingSessionState.error, errorType, errorMessage);
      }
    }
  },

  _tryStart: function() {
    var _this = this;

    if (_this.state != DashlingSessionState.error &&
      _this._mediaSource &&
      _this.settings.manifest) {

      _this._mediaSource.duration = _this.settings.manifest.mediaDuration;

      _this._streamController = new Dashling.StreamController(
        _this._videoElement,
        _this._mediaSource,
        _this.settings);

      _this._streamController.addEventListener(DashlingEvent.download, function(ev) {
        _this.raiseEvent(Dashling.Event.download, ev);
      });

      _this._streamController.addEventListener(DashlingEvent.sessionStateChange, function(state, errorType, errorMessage) {
        _this._setState(state, errorType, errorMessage);
      });

      _this._streamController.start();
    }
  }
};

_mix(Dashling.prototype, EventingMixin);

Dashling.Settings = {
  // The manifest object to use, if you want to skip the serial call to fetch the xml.
  manifest: null,

  // Default start time for video, in seconds.
  startTime: 0,

  // If auto bitrate regulation is enabled.
  isABREnabled: true,

  // Randomize bitrate (testing purposes)
  isRBREnabled: false,

  // The quality to use if we have ABR disabled, or if default bandwidth is not available.
  targetQuality: {
    audio: 2,
    video: 2
  },

  // If we should auto play the video when enough buffer is available.
  shouldAutoPlay: true,

  // Logs debug data to console.
  logToConsole: false,

  // Number of buffered seconds in which we will start to be more aggressive on estimates.
  safeBufferSeconds: 12,

  // Number of buffered seconds before we stop buffering more.
  maxBufferSeconds: 119.5,

  // Max number of simultaneous requests per stream.
  maxConcurrentRequests: {
    audio: 4,
    video: 6
  },

  // Max number of fragments each stream can be ahead of the other stream by.
  maxSegmentLeadCount: {
    audio: 1,
    video: 5
  },

  // Default bytes per millisecond, used to determine default request staggering (480p is around 520 bytes per millisecond (4.16 mbps.)
  defaultBandwidth: 520,

  // Default request timeout
  requestTimeout: 30000,

  // Number of attempts beyond original request to try downloading something.
  maxRetries: 3,

  // Millisecond delays between retries.
  delaysBetweenRetries: [200, 1500, 3000],

  // Milliseconds that a request must be to register as a "download" that triggers the download event (used for ignoring cache responses.)
  requestCacheThreshold: 80,

  // Optional override for manifest baseurl.
  baseUrlOverride: null
};

Dashling.ManifestParser = function(settings) {
  var _this = this;

  _this._settings = settings;
  _this._requestManager = new Dashling.RequestManager(false, settings);
  _this._requestManager.addEventListener(DashlingEvent.download, function(ev) {
    _this.raiseEvent(DashlingEvent.download, ev);
  });
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
    var request = {
      url: url,
      requestType: "manifest",
      onSuccess: _onSuccess,
      onError: _onError
    };

    this._requestManager.load(request);

    function _onSuccess(request) {
      if (_this._parseIndex == parseIndex) {
        var manifest;

        try {
          manifest = _this._parseManifest(request.data, url);
          manifest.request = request;
        } catch (e) {
          onError(DashlingError.manifestParse, e);
        }

        if (manifest) {
          onSuccess(manifest);
        }
      }
    }

    function _onError() {
      if (_this._parseIndex == parseIndex) {
        onError(DashlingError.manifestDownload, request.statusCode);
      }
    }
  },

  _parseManifest: function(manifestText, manifestUrl) {
    var manifest = {};
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(manifestText, "text/xml");
    var i;

    manifest.baseUrl = this._settings.baseUrlOverride || _getXmlNodeValue(xmlDoc, "BaseURL", "");
    if (manifestUrl && !manifest.baseUrl) {
      // fallback to the parent directory of the manifest URL per DASH spec
      manifest.baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/')+1);
    }
    manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
    manifest.streams = {};

    var adaptationSets = xmlDoc.querySelectorAll("AdaptationSet");

    for (var adaptIndex = 0; adaptIndex < adaptationSets.length; adaptIndex++) {

      var adaptationElement = adaptationSets[adaptIndex];

      if (adaptationElement) {
        var contentType = adaptationElement.getAttribute("contentType");
		if (!contentType) {
		  contentType = adaptationElement.getAttribute("mimeType").split("/")[0];
		}
        var representationElements = adaptationElement.querySelectorAll("Representation");
        var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
        var stream = manifest.streams[contentType] = {
          streamType: contentType,
          mimeType: adaptationElement.getAttribute("mimeType"),
          codecs: adaptationElement.getAttribute("codecs") || adaptationElement.querySelector("[codecs]").getAttribute("codecs"),
          initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
          fragUrlFormat: segmentTemplateElement.getAttribute("media"),
          qualities: [],
          timeline: []
        };

        var timeScale = segmentTemplateElement.getAttribute("timescale");
        var maxSegmentDurationInTimeScale = segmentTemplateElement.getAttribute("duration");
        var maxSegmentDuration = maxSegmentDurationInTimeScale / timeScale;

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

        
        
        var firstSegmentIndex = 1;
        if (segmentTemplateElement.hasAttribute("startNumber")) {
          firstSegmentIndex = parseInt(segmentTemplateElement.getAttribute("startNumber"));
        }
        
        var startSeconds, length;
         
        var timelineElements = adaptationElement.querySelectorAll("S");
        if (timelineElements.length) {
          // timeline-based manifest 
          for (var timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
            var timelineElement = timelineElements[timelineIndex];
            var repeatCount = Number(timelineElement.getAttribute("r")) || 0;
            length = Number(timelineElement.getAttribute("d"));
            var startTime = 0;
            for (i = 0; i <= repeatCount; i++) {
              startSeconds = startTime / timeScale;
              stream.timeline.push({
                'serverSegmentIndex': Math.floor(manifest.mediaDuration / startSeconds),
                'start': startTime,
                'startSeconds': startSeconds,
                'length': length,
                'lengthSeconds': length / timeScale });
              startTime += length;
            }
          }
          
        } else {
          // index-based manifest
          var totalSegmentCount = Math.ceil(manifest.mediaDuration / maxSegmentDuration);

          for (var segmentIndex = 0; segmentIndex < totalSegmentCount; segmentIndex++) {
            var serverSegmentIndex = segmentIndex + firstSegmentIndex;
            startSeconds = segmentIndex * maxSegmentDuration;
            length = Math.min( maxSegmentDuration, manifest.mediaDuration - startSeconds);
            stream.timeline.push({
              'serverSegmentIndex': serverSegmentIndex,
              'start': startSeconds * timeScale,
              'startSeconds': startSeconds,
              'length': length * timeScale,
              'lengthSeconds': length
            });
          }
          
        }
      }
    }

    return manifest;
  }
};

_mix(Dashling.ManifestParser.prototype, EventingMixin);

/// <summary></summary>

// When we calculate how much buffer is remaining, we permit a small blank gap between segments.
var c_permittedGapSecondsBetweenRanges = 0.06;

// When we try to calculate which fragment a "currentTime" value aligns on, we subtract this value from currentTime first.
var c_seekTimeBufferSeconds = 0.5;

Dashling.StreamController = function(videoElement, mediaSource, settings) {
  var _this = this;

  // Provide instanced callbacks that can be removed later.
  _this._onVideoSeeking = _bind(_this, _this._onVideoSeeking);
  _this._onVideoError = _bind(_this, _this._onVideoError);
  _this._onPauseStateChange = _bind(_this, _this._onPauseStateChange);
  _this._onVideoEnded = _bind(_this, _this._onVideoEnded);
  _this._appendNextFragment = _bind(_this, _this._appendNextFragment);
  _this._onThrottledSeek = _bind(_this, _this._onThrottledSeek);
  _this._onVideoRateChange = _bind(_this, _this._onVideoRateChange);

  _this._mediaSource = mediaSource;
  _this._settings = settings;
  _this._bufferRate = [];
  _this._appendedSeconds = 0;
  _this._requestTimerIds = [0, 0];

  _this._intializeVideoElement(videoElement);
  _this._initializeStreams(videoElement, mediaSource, settings);

  // If we have streams and a start time defined in settings, try to initialize the appendIndex correctly.
  if (_this._streams.length && settings && settings.startTime) {
    var stream = _this._streams[0];
    var firstFragmentDuration = stream.fragments[0].time.lengthSeconds;
    this._appendIndex = Math.max(0, Math.min(stream.fragments.length - 1, (Math.floor((settings.startTime - c_seekTimeBufferSeconds) / firstFragmentDuration))));
  }
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
  _stalls: 0,
  _lastCurrentTime: 0,
  _lastTimeBeforeSeek: 0,

  _startTime: 0,

  dispose: function() {
    var _this = this;

    _this.isDisposed = true;
    _this._adjustPlaybackMonitor(false);

    if (_this._videoElement) {
      _this._videoElement.removeEventListener("seeking", _this._onVideoSeeking);
      _this._videoElement.removeEventListener("error", _this._onVideoError);
      _this._videoElement.removeEventListener("play", _this._onPauseStateChange);
      _this._videoElement.removeEventListener("pause", _this._onPauseStateChange);
      _this._videoElement.removeEventListener("ended", _this._onVideoEnded);
      _this._videoElement.removeEventListener("ratechange", _this._onVideoRateChange);

      _this._videoElement = null;
    }

    for (var i = 0; _this._streams && i < _this._streams.length; i++) {
      _this._streams[i].dispose();
    }

    if (_this._requestTimerIds[0]) {
      clearTimeout(_this._requestTimerIds[0]);
      _this._requestTimerIds[0] = 0;
    }

    if (_this._requestTimerIds[1]) {
      clearTimeout(_this._requestTimerIds[1]);
      _this._requestTimerIds[1] = 1;
    }

    if (_this._seekingTimerId) {
      clearTimeout(_this._seekingTimerId);
      _this._seekingTimerId = 0;
    }

    _this._mediaSource = null;

    _this.removeAllEventListeners();
  },

  start: function() {
    this._startTime = new Date().getTime();
    this._setCanPlay(false);
    this._loadNextFragment();
    this._adjustPlaybackMonitor(true);
  },

  getPlayingQuality: function(streamType) {
    /// <summary>
    /// Gets the current playing fragment's quality for the given stream type.
    /// </summary>

    var qualityIndex = 0;

    if (!this.isDisposed) {
      for (var streamIndex = 0; streamIndex < this._streams.length; streamIndex++) {
        var stream = this._streams[streamIndex];

        if (stream.streamType == streamType) {
          var currentTime = this._videoElement.currentTime;
          var fragmentIndex = Math.min(stream.fragments.length - 1, Math.floor(currentTime / stream.fragments[0].time.lengthSeconds));

          qualityIndex = stream.fragments[fragmentIndex].qualityIndex;
          qualityIndex = qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
          break;
        }
      }

    }
    return qualityIndex;
  },

  getBufferingQuality: function(streamType) {
    /// <summary>
    /// Gets the current default current quality for the given stream type.
    /// </summary>

    var qualityIndex = 0;

    if (!this.isDisposed) {
      for (var streamIndex = 0; streamIndex < this._streams.length; streamIndex++) {
        var stream = this._streams[streamIndex];

        if (stream.streamType == streamType) {
          qualityIndex = stream.qualityIndex;
          break;
        }
      }
    }

    return qualityIndex;
  },

  getBufferRate: function() {
    return this._bufferRate.average || 0;
  },

  getRemainingBuffer: function(offsetFromCurrentTime) {
    var _this = this;
    var remainingBuffer = 0;

    if (!_this.isDisposed) {
      var currentTime = (_this._settings.startTime || _this._videoElement.currentTime) + (offsetFromCurrentTime || 0);
      var bufferRanges = _this._videoElement.buffered;

      // Workaround: if the currentTime is 0 and the first range start is less than 1s, default currentTime to start time.
      if (!currentTime && bufferRanges.length > 0 && bufferRanges.start(0) < 1) {
        currentTime = bufferRanges.start(0);
      }

      for (var i = 0; i < bufferRanges.length; i++) {
        if (currentTime >= bufferRanges.start(i) && currentTime <= bufferRanges.end(i)) {
          // We've found the range containing currentTime. Now find the buffered end, ignore small gaps in between ranges.
          var end = bufferRanges.end(i);

          while (++i < bufferRanges.length && (bufferRanges.start(i) - end) < c_permittedGapSecondsBetweenRanges) {
            end = bufferRanges.end(i);
          }

          remainingBuffer = end - currentTime;
          break;
        }
      }
    }

    return remainingBuffer;
  },

  getTimeUntilUnderrun: function(offsetFromCurrentTime) {
    var timeUntilUnderrun = Number.MAX_VALUE;
    var _this = this;

    if (!_this.isDisposed) {
      var currentTime = (_this._settings.startTime || Math.max(0.5, _this._videoElement.currentTime));
      var remainingDuration = _this._settings.manifest.mediaDuration - currentTime - 0.5;
      var remainingBuffer = this.getRemainingBuffer(offsetFromCurrentTime);
      var bufferRate = this.getBufferRate();

      var confidence = (remainingBuffer / this._settings.safeBufferSeconds);

      confidence = Math.min(1, Math.max(0, confidence));

      if (remainingDuration > remainingBuffer) {

        var estimatedAdditionalBuffer = remainingBuffer * bufferRate;

        timeUntilUnderrun = remainingBuffer + (confidence * estimatedAdditionalBuffer);

        // if we're 50% of the way to max or beyond duration.
        if (timeUntilUnderrun > remainingDuration || (timeUntilUnderrun > (_this._settings.maxBufferSeconds * 0.5))) {
          timeUntilUnderrun = Number.MAX_VALUE;
        }
      }
    }

    return timeUntilUnderrun;
  },

  _intializeVideoElement: function(videoElement) {
    var _this = this;

    if (videoElement) {
      _this._videoElement = videoElement;
      videoElement.addEventListener("seeking", _this._onVideoSeeking);
      videoElement.addEventListener("error", _this._onVideoError);
      videoElement.addEventListener("play", _this._onPauseStateChange);
      videoElement.addEventListener("pause", _this._onPauseStateChange);
      videoElement.addEventListener("ended", _this._onVideoEnded);
      videoElement.addEventListener("ratechange", _this._onVideoRateChange);
    }
  },

  _initializeStreams: function(videoElement, mediaSource, settings) {
    // Initializes streams based on manifest content.

    var _this = this;
    var manifestStreams = (settings && settings.manifest && settings.manifest.streams) ? settings.manifest.streams : null;

    _this._streams = [];

    if (manifestStreams) {
      if (manifestStreams.audio) {
        _this._streams.push(new Dashling.Stream("audio", mediaSource, videoElement, settings));
      }
      if (manifestStreams.video) {
        _this._streams.push(new Dashling.Stream("video", mediaSource, videoElement, settings));
      }
    }

    for (i = 0; i < _this._streams.length; i++) {
      stream = _this._streams[i];
      stream.addEventListener(DashlingEvent.download, _forwardDownloadEvent);
      stream.addEventListener(DashlingEvent.sessionStateChange, _forwardSessionStateChange);

      stream.initialize();
    }

    function _forwardDownloadEvent(ev) {
      _this.raiseEvent(DashlingEvent.download, ev);
    }

    function _forwardSessionStateChange(state, errorType, errorMessage) {
      _this.raiseEvent(DashlingEvent.sessionStateChange, state, errorType, errorMessage);
    }
  },

  _loadNextFragment: function() {
    var _this = this;

    if (!_this.isDisposed) {
      var downloads = _this._getDownloadCandidates();

      for (var streamIndex = 0; streamIndex < downloads.length; streamIndex++) {
        var streamDownloads = downloads[streamIndex];
        var stream = _this._streams[streamIndex];

        for (var downloadIndex = 0; downloadIndex < streamDownloads.length; downloadIndex++) {
          var fragmentIndex = streamDownloads[downloadIndex];

          var fragment = stream.fragments[fragmentIndex];
          var previousFragment = stream.fragments[fragmentIndex - 1];
          var previousRequest = previousFragment && previousFragment.activeRequest && previousFragment.activeRequest.state == DashlingFragmentState.downloading ? previousFragment.activeRequest : null;
          var minDelay = stream.getRequestStaggerTime();
          var timeSincePreviousFragment = previousRequest ? new Date().getTime() - previousRequest.startTime : 0;

          if (!previousRequest || timeSincePreviousFragment >= minDelay) {
            stream.load(fragmentIndex, this._appendNextFragment);
          } else {
            _enqueueNextLoad(streamIndex, minDelay - timeSincePreviousFragment);
            break;
          }
        }
      }

      // If we are at the end of our limit, poll every 300ms for more downloadable content.
      if (downloads.isAtMax) {
        _enqueueNextLoad(0, 300);
      }
    }

    function _enqueueNextLoad(index, delay) {
      if (!_this.isDisposed) {
        if (_this._requestTimerIds[index]) {
          clearTimeout(_this._requestTimerIds[index]);
        }

        _this._requestTimerIds[index] = setTimeout(function() {
          _this._requestTimerIds[index] = 0;
          _this._loadNextFragment();
        }, delay);
      }
    }
  },

  _appendNextFragment: function(fragmentLoaded) {
    var _this = this;
    var streams = this._streams;
    var stream;
    var streamIndex;

    if (!_this.isDisposed) {
      var currentTime = _this._settings.startTime || _this._videoElement.currentTime;

      if (streams && streams.length && _this._mediaSource && _this._mediaSource.readyState != "closed") {
        var streamsAppendable = true;

        while (_this._appendIndex < streams[0].fragments.length) {
          // Try to append the current index.
          var canAppend = true;
          var allStreamsAppended = true;

          for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
            stream = streams[streamIndex];
            canAppend &= stream.canAppend(_this._appendIndex);
            allStreamsAppended &= stream.fragments[_this._appendIndex].state == DashlingFragmentState.appended && !stream.isMissing(_this._appendIndex, currentTime);
          }

          if (canAppend) {
            allStreamsAppended = false;

            for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
              stream = streams[streamIndex];

              stream.append(_this._appendIndex, _this._appendNextFragment);
              allStreamsAppended &= stream.fragments[_this._appendIndex].state == DashlingFragmentState.appended;
            }
          }

          // If the append index, and assess playback
          if (allStreamsAppended) {
            // Update buffer rate.
            var fragment = _this._streams[0].fragments[_this._appendIndex];

            if (!fragment.activeRequest._hasUpdatedBufferRate) {
              fragment.activeRequest._hasUpdatedBufferRate = true;

              _this._appendedSeconds += fragment.time.lengthSeconds;
              var now = new Date().getTime();
              var duration = (now - this._startTime) / 1000;

              _addMetric(_this._bufferRate, _this._appendedSeconds / (duration || 0.1), 3);
            }

            _this._appendIndex++;

            // After we're done appending, update the video element's time to the start time if provided.
            if (_this._settings.startTime) {
              try {
                _this._videoElement.currentTime = _this._settings.startTime;
                _this._settings.startTime = 0;
              } catch (e) {}

            }

            _this._checkCanPlay();
          } else {
            break;
          }
        }

        if (_this._appendIndex == streams[0].fragments.length && _this._mediaSource.readyState == "open") {
          _this._mediaSource.endOfStream();
        }

        _this._loadNextFragment();
      }
    }
  },

  _adjustPlaybackMonitor: function(isEnabled) {
    var _this = this;

    if (!isEnabled && _this._playbackMonitorId) {
      clearInterval(_this._playbackMonitorId);
      _this._playbackMonitorId = 0;
    } else if (isEnabled && !_this._playbackMonitorId) {
      _this._playbackMonitorId = setInterval(function() {
        _this._checkCanPlay();
      }, 200);
    }
  },

  _checkCanPlay: function() {
    var _this = this;
    var timeUntilUnderrun = _this.getTimeUntilUnderrun();
    var allowedSeekAhead = 0.5;
    var canPlay = false;

    this._lastCurrentTime = _this._videoElement.currentTime;

    if (_this._canPlay && timeUntilUnderrun < 0.1 && !_this._timeAtStall) {

      _this._timeAtStall = this._lastCurrentTime;

      // We may be stalling! Check in 200ms if we haven't moved. If we have, then go into a buffering state.
      setTimeout(function() {
        var timeAtStall = _this._timeAtStall;

        _this._timeAtStall = 0;

        if (!_this.isDisposed && _this._videoElement.currentTime == timeAtStall) {
          _this._stalls++;
          _this._setCanPlay(false);
        }
      }, 200);
    }

    if (!_this._canPlay) {
      if (timeUntilUnderrun > _this._settings.safeBufferSeconds) {
        this._setCanPlay(true);
      } else if (_this.getTimeUntilUnderrun(allowedSeekAhead) > _this._settings.safeBufferSeconds) {
        // Wiggle ahead the current time.
        _this._videoElement.currentTime = Math.min(_this._videoElement.currentTime + allowedSeekAhead, _this._videoElement.duration);
        this._setCanPlay(true);
      }
    }

    this.raiseEvent(Dashling.Event.sessionStateChange, this._canPlay ? (this._videoElement.paused ? DashlingSessionState.paused : DashlingSessionState.playing) : DashlingSessionState.buffering);
  },

  _allStreamsAppended: function(streams, fragmentIndex) {
    var allStreamsAppended = false;

    for (var streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      allStreamsAppended &= streams[streamIndex].fragments[fragmentIndex] == DashlingFragmentState.appended;
    }

    return allStreamsAppended;
  },

  _getDownloadCandidates: function() {
    /// <summary>
    /// This method builds up an array of arrays, one for each stream, where the contents are the fragment indexes that can
    /// be downloaded.
    ///
    /// There are a number of criteria we need to look at to determine what the candidates are:
    ///
    /// 1. The fragment must be in "idle" or less state.
    /// 2. The index must not start beyond the (currentTime + maxBufferSeconds) max index.
    /// 3. Respect max concurrency: downloading the fragment will not result in concurrent requests than allowed in settings.
    /// 4. The index must not be greater (than an amount specified in settings) than the first "non-ready"
    ///    index of any other stream. (We don't want one stream to get too far ahead of another, it's a waste
    ///    of bandwidth.)
    ///
    /// In order to find candidates that fit all of these criteria, we do this:
    ///
    /// 1. We start with a fragment range that's valid: fragmentAtCurrentTime to (currentTime + maxBufferTime).
    /// 2. We ask the stream to ensure this range's states are correct (by scanning for fragments that report appended but are missing.)
    /// 3. We need to understand what the soonest missing fragment of all streams is. We go find this minMissingIndex value.
    /// 4. From there, we go through each stream and start adding missing indexes to an array, until either any of these occur:
    ///      a. Our active requests + the current length is > max concurrent for the stream
    ///      b. The index exceeds (startIndex + maxSegmentLeadCount)
    ///
    /// Once we have all stream's missing index arrays built, we return the result which is used to enqueue loading.
    /// </summary>

    var _this = this;
    var currentRange = _this._getCurrentFragmentRange();
    var candidates = [];
    var totalCandidates = 0;

    if (currentRange.start > -1) {
      _this._ensureStreamsUpdated(currentRange);

      var firstMissingIndex = _this._getMissingFragmentIndex(currentRange);

      if (firstMissingIndex >= 0) {
        currentRange.start = Math.max(currentRange.start, firstMissingIndex);

        for (var i = 0; i < _this._streams.length; i++) {
          var stream = _this._streams[i];

          candidates.push(_this._getDownloadableIndexes(stream, currentRange));
          totalCandidates += candidates[candidates.length - 1].length;
        }
      }
    }

    // Return a flag indicating when we're unable to return candidates because we have max buffer.
    // That way we know that we need to try to evaluate candidates again soon.
    candidates.isAtMax = !totalCandidates && currentRange.end >= 0 && (currentRange.end < (_this._streams[0].fragments.length - 1));

    return candidates;
  },

  _getCurrentFragmentRange: function() {
    /// <summary>
    // Gets the current fragment range, starting at video currentTime and ending at
    // video end, or time+maxBufferSeconds if it's sooner, and returns as an
    // object: { start: 0, stop: 0 }
    /// </summary>

    var _this = this;
    var videoElement = _this._videoElement;
    var duration = _this._settings.manifest.mediaDuration;
    var range = {
      start: -1,
      end: -1
    };

    if (duration > 0) {
      var currentTime = _this._settings.startTime || videoElement.currentTime;
      var isAtEnd = (currentTime + 0.005) >= duration;
      var firstStream = _this._streams[0];
      var fragmentCount = firstStream.fragments.length;
      var fragmentLength = firstStream.fragments[0].time.lengthSeconds;

      if (!isAtEnd) {
        if (currentTime > c_seekTimeBufferSeconds) {
          currentTime -= c_seekTimeBufferSeconds;
        }
        range.start = Math.max(0, Math.min(fragmentCount - 1, Math.floor(currentTime / fragmentLength)));
        range.end = Math.max(0, Math.min(fragmentCount - 1, Math.ceil((currentTime + _this._settings.maxBufferSeconds) / fragmentLength)));
      }
    }

    return range;
  },

  _ensureStreamsUpdated: function(range) {
    /// <summary>
    // Assess quality level for ABR and check for missing fragments.
    /// </summary>

    var _this = this;

    var currentTime = _this._videoElement.currentTime;

    for (var streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
      stream = _this._streams[streamIndex];

      stream.assessQuality();

      for (var fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
        if (stream.isMissing(fragmentIndex, currentTime)) {
          var fragment = stream.fragments[fragmentIndex];

          _log("Missing fragment reset: stream=" + stream.streamType + " index=" + fragmentIndex + " [" + fragment.time.startSeconds + "]", _this._settings);
          stream.fragments[fragmentIndex].state = DashlingFragmentState.idle;
        }
      }
    }
  },

  _getMissingFragmentIndex: function(range) {
    /// <summary>
    // Gets the first missing fragment index in all streams.
    /// </summary>

    var _this = this;

    for (var fragmentIndex = range.start; fragmentIndex <= range.end; fragmentIndex++) {
      for (var streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
        var fragment = _this._streams[streamIndex].fragments[fragmentIndex];

        if (fragment.state <= DashlingFragmentState.idle) {
          return fragmentIndex;
        }
      }
    }

    return -1;
  },

  _getDownloadableIndexes: function(stream, range) {
    /// <summary>
    // Builds up an array of indexes of download candidates for the stream, taking into consideration
    // the range given, the lead count defined in settings, and the max concurrency for the stream.
    /// </summary>

    var _this = this;
    var indexes = [];

    // Limit the range based on settings for the stream.
    var endIndex = Math.min(range.end, range.start + _this._settings.maxSegmentLeadCount[stream.streamType]);
    var maxRequests = _this._settings.maxConcurrentRequests[stream.streamType] - stream.getActiveRequestCount();

    for (var fragmentIndex = range.start; indexes.length < maxRequests && fragmentIndex <= endIndex; fragmentIndex++) {
      if (stream.fragments[fragmentIndex].state <= DashlingFragmentState.idle) {
        indexes.push(fragmentIndex);
      }
    }

    return indexes;
  },

  _setCanPlay: function(isAllowed) {
    if (this._canPlay !== isAllowed) {
      this._canPlay = isAllowed;
      this._onVideoRateChange();
    }

  },

  _onVideoSeeking: function() {
    if (!this._lastTimeBeforeSeek) {
      this._lastTimeBeforeSeek = this._lastCurrentTime;
    }

    if (this._seekingTimerId) {
      clearTimeout(this._seekingTimerId);
    }

    this._setCanPlay(false);
    this._settings.startTime = 0;

    this._seekingTimerId = setTimeout(this._onThrottledSeek, 300);
  },

  _onThrottledSeek: function() {
    var _this = this;

    if (!_this.isDisposed) {
      var currentTime = _this._videoElement.currentTime;
      var lastTimeBeforeSeek = this._lastTimeBeforeSeek;
      var fragmentIndex = Math.floor(Math.max(0, currentTime - c_seekTimeBufferSeconds) / _this._streams[0].fragments[0].time.lengthSeconds);
      var streamIndex;
      var isBufferAcceptable =
        _this._videoElement.buffered.length == 1 &&
        _this._videoElement.buffered.start(0) <= (Math.max(0, currentTime - 2)) &&
        _this._videoElement.buffered.end(0) > currentTime;

      _log("Throttled seek: " + _this._videoElement.currentTime, _this._settings);

      // Clear variables tracking seek.
      _this._seekingTimerId = 0;
      _this._lastTimeBeforeSeek = 0;
      clearTimeout(_this._nextRequestTimerId);
      _this._nextRequestTimerId = 0;

      // If seeking ahead of the append index, abort all.
      if (_this._appendIndex < fragmentIndex) {

        // Abortttttt
        for (streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
          _this._streams[streamIndex].abortAll();
        }
      }

      if (_this._settings.manifest.mediaDuration > _this._settings.maxBufferSeconds && !isBufferAcceptable) {
        _log("Clearing buffer", _this._settings);

        for (streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
          _this._streams[streamIndex].clearBuffer();
        }
      }

      _this._appendIndex = fragmentIndex;
      _this._appendNextFragment();
    }
  },

  _onVideoError: function() {
    var videoErrors = this._videoElement.error;
    var error = "VideoElementUnexpected";
    var i;

    if (videoErrors) {
      error = videoErrors.code;

      for (i in videoErrors) {
        if (videoErrors[i] == error && i != "code") {
          error = i;
          break;
        }
      }
    }

    this.raiseEvent(Dashling.Event.sessionStateChange, DashlingSessionState.error, error);
  },

  _onPauseStateChange: function() {
    this._adjustPlaybackMonitor(!this._videoElement.paused);
    this._checkCanPlay();
  },

  _onVideoEnded: function() {
    this.raiseEvent(DashlingEvent.sessionStateChange, DashlingSessionState.paused);
  },

  _onVideoRateChange: function() {
    var expectedRate = (this._canPlay ? 1 : 0);

    if (this._videoElement.playbackRate != expectedRate) {
      this._videoElement.playbackRate = this._videoElement.defaultPlaybackRate = expectedRate;
    }
  }
};

_mix(Dashling.StreamController.prototype, EventingMixin);
_mix(Dashling.StreamController.prototype, ThrottleMixin);

function _getBuffered(videoElement) {
  var ranges = "";

  videoElement = videoElement || document.querySelector("video");

  for (var rangeIndex = 0; videoElement && rangeIndex < videoElement.buffered.length; rangeIndex++) {
    ranges += "[" + videoElement.buffered.start(rangeIndex) + "-" + videoElement.buffered.end(rangeIndex) + "] ";
  }

  return ranges;
}

var c_bandwidthStorageKey = "Dashling.Stream.bytesPerSecond";

Dashling.Stream = function(streamType, mediaSource, videoElement, settings) {
  var _this = this;
  var streamInfo = settings.manifest.streams[streamType];

  _mix(_this, {
    fragments: [],
    streamType: streamType,
    qualityIndex: Math.max(0, Math.min(streamInfo.qualities.length - 1, settings.targetQuality[streamType])),
    _startTime: new Date().getTime(),
    _appendLength: 0,
    _appendTimeoutId: 0,
    _initializedQualityIndex: -1,
    _initRequestManager: new Dashling.RequestManager(false, settings),
    _requestManager: new Dashling.RequestManager(streamType == "video", settings),
    _mediaSource: mediaSource,
    _videoElement: videoElement,
    _settings: settings,
    _manifest: settings.manifest,
    _streamInfo: streamInfo,
    _buffer: null,
    _hasInitializedBuffer: false,
    _bufferRate: [],
    _initSegments: []

  });

  var fragmentCount = streamInfo.timeline.length;

  for (var i = 0; i < fragmentCount; i++) {
    _this.fragments.push({
      state: DashlingFragmentState.idle,
      qualityIndex: -1,
      qualityId: "",
      requestType: "media",
      fragmentIndex: i,
      time: streamInfo.timeline[i],
      activeRequest: null,
      requests: []
    });
  }

  _this._requestManager.addEventListener(DashlingEvent.download, _forwardDownloadEvent);
  _this._initRequestManager.addEventListener(DashlingEvent.download, _forwardDownloadEvent);

  function _forwardDownloadEvent(ev) {
    _this.raiseEvent(DashlingEvent.download, ev);
  }
};

Dashling.Stream.prototype = {
  initialize: function() {
    var bufferType = this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs;

    if (!this._buffer) {
      try {
        _log("Creating " + bufferType + " buffer", this._settings);
        this._buffer = this._mediaSource.addSourceBuffer(bufferType);
      } catch (e) {
        this.raiseEvent(
          DashlingEvent.sessionStateChange,
          DashlingSessionState.error,
          DashlingError.sourceBufferInit,
          "type=" + bufferType + " error=" + e);
      }
    }
  },

  dispose: function() {
    if (this._requestManager) {
      this._requestManager.dispose();
    }

    if (this._initRequestManager) {
      this._initRequestManager.dispose();
    }

    this.clearAllThrottles();
    this.removeAllEventListeners();

    this.isDisposed = true;
  },

  abortAll: function() {
    this._requestManager.abortAll();
  },

  clearBuffer: function() {
    var _this = this;

    // Any pending async appends should be cleared/canceled before clearing the buffer.
    clearTimeout(_this._appendTimeoutId);
    this._isAppending = false;
    this.abortAll();

    try {
      _this._buffer.remove(0, _this._videoElement.duration);
    } catch (e) {}

    for (var fragmentIndex = 0; fragmentIndex < _this.fragments.length; fragmentIndex++) {
      var fragment = _this.fragments[fragmentIndex];

      if (fragment.state !== DashlingFragmentState.downloaded) {
        fragment.state = DashlingFragmentState.idle;
      }
    }
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
      if (!this._hasInitializedBuffer) {
        this._hasInitializedBuffer = true;

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
      if (!_this.isDisposed) {

        // Gaurd against buffer clearing and appending too soon afterwards.
        if (_this._buffer.updating) {
          _this._appendTimeoutId = setTimeout(_appendNextEntry, 10);
        } else {
          var request = fragmentsToAppend[0];

          if (fragmentsToAppend.length) {
            buffer.addEventListener("update", _onAppendComplete);

            try {
              _log("Append started: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
              buffer.appendBuffer(request.data);
            } catch (e) {
              _onAppendError(DashlingError.sourceBufferAppendException, e);
            }
          } else {
            // We need to give a small slice of time because the video's buffered region doesn't update immediately after
            // append is complete.
            _this._appendTimeoutId = setTimeout(function() {
              if (!_this.isDisposed) {
                fragment.state = DashlingFragmentState.appended;
                _this._isAppending = false;

                if (_this.isMissing(fragmentIndex, _this._videoElement.currentTime)) {
                  _onAppendError(DashlingError.sourceBufferAppendMissing, "Buffer missing appended fragment");
                } else {
                  var timeSinceStart = (new Date().getTime() - _this._startTime) / 1000;
                  _this._appendLength += fragment.time.lengthSeconds;
                  _addMetric(_this._bufferRate, _this._appendLength / timeSinceStart, 5);
                  onComplete(fragment);
                }
              }
            }, 30);
          }
        }
      }
    }

    function _onAppendComplete() {
      if (!_this.isDisposed) {
        var request = fragmentsToAppend[0];

        buffer.removeEventListener("update", _onAppendComplete);

        request.timeAtAppended = new Date().getTime() - request.startTime;
        request.state = DashlingFragmentState.appended;

        if (request.clearDataAfterAppend) {
          request.data = null;
        }

        if (request.requestType === "init") {
          _this._initializedQualityIndex = request.qualityIndex;
        }

        _log("Append complete: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
        fragmentsToAppend.shift();

        _appendNextEntry();
      }
    }

    function _onAppendError(error, details) {

      details = details || "";

      var statusCode = "error=" + details + " (quality=" + fragment.qualityId + (fragment.fragmentIndex !== undefined ? " index=" + fragment.fragmentIndex : "") + ")";

      fragment.state = DashlingFragmentState.error;
      _this._isAppending = false;

      _log("Append exception: " + statusCode);
      _this.raiseEvent(DashlingEvent.sessionStateChange, DashlingSessionState.error, error, statusCode);
    }
  },

  getBufferRate: function() {
    return this._bufferRate.average || 0;
  },

  getActiveRequestCount: function() {
    return this._requestManager.getActiveRequestCount();
  },

  getRequestStaggerTime: function() {
    // TODO Remove 1.4 magic ratio
    return Math.round(this._estimateDownloadSeconds(this.qualityIndex) * 1400);
  },

  isMissing: function(fragmentIndex, currentTime) {
    var fragment = this.fragments[fragmentIndex];

    return (fragment.state == DashlingFragmentState.appended) && !this.isBuffered(fragmentIndex, currentTime);
  },

  isBuffered: function(fragmentIndex, currentTime) {
    var fragment = this.fragments[fragmentIndex];
    var isBuffered = false;

    if (fragment) {
      var bufferRanges = this._buffer.buffered;
      var fragmentTime = fragment.time;

      // Allow for up to .5 second of wiggle room at start of playback. else be more meticulous.
      var atStart = fragmentTime.startSeconds < 0.3;
      var atEnd = (fragmentTime.startSeconds + fragmentTime.lengthSeconds + 0.3) >= (this._manifest.mediaDuration);

      var safeStartTime = Math.max(currentTime, fragmentTime.startSeconds + (atStart ? 0.8 : 0.15));
      var safeEndTime = fragmentTime.startSeconds + fragmentTime.lengthSeconds - (atEnd ? 0.8 : 0.15);

      try {
        // validate that the buffered area in the video element still contains the fragment.
        for (var bufferedIndex = 0; bufferedIndex < bufferRanges.length; bufferedIndex++) {
          if ((bufferRanges.start(bufferedIndex) <= safeStartTime) && (bufferRanges.end(bufferedIndex) >= safeEndTime)) {
            isBuffered = true;
            break;
          }
        }
      } catch (e) {
        // Accessing the buffer can fail with an InvalidState error if an error has occured with the mediasource. (like a decode error)
        // TODO: Something better, for now marks as buffered so we don't spin trying to get the item.
        isBuffered = true;
      }
    }

    return isBuffered;
  },

  canLoad: function(fragmentIndex) {
    return (this.fragments[fragmentIndex].state <= DashlingFragmentState.idle);
  },

  load: function(fragmentIndex, onFragmentAvailable) {
    var _this = this;
    var fragment = this.fragments[fragmentIndex];

    if (fragment && fragment.state <= DashlingFragmentState.idle) {
      fragment.state = DashlingFragmentState.downloading;
      fragment.qualityIndex = _this.qualityIndex;
      fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;

      _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);

      var request = {
        url: _this._getUrl(fragmentIndex, fragment),
        state: DashlingFragmentState.downloading,
        fragmentIndex: fragmentIndex,
        requestType: "media",
        qualityIndex: fragment.qualityIndex,
        qualityId: fragment.qualityId,
        clearDataAfterAppend: true,
        isArrayBuffer: true,
        onSuccess: _onSuccess,
        onError: _onError
      };

      fragment.activeRequest = request;
      fragment.requests.push(request);

      _log("Download started: " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index=" + request.fragmentIndex : "") + " time=" + (new Date().getTime() - _this._startTime) + "ms stagger=" + _this.getRequestStaggerTime() + "ms", _this._settings);

      _this._requestManager.load(request);
    }

    function _onSuccess(request) {
      if (!_this.isDisposed) {
        fragment.state = DashlingFragmentState.downloaded;

        var timeDownloading = Math.round(request.timeAtLastByte - (request.timeAtEstimatedFirstByte || request.timeAtFirstByte));
        var timeWaiting = request.timeAtLastByte - timeDownloading;

        _log("Download complete: " + request.qualityId + " " + request.requestType + " index: " + request.fragmentIndex + " waiting: " + timeWaiting + "ms receiving: " + timeDownloading, _this._settings);

        onFragmentAvailable(fragment);
      }
    }

    function _onError(request) {
      if (!_this.isDisposed) {
        if (!request.isAborted) {
          fragment.state = DashlingFragmentState.error;

          // Stop the session on a fragment download failure.
          _this.raiseEvent(DashlingEvent.sessionStateChange, DashlingSessionState.error, DashlingError.mediaSegmentDownload, request.statusCode);
        } else {
          fragment.state = DashlingFragmentState.idle;
          fragment.activeRequest = null;
          fragment.requests = [];
        }
      }
    }
  },

  assessQuality: function() {
    var _this = this;
    var settings = _this._settings;
    var bytesPerSecond = _this._requestManager.getAverageBytesPerSecond();
    var maxQuality = _this._streamInfo.qualities.length - 1;

    if (!bytesPerSecond) {
      bytesPerSecond = parseFloat(localStorage.getItem(c_bandwidthStorageKey));
    } else if (this.streamType === "video") {
      localStorage.setItem(c_bandwidthStorageKey, bytesPerSecond);
    }

    if (!settings.isABREnabled || !bytesPerSecond) {
      _this.qualityIndex = Math.min(_this._streamInfo.qualities.length - 1, settings.targetQuality[_this.streamType]);
    } else if (settings.isRBREnabled) {
      _this.qualityIndex = Math.round(Math.random() * maxQuality);
    } else {
      var targetQuality = 0;
      var logEntry = "Quality check " + _this.streamType + ": bps=" + Math.round(bytesPerSecond);
      var segmentLength = _this._streamInfo.timeline[0].lengthSeconds;
      var averageWaitPerSegment = segmentLength * 0.4;

      for (var qualityIndex = 0; qualityIndex <= maxQuality; qualityIndex++) {
        var duration = _this._estimateDownloadSeconds(qualityIndex, 0);

        logEntry += " " + qualityIndex + "=" + duration.toFixed(2) + "s";

        if ((duration + averageWaitPerSegment) < segmentLength) {
          targetQuality = qualityIndex;
        }
      }

      _this.throttle(function() {
        _log(logEntry, _this._settings);
      }, "assess", 1000, false, false);

      _this.qualityIndex = targetQuality;
    }
  },

  _estimateDownloadSeconds: function(qualityIndex, fragmentIndex) {
    var _this = this;
    var duration = 0;
    var quality = _this._streamInfo.qualities[qualityIndex];
    var segmentLength = _this._streamInfo.timeline[fragmentIndex || 0].lengthSeconds;
    var bandwidth = quality.bandwidth / 8;
    var totalBytes = bandwidth * segmentLength;
    var bytesPerSecond = _this._requestManager.getAverageBytesPerSecond();

    if (!bytesPerSecond) {
      bytesPerSecond = parseFloat(localStorage.getItem(c_bandwidthStorageKey));
    } else if (this.streamType === "video") {
      localStorage.setItem(c_bandwidthStorageKey, bytesPerSecond);
    }

    var averageBytesPerSecond = bytesPerSecond || _this._settings.defaultBandwidth;

    return totalBytes / averageBytesPerSecond;
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
        requestType: "init",
        qualityIndex: qualityIndex,
        qualityId: this._streamInfo.qualities[qualityIndex].id,
        isArrayBuffer: true,
        onSuccess: _onSuccess,
        onError: _onError
      };

      _log("Download started: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

      _this._initRequestManager.load(request);
    }

    function _onSuccess() {
      if (!_this.isDisposed) {
        request.state = DashlingFragmentState.downloaded;

        _log("Download complete: " + _this.streamType + " " + request.qualityId + " " + request.requestType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

        onFragmentAvailable(request);
      }
    }

    function _onError() {
      if (!_this.isDisposed) {
        request.state = DashlingFragmentState.error;

        // Stop the session on a fragment download failure.
        _this.raiseEvent(DashlingEvent.sessionStateChange, DashlingSessionState.error, DashlingError.initSegmentDownload, request.statusCode);
      }
    }
  },

  _getInitUrl: function(qualityIndex) {
    var urlPart = this._streamInfo.initUrlFormat.replace("$RepresentationID$", this._streamInfo.qualities[qualityIndex].id);

    return this._manifest.baseUrl + urlPart;
  },

  _getUrl: function(fragmentIndex, fragment) {
    var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start).replace("$Number$", fragment.time.serverSegmentIndex);

    return this._manifest.baseUrl + urlPart;
  }

};

_mix(Dashling.Stream.prototype, EventingMixin);
_mix(Dashling.Stream.prototype, ThrottleMixin);

Dashling.RequestManager = function(shouldRecordStats, settings) {
  _mix(this, {
    _settings: settings,
    _activeRequests: {},
    _retryTimeoutIds: {},
    _waitTimes: [],
    _receiveTimes: [],
    _bytesPerSeconds: [],
    _shouldRecordStats: shouldRecordStats,
    _maxRetries: settings.maxRetries,
    _delaysBetweenRetries: settings.delaysBetweenRetries
  });
};

var RequestManagerState = {
  noPendingRequests: 0,
  waitingForResponse: 1,
  receivingData: 2,
  receivingParallelData: 3
};

Dashling.RequestManager.prototype = {
  _activeRequestCount: 0,
  _totalRequests: 0,
  _xhrType: XMLHttpRequest,

  dispose: function() {
    this.abortAll();
    this.removeAllEventListeners();
  },

  getActiveRequestCount: function() {
    return this._activeRequestCount;
  },

  abortAll: function() {

    for (var timeoutId in this._retryTimeoutIds) {
      clearTimeout(timeoutId);
    }

    for (var requestIndex in this._activeRequests) {
      var xhr = this._activeRequests[requestIndex];

      _log("Aborting request: " + xhr.url, this._settings);
      xhr.isAborted = true;
      xhr.abort();
    }

    this._retryTimeoutIds = {};
    this._activeRequests = {};
  },

  load: function(request) {
    var _this = this;
    var maxRetries = this._maxRetries;
    var retryIndex = -1;
    var delaysBetweenRetries = this._delaysBetweenRetries;
    var requestIndex = _this._totalRequests + 1;

    request.retryCount = 0;
    _startRequest();

    function _startRequest() {
      delete _this._retryTimeoutIds[requestIndex];

      var xhr = new _this._xhrType();

      _this._activeRequests[requestIndex] = xhr;
      _this._activeRequestCount++;
      _this._totalRequests++;

      xhr.url = request.url;
      xhr.open("GET", request.url, true);

      if (request.isArrayBuffer) {
        xhr.responseType = "arraybuffer";
      }

      xhr.timeout = _this._settings.requestTimeout;

      xhr.onreadystatechange = function() {
        if (xhr.readyState > 0 && request.timeAtFirstByte < 0) {
          request.timeAtFirstByte = new Date().getTime() - request.startTime;
        }
      };

      xhr.onprogress = function(ev) {
        request.progressEvents.push({
          timeFromStart: new Date().getTime() - request.startTime,
          bytesLoaded: ev.lengthComputable ? ev.loaded : -1
        });

        _this._postProgress(request.progressEvents, false);
      };

      xhr.onloadend = function() {
        delete _this._activeRequests[requestIndex];
        _this._activeRequestCount--;

        request.timeAtLastByte = new Date().getTime() - request.startTime;

        if (xhr.status >= 200 && xhr.status <= 299) {
          request.bytesLoaded = request.isArrayBuffer ? xhr.response.byteLength : xhr.responseText ? xhr.responseText.length : 0;

          // Ensure we've recorded firstbyte time.
          xhr.onreadystatechange();

          _this._postProgress(request.progressEvents, true);

          if (request.progressEvents.length > 2) {
            var lastEvent = request.progressEvents[request.progressEvents.length - 1];
            var firstEvent = request.progressEvents[0];
            var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
            var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

            request.bytesPerMillisecond = bytesLoaded / timeDifference;
            request.timeAtFirstByte = request.timeAtLastByte - (request.bytesLoaded / request.bytesPerMillisecond);
          }

          request.data = request.isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
          request.statusCode = xhr.status;
          request.state = DashlingFragmentState.downloaded;

          if (request.onSuccess) {
            request.onSuccess(request);
          }
        } else {
          _onError(request);
        }

        // Don't fire events for cache hits.
        if (request.timeAtLastByte > _this._settings.requestCacheThreshold) {
          _addMetric(_this._waitTimes, request.timeAtFirstByte, 20);
          _addMetric(_this._receiveTimes, request.timeAtLastByte - request.timeAtFirstByte, 20);
          _this.raiseEvent(Dashling.Event.download, request);
        }
      };


      function _onError() {

        if (xhr.status === 0 && request.timeAtLastByte >= _this._settings.requestTimeout) {
          xhr.isTimedOut = true;
        }

        if (_this._isRetriable(xhr) && ++retryIndex < maxRetries) {

          request.retryCount++;
          _this._retryTimeoutIds[requestIndex] = setTimeout(_startRequest, delaysBetweenRetries[Math.min(delaysBetweenRetries.length - 1, retryIndex)]);
        } else {
          request.state = DashlingFragmentState.error;
          request.hasError = true;
          request.isAborted = xhr.isAborted;
          request.statusCode = xhr.isAborted ? "aborted" : xhr.isTimedOut ? "timeout" : xhr.status;

          if (request.onError) {
            request.onError(request);
          }
        }
      }

      request.state = DashlingFragmentState.downloading;

      request.progressEvents = [];
      request.timeAtFirstByte = -1;
      request.timeAtLastByte = -1;
      request.startTime = new Date().getTime();

      xhr.send();
    }
  },

  _isRetriable: function(xhr) {
    return (!xhr.isAborted && xhr.status != 404);
  },

  _postProgress: function(progressEvents, isComplete) {
    if (progressEvents.length > 2) {
      var lastEvent = progressEvents[progressEvents.length - 1];
      var firstEvent = progressEvents[0];
      var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

      if (bytesLoaded > 10000) {
        var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;

        if (timeDifference > 5 && (isComplete || this._bytesPerSeconds.length < 5)) {
          _addMetric(this._bytesPerSeconds, (bytesLoaded * 1000) / timeDifference, 20);
        }
      }

    }
  },

  getAverageWait: function() {
    return this._waitTimes.average || 0;
  },

  getAverageReceive: function() {
    return this._receiveTimes.average || 0;
  },

  getAverageBytesPerSecond: function() {
    return this._bytesPerSeconds.average || 0;
  }
};

_mix(Dashling.RequestManager.prototype, EventingMixin);

})();