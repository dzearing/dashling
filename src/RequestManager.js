Dashling.RequestManager = function(shouldRecordStats, settings) {
  _mix(this, {
    _settings: settings,
    _activeRequests: {},
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
    for (var requestIndex in this._activeRequests) {
      var xhr = this._activeRequests[requestIndex];

      _log("Aborting request: " + xhr.url, this._settings)
      xhr.isAborted = true;
      xhr.abort();
    }

    this._activeRequests = {};
  },

  load: function(request) {
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

      xhr.url = request.url;
      xhr.open("GET", request.url, true);
      request.isArrayBuffer && (xhr.responseType = "arraybuffer");

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

          request.onSuccess && request.onSuccess(request);
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

        if (xhr.status == 0 && request.timeAtLastByte >= _this._settings.requestTimeout) {
          xhr.isTimedOut = true;
        }

        if (_this._isRetriable(xhr) && ++retryIndex < maxRetries) {

          request.retryCount++;
          setTimeout(_startRequest, delaysBetweenRetries[Math.min(delaysBetweenRetries.length - 1, retryIndex)]);
        } else {
          request.state = DashlingFragmentState.error;
          request.hasError = true;
          request.isAborted = xhr.isAborted;
          request.statusCode = xhr.isAborted ? "aborted" : xhr.isTimedOut ? "timeout" : xhr.status;
          request.onError && request.onError(request);
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