Dashling.RequestManager = function() {
    this._activeRequests = {};
    this._latencies = [];
    this._bandwidths = [];
};

Dashling.RequestManager.prototype = {
    maxRetries: 3,
    delayBetweenRetries: [ 200, 1500, 3000 ],
    _requestIndex: 0,
    _xhrType: XMLHttpRequest,

    dispose: function() {
        for (var requestIndex in this._activeRequests) {
            this._activeRequests[requestIndex].abort();
        }
        this._activeRequests = {};
    },

    load: function(request, isArrayBuffer, onSuccess, onFailure) {
        var _this = this;
        var maxRetries = this.maxRetries;
        var retryIndex = -1;
        var delayBetweenRetries = this.delayBetweenRetries;

        request.retryCount = 0;
        _startRequest();

        function _startRequest() {
            var xhr = new _this._xhrType();
            var requestIndex = ++_this._requestIndex;

            _this._activeRequests[requestIndex] = xhr;

            xhr.open("GET", request.url, true);
            isArrayBuffer && (xhr.responseType = "arraybuffer");

            xhr.onreadystatechange = function() {
                if (xhr.readyState > 0 && request.timeAtFirstByte < 0) {
                    request.timeAtFirstByte = new Date().getTime() - request.startTime
                }
            };

            xhr.onprogress = function(ev) {
                request.progressEvents.push({
                    timeFromStart: new Date().getTime() - request.startTime,
                    bytesLoaded: ev.lengthComputable ? ev.loaded : -1
                });
            };

            xhr.onloadend = function() {
                delete _this._activeRequests[requestIndex];

                if (xhr.status >= 200 && xhr.status <= 299) {
                    request.timeAtLastByte = new Date().getTime() - request.startTime;
                    request.bytesLoaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText.length;

                    if (request.timeAtFirstByte < 0) {
                        // There was only one response returned.
                        request.timeAtFirstByte = new Date().getTime() - request.startTime;
                    }

                    if (request.progressEvents.length > 1) {
                        var lastEvent = request.progressEvents[request.progressEvents.length - 1];
                        var firstEvent = request.progressEvents[0];
                        var timeDifference = lastEvent.timeFromStart - firstEvent.timeFromStart;
                        var bytesLoaded = lastEvent.bytesLoaded - firstEvent.bytesLoaded;
                        var bytesPerMillisecond = bytesLoaded / timeDifference;

                        request.timeAtEstimatedFirstByte = request.timeAtLastByte - (request.bytesLoaded / bytesPerMillisecond);

                        if (bytesLoaded > 10000 && timeDifference > 5) {
                            _this._bandwidths.push(bytesPerMillisecond);
                        }



                    }

                    request.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
                    request.statusCode = xhr.status;
                    request.state = DashlingFragmentState.downloaded;

                    onSuccess && onSuccess(request);
                }
                else {
                    _onError(request);
                }
            };

            function _onError() {
                if (++retryIndex < maxRetries) {
                    request.timeAtFirstByte = -1;
                    request.timeAtLastByte = -1;

                    request.retryCount++;
                    setTimeout(_startRequest, delayBetweenRetries[Math.min(delayBetweenRetries.length - 1, retryIndex)]);
                }
                else {
                    request.state = DashlingFragmentState.error;
                    request.statusCode = xhr.status;

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

    getAverageLatency: function() {
        return _average(this._latencies) / 1000;
    },

    getAverageBandwidth: function() {
        return _average(this._bandwidths);
    }
};
