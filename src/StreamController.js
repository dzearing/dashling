/// <summary></summary>

Dashling.StreamController = function(videoElement, mediaSource, settings) {
  var _this = this;

  // Provide instanced callbacks that can be removed later.
  _this._onVideoSeeking = _bind(_this, _this._onVideoSeeking);
  _this._onVideoError = _bind(_this, _this._onVideoError);
  _this._onPauseStateChange = _bind(_this, _this._onPauseStateChange);

  _this._appendNextFragment = _bind(_this, _this._appendNextFragment);
  _this._onThrottledSeek = _bind(_this, _this._onThrottledSeek);

  _this._videoElement = videoElement;
  _this._videoElement.addEventListener("seeking", _this._onVideoSeeking);
  _this._videoElement.addEventListener("error", _this._onVideoError);
  _this._videoElement.addEventListener("play", _this._onPauseStateChange);
  _this._videoElement.addEventListener("pause", _this._onPauseStateChange);

  _this._mediaSource = mediaSource;
  _this._settings = settings;

  _this._bufferRate = [];
  _this._appendedSeconds = 0;

  _this._streams = [
    _this._audioStream = new Dashling.Stream("audio", mediaSource, videoElement, settings),
    _this._videoStream = new Dashling.Stream("video", mediaSource, videoElement, settings)
  ];

  _this._audioStream.addEventListener(DashlingEvent.download, _forwardDownloadEvent);
  _this._audioStream.addEventListener(DashlingEvent.sessionStateChange, _forwardSessionStateChange);

  _this._videoStream.addEventListener(DashlingEvent.download, _forwardDownloadEvent);
  _this._videoStream.addEventListener(DashlingEvent.sessionStateChange, _forwardSessionStateChange);

  _this._requestTimerIds = [0, 0];

  var firstFragmentDuration = _this._audioStream.fragments[0].time.lengthSeconds;

  // If a start time has been provided, start at the right location.
  if (settings.startTime && firstFragmentDuration) {
    this._appendIndex = Math.max(0, Math.min(_this._audioStream.fragments.length - 1, (Math.floor((settings.startTime - 0.5) / firstFragmentDuration))));
  }

  function _forwardDownloadEvent(ev) {
    _this.raiseEvent(DashlingEvent.download, ev);
  }

  function _forwardSessionStateChange(state, errorType, errorMessage) {
    _this.raiseEvent(DashlingEvent.sessionStateChange, state, errorType, errorMessage);
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
    var qualityIndex = 0;

    if (!this.isDisposed) {
      var currentTime = this._videoElement.currentTime;
      var stream = streamType == "video" ? this._videoStream : streamType._audioStream;
      var fragmentIndex = Math.min(stream.fragments.length - 1, Math.floor(currentTime / stream.fragments[0].time.lengthSeconds));

      qualityIndex = stream.fragments[fragmentIndex].qualityIndex;
      qualityIndex = qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
    }

    return qualityIndex;
  },

  getBufferingQuality: function(streamType) {
    var stream = streamType == "video" ? this._videoStream : this._audioStream;

    return stream.qualityIndex;
  },

  getBufferRate: function() {
    return this._bufferRate.average || 0;
  },

  getRemainingBuffer: function(offsetFromCurrentTime) {
    var _this = this;
    var remainingBuffer = 0;

    if (!_this.isDisposed) {
      var currentTime = (_this._settings.startTime || Math.max(0.5, _this._videoElement.currentTime)) + (offsetFromCurrentTime || 0);
      var bufferRanges = _this._videoElement.buffered;

      for (var i = 0; i < bufferRanges.length; i++) {
        if (currentTime >= bufferRanges.start(i) && currentTime <= bufferRanges.end(i)) {
          remainingBuffer = bufferRanges.end(i) - currentTime;
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

    this._lastCurrentTime = _this._videoElement.currentTime;

    if (_this._canPlay && timeUntilUnderrun < 0.1) {
      // We are stalling!
      _this._stalls++;
      _this._setCanPlay(false);
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
  },

  _allStreamsAppended: function(streams, fragmentIndex) {
    var allStreamsAppended = false;

    for (var streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      allStreamsAppended &= streams[streamIndex].fragments[fragmentIndex] == DashlingFragmentState.appended;
    }

    return allStreamsAppended;
  },

  _getDownloadCandidates: function() {
    var _this = this;
    var downloadList = [
      [],
      []
    ];
    var streams = _this._streams;
    var stream;
    var settings = _this._settings;
    var streamIndex;
    var fragmentLength = _this._audioStream.fragments[0].time.lengthSeconds;
    var currentTime = _this._settings.startTime || _this._videoElement.currentTime;
    var currentSegment = Math.floor(currentTime / fragmentLength);
    var maxIndex = currentSegment + Math.ceil(settings.maxBufferSeconds / fragmentLength);
    var maxAudioIndex = -1;
    var maxVideoIndex = -1;
    var fragmentCount = _this._videoStream.fragments.length;
    var fragmentIndex;

    // Quality assessment.
    for (streamIndex = 0; streamIndex < streams.length; streamIndex++) {
      streams[streamIndex].assessQuality();
    }

    for (fragmentIndex = _this._appendIndex; fragmentIndex <= maxIndex && fragmentIndex < fragmentCount; fragmentIndex++) {
      var allStreamsAppended = _this._allStreamsAppended(streams, fragmentIndex);

      // Missing fragment check.
      for (streamIndex = 0; allStreamsAppended && streamIndex < streams.length; streamIndex++) {
        stream = streams[streamIndex];

        if (stream.isMissing(fragmentIndex, currentTime)) {
          var fragment = stream.fragments[fragmentIndex];

          _log("Missing fragment reset: stream=" + stream._streamType + " index=" + fragmentIndex + " [" + fragment.time.startSeconds + "] ranges: " + _getBuffered(_this._videoElement), _this._settings);
          stream.fragments[fragmentIndex].state = DashlingFragmentState.idle;
        }
      }

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

  _setCanPlay: function(isAllowed) {
    if (this._canPlay !== isAllowed) {
      this._canPlay = isAllowed;
      this._videoElement.playbackRate = isAllowed ? 1 : 0;
      this._onPauseStateChange();
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
    var currentTime = _this._videoElement.currentTime;
    var lastTimeBeforeSeek = this._lastTimeBeforeSeek;
    var fragmentIndex = Math.floor(Math.max(0, currentTime - 0.5) / _this._streams[0].fragments[0].time.lengthSeconds);
    var streamIndex;
    var isBufferAcceptable =
      _this._videoElement.buffered.length == 1 &&
      _this._videoElement.buffered.start(0) <= 0.5 &&
      _this._videoElement.buffered.end(0) > currentTime &&
      _this._videoElement.buffered.end(0) < _this._settings.maxBufferSeconds;

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
    } else if (currentTime < lastTimeBeforeSeek && !isBufferAcceptable) {
      _log("Clearing buffer due to reverse seek", _this._settings);

      // Going backwards from last position, clear all buffer content to avoid chrome from removing our new buffer.
      for (streamIndex = 0; streamIndex < _this._streams.length; streamIndex++) {
        _this._streams[streamIndex].clearBuffer();
      }
    }

    _this._appendIndex = fragmentIndex;
    _this._appendNextFragment();
  },

  _onVideoError: function() {
    var videoErrors = this._videoElement.error;
    var error = videoErrors.code;

    for (var i in videoErrors) {
      if (videoErrors[i] == error && i != "code") {
        error = i;
        break;
      }
    }

    this.raiseEvent(Dashling.Event.sessionStateChange, DashlingSessionState.error, error);
  },

  _onPauseStateChange: function() {
    this.raiseEvent(Dashling.Event.sessionStateChange, this._canPlay ? (this._videoElement.paused ? DashlingSessionState.paused : DashlingSessionState.playing) : DashlingSessionState.buffering);

    this._adjustPlaybackMonitor(!this._videoElement.paused);
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