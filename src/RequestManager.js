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
    this.removeAllEventListeners();
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

        _this.raiseEvent(Dashling.Event.download, request);
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
          request.isAborted = xhr.isAborted;
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

_mix(Dashling.RequestManager.prototype, EventingMixin);