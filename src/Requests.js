Dashling.Requests = function = {
    this._activeRequests = {};
    this._latencies = [];
    this._bandwidths = [];
};

Dashling.Requests.prototype = {
    _requestIndex: 0,

    dispose: function() {
        for (var requestIndex in this._activeRequests) {
            this._activeRequests[requestIndex].abort();
        }
        this._activeRequests = {}
    },

    load: function(request, isArrayBuffer, onSuccess, onFailure) {
        var _this = this;
        var maxRetries = 5;
        var retryIndex = -1;
        var delayBetweenRetries = [ 200, 1500, 3000 ];

        request.retryCount = 0;
        _startRequest();

        function _startRequest() {
            var xhr = new XMLHttpRequest();
            var requestIndex = ++_this._requestIndex;

            _this._activeRequests[requestIndex] = xhr;

            xhr.open("GET", request.url, true);
            isArrayBuffer && (xhr.responseType = "arraybuffer");

            xhr.onreadystatechange = function() {
                if (xhr.readyState > 0 && request.timeAtFirstByte < 0) {
                    request.timeAtFirstByte = new Date().getTime()
                }
            };

            xhr.onprogress = function() {
                (request.timeAtFirstByte < 0) && (request.timeAtFirstByte = new Date().getTime());
            };

            xhr.onloadend = function() {
                delete this._activeRequests[requestIndex];

                if (xhr.status >= 200 && xhr.status <= 299) {
                    request.timeAtLastByte = new Date().getTime();
                    request.bytesDownloaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText.length;

                    if (request.timeAtFirstByte < 0) {
                        // There was only one response returned.
                        request.timeAtFirstByte = new Date().getTime();
                    }

                    request.latency = request.timeAtFirstByte - request.timeAtDownloadStarted;
                    request.bandwidth = (1000 * request.bytesDownloaded)  / (request.timeAtLastByte - request.timeAtDownloadStarted);


                    if (request.bytesDownloaded > 50000) {
                        _this._latencies.push(request.latency);
                        _this._bandwidths.push(request.bandwidth);
                    }

                    request.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
                    request.state = Dashling.FragmentState.downloaded;
                    onSuccess();
                }
                else {
                    _onError();
                }
            };

            function _onError() {
                if (++retryIndex < maxRetries) {
                    request.timeAtFirstByte = -1;
                    request.timeAtLastByte = -1;
                    request.timeAtDownloadStarted = -1;
                    request.retryCount++;
                    setTimeout(_startRequest, delayBetweenRetries[Math.min(delayBetweenRetries.length - 1, retryIndex)]);
                }
                else {
                    request.state = DashlingFragmentState.error;
                    request.errorCode = xhr.status;
                    onFailure(request);
                }
            };

            request.state = DashlingFragmentState.downloading;
            request.timeAtDownloadStarted = new Date().getTime();
            xhr.send();
        }
    }

    getAverageLatency: function() {
        return _average(this._latencies) / 1000;
    },

    getAverageBytesPerSecond: function() {
        return _average(this._bandwidths);
    }
};
