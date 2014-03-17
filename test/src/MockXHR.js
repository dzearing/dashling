window.MockXHR = function() {};

MockXHR.prototype = {
    _mockResponse: null,
    openResult: null,
    status: 0,
    readyState: 0,
    response: null,
    responseText: null,
    onerror: null,
    onreadystatechange: null,
    onprogress: null,
    onload: null,
    onloadend: null,

    open: function(method, url, isAsync) {
        this.openResult = {
            method: method,
            url: url,
            isAsync: isAsync
        };
    },

    send: function() {
        var _this = this;
        var response = _this._mockResponse;

        if (_this._mockResponse.latency) {
            setTimeout(_complete, _this._mockResponse.latency);
        }
        else {
            _complete();
        }

        function _complete() {
            _this.status = response.status;
            _this.response = response.response;
            _this.responseText = response.responseText;

            if (_this.status >= 200 && _this.status <= 299) {
                _this.onload && _this.onload();
            }
            else {
                _this.onerror && _this.onerror();
            }

            _this.onloadend && _this.onloadend();
        }
    }
};

MockXHR.mockTextResponse = function(response, status, latency, bandwidth) {
    var mockInstance = function() {
        this._mockResponse = {
            response: response,
            responseText: response,
            status: status || 200,
            latency: latency || 0,
            bandwidth: bandwidth || 0
        };
    };
    mockInstance.prototype = MockXHR.prototype;

    return mockInstance;
};

