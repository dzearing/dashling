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

    if (response.status === 0) {
      // Don't call the callback.
    } else if (response.latency) {
      setTimeout(_complete, response.latency);
    } else {
      _complete();
    }

    function _complete() {
      _this.status = response.status;
      _this.response = response.response;
      _this.responseText = response.responseText;

      if (_this.status >= 200 && _this.status <= 299) {
        var responseLength = response ? response.length : -1;

        _this.onprogress && _this.onprogress({
          lengthComputable: (responseLength > -1),
          loaded: responseLength
        });

        _this.onload && _this.onload();
      } else {
        _this.onerror && _this.onerror();
      }

      _this.onloadend && _this.onloadend();
    }
  },

  abort: function() {
    this.onloadend && this.onloadend();
  }
};

MockXHR.mockTextResponse = function(options) {
  options = options || {};

  var mockInstance = function() {
    this._mockResponse = {
      response: options.response,
      responseText: options.responseText || options.response,
      status: options.status || 0,
      latency: options.latency || 0,
      bandwidth: options.bandwidth || 0
    };
  };

  mockInstance.prototype = MockXHR.prototype;

  return mockInstance;
};