/// <summary></summary>

// When we calculate how much buffer is remaining, we permit a small blank gap between segments.
var c_permittedGapSecondsBetweenRanges = 0.06;

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

    this._appendIndex = Math.max(0, Math.min(stream.fragments.length - 1, (Math.floor((settings.startTime - 0.5) / firstFragmentDuration))));
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
    var qualityIndex = 0;

    if (!this.isDisposed) {
      var currentTime = this._videoElement.currentTime;
      var stream = streamType == "video" ? this._videoStream : streamType._audioStream;

      if (stream) {
        var fragmentIndex = Math.min(stream.fragments.length - 1, Math.floor(currentTime / stream.fragments[0].time.lengthSeconds));

        qualityIndex = stream.fragments[fragmentIndex].qualityIndex;
        qualityIndex = qualityIndex >= 0 ? qualityIndex : stream.qualityIndex;
      }
    }

    return qualityIndex;
  },

  getBufferingQuality: function(streamType) {
    var stream = streamType == "video" ? this._videoStream : this._audioStream;

    return stream ? stream.qualityIndex : 0;
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

    if (_this._canPlay && timeUntilUnderrun < 0.1) {

      // We may be stalling! Check in 200ms if we haven't moved. If we have, then go into a buffering state.
      setTimeout(function() {
        if (!_this.isDisposed && _this._videoElement.currentTime == _this._lastCurrentTime) {
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
      var currentTime = videoElement.currentTime;
      var isAtEnd = (currentTime + 0.005) >= duration;
      var firstStream = _this._streams[0];
      var fragmentCount = firstStream.fragments.length;
      var fragmentLength = firstStream.fragments[0].time.lengthSeconds;

      if (!isAtEnd) {
        range.start = Math.max(0, Math.min(fragmentCount - 1, Math.floor((currentTime - 0.005) / fragmentLength)));
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
    }
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
    this._adjustPlaybackMonitor(!this._videoElement.paused);
    this._checkCanPlay();
  },

  _onVideoEnded: function() {
    this.raiseEvent(DashlingEvent.sessionStateChange, DashlingSessionState.paused);
  },

  _onVideoRateChange: function() {
    var expectedRate = (this._canPlay ? 1 : 0);

    if (this._videoElement.playbackRate != expectedRate) {
      this._videoElement.playbackRate = expectedRate;
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