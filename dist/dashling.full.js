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

function _average(numbers, startIndex) {
  startIndex = Math.max(0, startIndex || 0);

  var total = 0;
  var count = numbers ? numbers.length - startIndex : 0;

  if (count) {
    for (startIndex; startIndex < numbers.length; startIndex++) {
      total += numbers[startIndex];
    }
    total /= count;
  }

  return total;
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
var ThrottleMixin = {
  throttle: function(func, id, minTime, shouldReset, shouldCallImmediately) {
    var _this = this;

    (!_this._throttleIds) && (_this._throttleIds = {});
    (shouldReset) && (_this.clearThrottle(id));

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
  initializing: 1,
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
Dashling.Settings = {
  // The manifest object to use, if you want to skip the serial call to fetch the xml.
  manifest: null,

  // Default start time for video, in seconds.
  startTime: 0,

  // If auto bitrate regulation is enabled.
  isABREnabled: true,

  // The quality to use if we have ABR disabled, or if default bandwidth is not available.
  targetQuality: {
    audio: 2,
    video: 2
  },

  // If we should auto play the video when enough buffer is available.
  shouldAutoPlay: true,

  // Logs debug data to console.
  logToConsole: true,

  // TODO: Number of buffered seconds in which we will start to be more aggressive on estimates.
  safeBufferSeconds: 15,

  // Number of buffered seconds before we stop buffering more.
  maxBufferSeconds: 119.5,

  // Max number of simultaneous requests per stream.
  maxConcurrentRequests: {
    audio: 4,
    video: 6
  },

  // Max number of fragments each stream can be ahead of the other stream by.
  maxSegmentLeadCount: {
    audio: 3,
    video: 5
  },

  // Default bytes per millisecond, used to determine default request staggering (480p is around 520 bytes per millisecond.)
  defaultBandwidth: 520,

  // Default request timeout
  requestTimeout: 3000, //30000,

  // Number of attempts beyond original request to try downloading something.
  maxRetries: 3,

  // Millisecond delays between retries.
  delaysBetweenRetries: [5000] //[200, 1500, 3000]
};
Dashling.ManifestParser = function(settings) {
  this._requestManager = new Dashling.RequestManager(false, settings);
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
      url: url
    };

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
    var xmlDoc = parser.parseFromString(manifestText, "text/xml");
    var i;

    manifest.baseUrl = _getXmlNodeValue(xmlDoc, "BaseURL", "");
    manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
    manifest.streams = {};

    var adaptations = [
      xmlDoc.querySelector("AdaptationSet[contentType='audio']"),
      xmlDoc.querySelector("AdaptationSet[contentType='video']")
    ];

    for (var adaptIndex = 0; adaptIndex < adaptations.length; adaptIndex++) {
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
              lengthSeconds: duration / timeScale
            });

            startTime += duration;
          }
        }
      }
    }

    return manifest;
  }
};
/// <summary></summary>

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
  _this._startTime = new Date().getTime();

  _this._timeSinceLastBuffer = new Date().getTime();
  _this._bufferRate = [];
  _this._appendedSeconds = 0;

  _this._streams = [
    _this._audioStream = new Dashling.Stream("audio", mediaSource, videoElement, settings),
    _this._videoStream = new Dashling.Stream("video", mediaSource, videoElement, settings)
  ];

  _this._requestTimerIds = [0, 0];

  var firstFragmentDuration = _this._audioStream.fragments[0].time.lengthSeconds;

  // If a start time has been provided, start at the right location.
  if (settings.startTime && firstFragmentDuration) {
    this._appendIndex = Math.max(0, Math.min(_this._audioStream.fragments.length - 1, (Math.floor((settings.startTime - .5) / firstFragmentDuration))));
  }

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

  getBufferRate: function() {
    return _average(this._bufferRate);
  },

  getRemainingBuffer: function() {
    var remainingBuffer = 0;

    if (this._videoElement) {
      var currentTime = this._videoElement.currentTime;
      var timeRemaining = this._videoElement.duration - currentTime;
      var bufferRanges = this._videoElement.buffered;

      for (var i = 0; i < bufferRanges.length; i++) {
        if (currentTime >= bufferRanges.start(i) && currentTime <= bufferRanges.end(i)) {
          remainingBuffer = bufferRanges.end(i) - currentTime;
          break;
        }
      }
    }

    return remainingBuffer;
  },

  getTimeUntilUnderrun: function() {
    var currentTime = this._videoElement.currentTime;
    var remainingDuration = this._videoElement.duration - currentTime;
    var remainingBuffer = this.getRemainingBuffer() + .5;
    var bufferRate = this.getBufferRate();
    var timeUntilUnderrun = Number.MAX_VALUE;

    if (remainingDuration > remainingBuffer && bufferRate < 1) {
      var safeBufferRatio = Math.pow(Math.min(1, Math.max(0, remainingBuffer / this._settings.safeBufferSeconds)), 2);

      timeUntilUnderrun = bufferRate < 1 ? safeBufferRatio * (remainingBuffer / (1 - bufferRate)) : Number.MAX_VALUE;
    }

    return timeUntilUnderrun;
  },

  _loadNextFragment: function() {
    var _this = this;

    if (_this._streams) {
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
      if (!downloads[0].length && !downloads[1].length && downloads.hitMaxLimit) {
        _enqueueNextLoad(0, 300);
      }
    }

    function _enqueueNextLoad(index, delay) {
      if (_this._requestTimerIds[index]) {
        clearTimeout(_this._requestTimerIds[index]);
      }

      _this._requestTimerIds[index] = setTimeout(function() {
        _this._requestTimerIds[index] = 0;
        _this._loadNextFragment();
      }, delay);
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

        // If the append index, and assess playback
        if (allStreamsAppended) {
          // Update buffer rate.
          var fragment = _this._streams[0].fragments[_this._appendIndex];

          if (!fragment.activeRequest._hasUpdatedBufferRate) {
            fragment.activeRequest._hasUpdatedBufferRate = true;

            _this._appendedSeconds += fragment.time.lengthSeconds;
            var now = new Date().getTime();
            var duration = (now - this._startTime) / 1000;
            _this._bufferRate.push(_this._appendedSeconds / (duration || .1));
            //this._timeSinceLastBuffer = now;

            while (_this._bufferRate.length > 3) {
              _this._bufferRate.shift();
            }
          }

          _this._appendIndex++;

          // After we're done appending, update the video element's time to the start time if provided.
          if (_this._settings.startTime) {
            _this._videoElement.currentTime = _this._settings.startTime;
            _this._settings.startTime = 0;
          }

          var canPlay = this.getTimeUntilUnderrun() > this._settings.safeBufferSeconds;

          if (canPlay && this._settings.shouldAutoPlay && !this._hasAutoPlayed) {
            this._hasAutoPlayed = true;
            this._videoElement.play();
          }
        } else {
          break;
        }
      }

      _this._loadNextFragment();
    }
  },

  _getDownloadCandidates: function() {
    var _this = this;
    var downloadList = [
      [],
      []
    ];
    var streams = _this._streams;
    var settings = _this._settings;
    var streamIndex;
    var fragmentLength = _this._audioStream.fragments[0].time.lengthSeconds;
    var currentTime = _this._settings.startTime || _this._videoElement.currentTime;
    var currentSegment = Math.floor(_this._videoElement.currentTime / fragmentLength);
    var maxIndex = currentSegment + Math.ceil(settings.maxBufferSeconds / fragmentLength);
    var maxAudioIndex = -1;
    var maxVideoIndex = -1;
    var fragmentCount = _this._videoStream.fragments.length;
    var fragmentIndex;

    for (fragmentIndex = _this._appendIndex; fragmentIndex <= maxIndex && fragmentIndex < fragmentCount; fragmentIndex++) {

      if (this._audioStream.isMissing(fragmentIndex) || this._videoStream.isMissing(fragmentIndex)) {
        _log("Missing fragment reset: index=" + fragmentIndex, _this._settings);
        this._audioStream.fragments[fragmentIndex].state = this._videoStream.fragments[fragmentIndex].state = DashlingFragmentState.idle;
      }

      _this._audioStream.assessQuality();
      _this._videoStream.assessQuality();

      var canLoadAudio = this._audioStream.canLoad(fragmentIndex);
      var canLoadVideo = this._videoStream.canLoad(fragmentIndex);

      if (maxVideoIndex == -1 && this._audioStream.fragments[fragmentIndex].state < DashlingFragmentState.downloaded) {
        maxVideoIndex = fragmentIndex + settings.maxSegmentLeadCount.video;
      }

      if (maxAudioIndex == -1 && this._videoStream.fragments[fragmentIndex].state < DashlingFragmentState.downloaded) {
        maxAudioIndex = fragmentIndex + settings.maxSegmentLeadCount.audio;
      }

      // Ensure we don't try to load segments too far ahead of the other
      var isAudioInRange = (maxAudioIndex == -1 || maxAudioIndex >= fragmentIndex);
      var isVideoInRange = (maxVideoIndex == -1 || maxVideoIndex >= fragmentIndex);

      // Ensure we don't try to suggest loading more requests than we can execute.
      var audioRequestsHaveRoom = (this._audioStream.getActiveRequestCount() + downloadList[0].length + 1) < settings.maxConcurrentRequests.audio;
      var videoRequestsHaveRoom = (this._videoStream.getActiveRequestCount() + downloadList[1].length) < settings.maxConcurrentRequests.video;

      if (canLoadAudio && isAudioInRange && audioRequestsHaveRoom) {
        downloadList[0].push(fragmentIndex);
      }

      if (canLoadVideo && isVideoInRange && videoRequestsHaveRoom) {
        downloadList[1].push(fragmentIndex);
      }

      if ((!audioRequestsHaveRoom || !isAudioInRange) &&
        (!videoRequestsHaveRoom || !isVideoInRange)) {
        break;
      }
    }

    if (fragmentIndex > maxIndex && fragmentIndex < fragmentCount) {
      downloadList.hitMaxLimit = true;
    }

    return downloadList;
  },

  _onVideoSeeking: function() {
    if (this._seekingTimerId) {
      clearTimeout(this._seekingTimerId);
    }

    this._settings.startTime = 0;
    this._seekingTimerId = setTimeout(this._onThrottledSeek, 500);
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

_mix(Dashling.StreamController.prototype, ThrottleMixin);
var c_bandwidthStorageKey = "Dashling.Stream.bandwidth";

Dashling.Stream = function(streamType, mediaSource, videoElement, settings) {

  var _this = this;
  var streamInfo = settings.manifest.streams[streamType];

  _mix(_this, {
    fragments: [],
    qualityIndex: Math.max(0, Math.min(streamInfo.qualities.length - 1, settings.targetQuality[streamType])),
    _startTime: new Date().getTime(),
    _appendLength: 0,
    _initializedQualityIndex: -1,
    _initRequestManager: new Dashling.RequestManager(false, settings),
    _requestManager: new Dashling.RequestManager(streamType == "video", settings),
    _streamType: streamType,
    _mediaSource: mediaSource,
    _videoElement: videoElement,
    _settings: settings,
    _manifest: settings.manifest,
    _streamInfo: streamInfo,
    _buffer: null,
    _bufferRate: [],
    _initSegments: []
  });

  var fragmentCount = streamInfo.timeline.length;

  for (var i = 0; i < fragmentCount; i++) {
    _this.fragments.push({
      state: DashlingFragmentState.idle,
      qualityIndex: -1,
      qualityId: "",
      fragmentType: "media",
      fragmentIndex: i,
      time: streamInfo.timeline[i],
      activeRequest: null,
      requests: []
    });
  }
};

Dashling.Stream.prototype = {
  dispose: function() {

    this.clearAllThrottles();

    if (this._requestManager) {
      this._requestManager.dispose();
      this._requestManager = null;
    }
  },

  abortAll: function() {
    this._requestManager.abortAll();
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
      if (!buffer) {
        buffer = _this._getSourceBuffer();
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
      var request = fragmentsToAppend[0];

      if (fragmentsToAppend.length) {
        buffer.addEventListener("update", _onAppendComplete);

        try {
          _log("Append started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
          buffer.appendBuffer(request.data);
        } catch (e) {
          request.state = fragment.state = DashlingFragmentState.error;
          _this._isAppending = false;

          onComplete();
          // TODO: Fire error?
        }
      } else {
        fragment.state = DashlingFragmentState.appended;
        _this._isAppending = false;

        var timeSinceStart = (new Date().getTime() - _this._startTime) / 1000;

        _this._appendLength += fragment.time.lengthSeconds;
        _this._bufferRate.push(_this._appendLength / timeSinceStart);

        if (_this._bufferRate.length > 3) {
          _this._bufferRate.shift();
        }

        onComplete(fragment);
      }
    }

    function _onAppendComplete() {
      var request = fragmentsToAppend[0];

      buffer.removeEventListener("update", _onAppendComplete);

      request.timeAtAppended = new Date().getTime() - request.startTime;
      request.state = DashlingFragmentState.appended;

      (request.clearDataAfterAppend) && (request.data = null);

      if (request.fragmentType === "init") {
        _this._initializedQualityIndex = request.qualityIndex;
      }

      _log("Append complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);
      fragmentsToAppend.shift();

      _appendNextEntry();
    }
  },

  getBufferRate: function() {
    return _average(this._bufferRate);
  },

  getActiveRequestCount: function() {
    return this._requestManager.getActiveRequestCount();
  },

  getRequestStaggerTime: function() {
    // TODO Remove 1.4 magic ratio
    return Math.round(this._getDownloadMsForQuality(this.qualityIndex) * 1.4);
  },

  isMissing: function(fragmentIndex) {
    var fragment = this.fragments[fragmentIndex];
    var isMissing = false;
    var isBuffered = false;

    if (fragment) {
      if (fragment.state == DashlingFragmentState.appended) {

        try {
          var bufferRanges = this._buffer.buffered;
          var fragmentTime = fragment.time;
          var wiggleRoom = 0.5;

          // validate that the buffered area in the video element still contains the fragment.
          for (var bufferedIndex = 0; bufferedIndex < bufferRanges.length; bufferedIndex++) {
            if ((bufferRanges.start(bufferedIndex) - wiggleRoom) <= fragmentTime.startSeconds && (bufferRanges.end(bufferedIndex) + wiggleRoom) >= (fragmentTime.startSeconds + fragmentTime.lengthSeconds)) {
              isBuffered = true;
              break;
            }
          }
        } catch (e) {
          // Accessing the buffer can fail with an InvalidState error if an error has occured with the mediasource. (like a decode error)
          // TODO: Something better, for now marks as buffered so we don't spin trying to get the item.
          isBuffered = true;
        }

        // We found an appended segment no longer in the playlist.
        isMissing = !isBuffered;
      }
    }

    return isMissing;
  },

  canLoad: function(fragmentIndex) {
    return (this.fragments[fragmentIndex].state <= DashlingFragmentState.idle);
  },

  load: function(fragmentIndex, onFragmentAvailable) {
    var _this = this;
    var fragment = this.fragments[fragmentIndex];

    //this.assessQuality(fragmentIndex);

    if (fragment && fragment.state <= DashlingFragmentState.idle) {
      fragment.state = DashlingFragmentState.downloading;
      fragment.qualityIndex = _this.qualityIndex;
      fragment.qualityId = this._streamInfo.qualities[fragment.qualityIndex].id;

      _this._loadInitSegment(this.qualityIndex, onFragmentAvailable);

      var request = {
        url: _this._getUrl(fragmentIndex, fragment),
        state: DashlingFragmentState.downloading,
        fragmentIndex: fragmentIndex,
        fragmentType: "media",
        qualityIndex: fragment.qualityIndex,
        qualityId: fragment.qualityId,
        clearDataAfterAppend: true
      };

      fragment.activeRequest = request;
      fragment.requests.push(request);

      _log("Download started: " + request.qualityId + " " + request.fragmentType + " " + (request.fragmentIndex !== undefined ? "index=" + request.fragmentIndex : "") + " time=" + (new Date().getTime() - _this._startTime) + "ms stagger=" + _this.getRequestStaggerTime() + "ms", _this._settings);

      _this._requestManager.load(request, true, _onSuccess, _onFailure);
    }

    function _onSuccess(request) {
      fragment.state = DashlingFragmentState.downloaded;

      var timeDownloading = Math.round(request.timeAtLastByte - (request.timeAtEstimatedFirstByte || request.timeAtFirstByte));
      var timeWaiting = request.timeAtLastByte - timeDownloading;

      _log("Download complete: " + request.qualityId + " " + request.fragmentType + " index: " + request.fragmentIndex + " waiting: " + timeWaiting + "ms receiving: " + timeDownloading, _this._settings);

      onFragmentAvailable(fragment);
    }

    function _onFailure() {

      if (fragment.state != "aborted") {
        fragment.state = DashlingFragmentState.error;
      } else {
        fragment.state = DashlingFragmentState.idle;
        fragment.activeRequest = null;
        fragment.requests = [];
      }
    }
  },

  assessQuality: function() {
    var _this = this;
    var settings = _this._settings;
    var averageBandwidth = _this._requestManager.getAverageBandwidth();
    var maxQuality = _this._streamInfo.qualities.length - 1;

    if (!averageBandwidth) {
      averageBandwidth = parseFloat(localStorage.getItem(c_bandwidthStorageKey));
    } else if (this._streamType === "video") {
      localStorage.setItem(c_bandwidthStorageKey, averageBandwidth);
    }

    if (!settings.isABREnabled || !averageBandwidth) {
      _this.qualityIndex = Math.min(_this._streamInfo.qualities.length - 1, settings.targetQuality[_this._streamType]);
    } else {
      var targetQuality = 0;
      var logEntry = "Quality check " + _this._streamType + ": bps=" + Math.round(averageBandwidth * 1000);
      var segmentLength = _this._streamInfo.timeline[0].lengthSeconds;
      var averageWaitPerSegment = segmentLength * .4;

      for (var qualityIndex = 0; qualityIndex <= maxQuality; qualityIndex++) {
        var duration = _this._getDownloadMsForQuality(qualityIndex, 0, averageBandwidth);

        logEntry += " " + qualityIndex + "=" + Math.round(duration) + "ms";

        if (((duration / 1000) + averageWaitPerSegment) < segmentLength) {
          targetQuality = qualityIndex;
        }
      }

      _this.throttle(function() {
        _log(logEntry, _this.settings);
      }, "assess", 1000, false, false);

      _this.qualityIndex = targetQuality;
    }
  },

  _getDownloadMsForQuality: function(qualityIndex, fragmentIndex) {
    var _this = this;
    var duration = 0;
    var quality = _this._streamInfo.qualities[qualityIndex];
    var segmentLength = _this._streamInfo.timeline[fragmentIndex || 0].lengthSeconds;
    var bandwidth = quality.bandwidth / 8;
    var totalBytes = bandwidth * segmentLength;
    var averageBandwidth = _this._requestManager.getAverageBandwidth();

    if (!averageBandwidth) {
      averageBandwidth = parseFloat(localStorage.getItem(c_bandwidthStorageKey));
    } else if (this._streamType === "video") {
      localStorage.setItem(c_bandwidthStorageKey, averageBandwidth);
    }

    var averageBytesPerMillisecond = averageBandwidth || _this._settings.defaultBandwidth;

    return totalBytes / averageBytesPerMillisecond;
  },

  _getSourceBuffer: function() {
    if (!this._buffer) {
      this._buffer = this._mediaSource.addSourceBuffer(this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs);
    }

    return this._buffer;
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

      _log("Download started: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

      _this._initRequestManager.load(request, true, _onSuccess, _onFailure);
    }

    function _onSuccess() {
      request.state = DashlingFragmentState.downloaded;

      _log("Download complete: " + _this._streamType + " " + request.qualityId + " " + request.fragmentType + " " + (request.fragmentIndex !== undefined ? "index " + request.fragmentIndex : ""), _this._settings);

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

  _getUrl: function(fragmentIndex, fragment) {
    var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);

    return this._manifest.baseUrl + urlPart;
  }

};

_mix(Dashling.Stream.prototype, EventingMixin);
_mix(Dashling.Stream.prototype, ThrottleMixin);
Dashling.RequestManager = function(shouldRecordStats, settings) {
  _mix(this, {
    _settings: settings,
    _activeRequests: {},
    _waitTimes: [],
    _receiveTimes: [],
    _bandwidths: [],
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
  },

  getActiveRequestCount: function() {
    return this._activeRequestCount;
  },

  abortAll: function() {
    for (var requestIndex in this._activeRequests) {
      var xhr = this._activeRequests[requestIndex];

      _log("Aborting request: " + xhr.url)
      xhr.isAborted = true;
      xhr.abort();

    }

    this._activeRequests = {};
  },

  load: function(request, isArrayBuffer, onSuccess, onFailure) {
    var _this = this;
    var maxRetries = this._maxRetries;
    var retryIndex = -1;
    var delaysBetweenRetries = this._delaysBetweenRetries;

    request.retryCount = 0;
    _startRequest();

    function _startRequest() {
      var xhr = new _this._xhrType();
      var requestIndex = ++_this._totalRequests;

      _this._activeRequests[requestIndex] = xhr;
      _this._activeRequestCount++;

      xhr.timeout = _this._settings.requestTimeout;
      xhr.url = request.url;
      xhr.open("GET", request.url, true);
      isArrayBuffer && (xhr.responseType = "arraybuffer");

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

        _this._postProgress(request.progressEvents);
      };

      xhr.onloadend = function() {
        delete _this._activeRequests[requestIndex];
        _this._activeRequestCount--;

        request.timeAtLastByte = new Date().getTime() - request.startTime;

        if (xhr.status >= 200 && xhr.status <= 299) {
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

          }

          _this._waitTimes.push(request.timeAtEstimatedFirstByte);
          _this._receiveTimes.push(request.timeAtLastByte - request.timeAtEstimatedFirstByte);

          request.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
          request.statusCode = xhr.status;
          request.state = DashlingFragmentState.downloaded;

          onSuccess && onSuccess(request);
        } else {
          _onError(request);
        }
      };

      function _onError() {

        if (xhr.status == 0 && request.timeAtLastByte >= _this._settings.requestTimeout) {
          xhr.isTimedOut = true;
        }

        if (!xhr.isAborted && ++retryIndex < maxRetries) {

          request.retryCount++;
          setTimeout(_startRequest, delaysBetweenRetries[Math.min(delaysBetweenRetries.length - 1, retryIndex)]);
        } else {
          request.state = DashlingFragmentState.error;
          request.hasError = true;
          request.statusCode = xhr.isAborted ? "aborted" : xhr.isTimedOut ? "timeout" : xhr.status;
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

  _postProgress: function(progressEvents) {
    if (progressEvents.length > 1) {
      var lastEvent = progressEvents[progressEvents.length - 1];
      var firstEvent = progressEvents[0];
      var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;

      if (bytesLoaded > 10000) {
        var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;

        if (timeDifference > 1) {
          var bytesPerMillisecond = bytesLoaded / timeDifference;

          this._bandwidths.push(bytesPerMillisecond);

          while (this._bandwidths.length > 10) {
            this._bandwidths.shift();
          }
        }
      }

    }
  },

  getAverageWait: function() {
    return _average(this._waitTimes, this._waitTimes.length - 5);
  },

  getAverageReceive: function() {
    return _average(this._receiveTimes, this._receiveTimes.length - 5);
  },

  getAverageBandwidth: function() {
    var average = _average(this._bandwidths, this._bandwidths.length - 5);

    return average;
  }
};
})();