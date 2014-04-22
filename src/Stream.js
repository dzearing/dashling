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
    try {
      this._buffer.remove(0, this._videoElement.duration);
    } catch (e) {}

    for (var fragmentIndex = 0; fragmentIndex < this.fragments.length; fragmentIndex++) {
      var fragment = this.fragments[fragmentIndex];

      if (fragment.state == DashlingFragmentState.appended) {
        fragment.state = DashlingFragmentState.idle;
        fragment.activeRequest = null;
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
          setTimeout(_appendNextEntry, 10);
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
            setTimeout(function() {
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
            }, 20);
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

      var safeStartTime = Math.max(currentTime, fragmentTime.startSeconds + (atStart ? 0.5 : 0.07));
      var safeEndTime = fragmentTime.startSeconds + fragmentTime.lengthSeconds - (atEnd ? 0.8 : 0.07);

      try {
        // validate that the buffered area in the video element still contains the fragment.
        for (var bufferedIndex = 0; bufferedIndex < bufferRanges.length; bufferedIndex++) {
          if ((bufferRanges.start(bufferedIndex) <= safeStartTime) && (bufferRanges.end(bufferedIndex) > safeEndTime)) {
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
    var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", fragment.qualityId).replace("$Time$", fragment.time.start);

    return this._manifest.baseUrl + urlPart;
  }

};

_mix(Dashling.Stream.prototype, EventingMixin);
_mix(Dashling.Stream.prototype, ThrottleMixin);
