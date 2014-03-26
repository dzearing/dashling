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

  for (var i = 0; i < _this._streams.length; i++) {
    _this._streams[i].addEventListener(Dashling.Event.download, function(ev) {
      _this.raiseEvent(Dashling.Event.download, ev);
    });
  }

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

    _this.removeAllEventListeners();
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
    var currentSegment = Math.floor(currentTime / fragmentLength);
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

_mix(Dashling.StreamController.prototype, EventingMixin);
_mix(Dashling.StreamController.prototype, ThrottleMixin);