var _instance = 0;

var RequestStates = {
  pending: "pending",
  downloading: "downloading",
  downloaded: "downloaded",
  appended: "appended",
  error: "error"
};

window.DashMonitor = function() {
  var _this = this;

  this.id = "DashMonitorView-" + _instance++;
  this._rowElements = {};
  this.dataContext = {};
  //this.dataContext = _createTestData();

  this._updateSeekBar = _bind(this, this._updateSeekBar);
  this._onSessionChanged = _bind(this, this._onSessionChanged);
};

window.DashMonitor.prototype = {
  id: "",
  isActive: false,
  isVisible: true,
  dataContext: null,
  element: null,
  qualityContainer: null,

  _metricCount: 0,
  _video: null,

  attachTo: function(element) {
    var div = ce("div");

    div.innerHTML = this.renderHtml();

    if (this.element) {
      element.replaceChild(div.firstChild, this.element);
    } else {
      element.appendChild(div.firstChild);
    }

    this.activate();
  },

  dispose: function() {
    var _this = this;

    if (_this._interval) {
      clearInterval(_this._interval);
      _this._interval = null;
    }

    if (_this._videoElement) {
      _this._videoElement.removeEventListener("timeupdate", _this._updateSeekBar);
      _this._videoElement.removeEventListener("seeking", _this._updateSeekBar);
      _this._videoElement = null;
    }

    if (_this._dashling) {
      _this._dashling.removeEventListener(_this._dashling.Event.sessionStateChange, _this._onSessionChanged);
      _this._dashling = null;
    }
  },

  observe: function(dashling, videoElement) {
    var _this = this;

    // Clear any existing observing stuff.
    _this.dispose();

    if (videoElement) {
      _this._videoElement = videoElement;
      videoElement.addEventListener("timeupdate", _this._updateSeekBar);
      videoElement.addEventListener("seeking", _this._updateSeekBar);
    }

    if (dashling) {
      _this._dashling = dashling;
      dashling.addEventListener(dashling.Event.sessionStateChange, _this._onSessionChanged);
      _this._onSessionChanged();
    }
  },

  _onSessionChanged: function() {
    var _this = this;
    var dashling = _this._dashling;
    var state = dashling.state;

    if (state == dashling.SessionState.error || state == dashling.SessionState.idle) {
      clearInterval(_this._interval);
      _this._interval = 0;
      _this.setDataContext(_this._getStats(dashling));
    } else if (dashling.state > dashling.SessionState.idle && !_this._interval) {
      _this._interval = setInterval(function() {
        if (_this.isVisible) {
          _this.setDataContext(_this._getStats(dashling));
        }
      }, 100);
    }
  },

  reset: function() {
    if (this.element) {
      this.dataContext = {};
      this.attachTo(this.element.parentNode);
    }
  },

  setVisibility: function(isVisible) {
    if (isVisible != this.isVisible) {
      this.isVisible = isVisible;
      if (this.isActive) {
        this._update(this.dataContext);
      }
    }
  },

  setDataContext: function(dataContext) {
    this.dataContext = dataContext;

    this._update(this.dataContext);
  },

  renderHtml: function() {
    var html = '<div id="' + this.id + '" class="c-DashMonitor">' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="audio streamData">' +
      '<span class="streamTitle">Audio</span>' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="traffic">' +
      '<div class="qualities"></div>' +
      '<div class="seekContainer"><div class="seekBar"></div></div>' +
      '</div>' +
      '</div>' +
      '<div class="video streamData">' +
      '<span class="streamTitle">Video</span>' +
      '<ul class="streamMetrics"></ul>' +
      '<div class="traffic">' +
      '<div class="qualities"></div>' +
      '<div class="seekContainer"><div class="seekBar"></div></div>' +
      '</div>' +
      '</div>' +
      "<div class=\"key\">" +
      "<div class=\"keyItem\"><div class=\"keyBox waiting\"></div><span>Waiting for response</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox downloading\"></div><span>Receiving bytes</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox downloaded\"></div><span>Downloaded</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox appending\"></div><span>Appending</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox appended\"></div><span>Appended</span></div>" +
      "<div class=\"keyItem\"><div class=\"keyBox error\"></div><span>Error</span></div>" +
      "</div>";

    return html;
  },

  activate: function() {
    var element = this.element = _qs("#" + this.id);

    this.subElements = {
      metrics: _qs(".streamMetrics", element),
      audio: {
        element: _qs(".audio"),
        metrics: _qs(".audio .streamMetrics", element),
        qualities: _qs(".audio .qualities", element),
        seekBar: _qs(".audio .seekBar", element)
      },
      video: {
        element: _qs(".video"),
        metrics: _qs(".video .streamMetrics", element),
        qualities: _qs(".video .qualities", element),
        seekBar: _qs(".video .seekBar", element)
      },
      key: _qs(".key")
    };

    this.isActive = true;

    this._update(this.dataContext);
  },

  deactivate: function() {
    this.subElements = null;
    this.isActive = false;
  },

  _updateSeekBar: function() {
    var _this = this;
    var video = _this._videoElement;

    if (video) {
      var percentage = (100 * video.currentTime / video.duration) + "%";

      _this.subElements.audio.seekBar.style.left = percentage;
      _this.subElements.video.seekBar.style.left = percentage;
    }
  },

  _update: function(dataContext) {
    var isStarted = dataContext.state !== undefined && dataContext.state != this._dashling.SessionState.idle;

    if (this.isActive) {
      var subElements = this.subElements;

      _toggleClass(this.element, "isVisible", isStarted && this.isVisible);

      this._updateMetrics(subElements.metrics, dataContext.metrics);

      var audio = (dataContext && dataContext.streams && dataContext.streams.audio) || {};
      var video = (dataContext && dataContext.streams && dataContext.streams.video) || {};

      _toggleClass(subElements.audio.element, "isVisible", !! (audio.metrics || audio.qualities));
      _toggleClass(subElements.video.element, "isVisible", !! (video.metrics || video.qualities));
      _toggleClass(subElements.key, "isVisible", !! (audio.qualities || video.qualities));

      this._updateMetrics(subElements.audio.metrics, audio.metrics);
      this._updateQualities(subElements.audio.qualities, audio.qualities);

      this._updateMetrics(subElements.video.metrics, video.metrics);
      this._updateQualities(subElements.video.qualities, video.qualities);
    }
  },

  _updateMetrics: function(metricListElement, metrics) {
    _toggleClass(metricListElement, "isVisible", !! metrics);

    if (metrics) {
      var metricLookup = metricListElement._metricLookup = metricListElement._metricLookup || {};

      for (var i = 0; i < metrics.length; i++) {
        var metric = metrics[i];
        var metricElement = metricLookup[metric.title];

        if (!metricElement) {
          metricElement = ce("li");
          metricElement.innerHTML = '<span class="metricTitle">' + metric.title + '</span><span class="metricValue"></span>';

          _qs(".metricTitle", metricElement).textContent = metric.title;
          metricListElement.appendChild(metricElement);
          metricElement = metricLookup[metric.title] = _qs(".metricValue", metricElement);
        }

        metricElement.parentNode.className = (metric.value !== undefined && metric.value !== null && metric.value !== "") ? "hasValue" : "";
        metricElement.textContent = metric.value;
      }
    } else {}
  },

  _updateQualities: function(qualityListElement, qualities) {
    _toggleClass(qualityListElement, "isVisible", !! qualities);

    if (qualities) {
      var qualityRowLookup = qualityListElement._qualityRowLookup = qualityListElement._qualityRowLookup || {};

      for (var qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
        var quality = qualities[qualityIndex];

        if (quality) {
          var qualityRow = qualityRowLookup[qualityIndex];

          if (!qualityRow) {
            qualityRow = qualityRowLookup[qualityIndex] = ce("div", "row");
            ce("div", "rowHeader", quality.title, qualityRow);
            ce("div", "rowFragments", null, qualityRow);

            qualityRow.qualityIndex = quality.index;

            for (var i = 0; i < qualityListElement.childNodes.length; i++) {
              if (quality.index > qualityListElement.childNodes[i].qualityIndex) {
                qualityListElement.insertBefore(qualityRow, qualityListElement.childNodes[i]);
                break;
              }
            }

            if (!qualityRow.parentNode) {
              qualityListElement.appendChild(qualityRow);
            }
          }

          this._updateFragments(_qs(".rowFragments", qualityRow), quality.fragments);

        }
      }
    }
  },

  _updateFragments: function(fragmentListElement, fragments) {
    _toggleClass(fragmentListElement, "isVisible", !! fragments);

    if (fragments) {
      var fragmentListLookup = fragmentListElement._fragmentListLookup = fragmentListElement._fragmentListLookup || {};
      var newFragmentListLookup = {};
      var videoDuration = this.dataContext.duration;

      for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex++) {
        var fragment = fragments[fragmentIndex];
        var fragmentElement = fragmentListLookup[fragment.index];

        if (!fragmentElement) {
          fragmentElement = ce("div", "rowRequest", null, fragmentListElement);
          fragmentElement.style.left = (100 * fragment.start / videoDuration) + "%";
          fragmentElement.style.width = (100 * fragment.length / videoDuration) + "%";
        } else {
          delete fragmentListLookup[fragment.index];
        }

        newFragmentListLookup[fragment.index] = fragmentElement;

        fragmentElement.className = "rowRequest " + fragment.state;
      }

      fragmentListElement._fragmentListLookup = newFragmentListLookup;

      for (var i in fragmentListLookup) {
        fragmentListElement.removeChild(fragmentListLookup[i]);
      }
    }
  },

  _getStats: function(player) {
    var context = {};
    var controller = player._streamController;
    var manifest = player.settings.manifest;

    context.state = player.state;
    context.metrics = [];

    context.metrics.push({
      title: "State",
      value: _findInEnum(player.state, this._dashling.SessionState)
    });

    context.metrics.push({
      title: "Last error",
      value: player.lastError
    });

    context.metrics.push({
      title: "Load",
      value: (player.timeAtFirstCanPlay ? player.timeAtFirstCanPlay : (new Date().getTime() - player.startTime)) + " ms"
    });

    if (manifest && controller) {
      var fragmentList = [];

      for (var streamIndex = 0; streamIndex < controller._streams.length; streamIndex++) {
        fragmentList.push(controller._streams[streamIndex].fragments);
      }

      var qualityDictionary = {};

      context.duration = manifest.mediaDuration;

      context.metrics.push({
        title: "Manifest",
        value: player.settings.manifest && player.settings.manifest.request && player.settings.manifest.request.timeAtLastByte ? player.settings.manifest.request.timeAtLastByte + " ms" : ""
      });

      context.metrics.push({
        title: "Stalls",
        value: controller._stalls || null
      });

      context.metrics.push({
        title: "Recovery time",
        value: ""
      });

      context.metrics.push({
        title: "Stall chance",
        value: ""
      });

      context.metrics.push({
        title: "Buffer rate",
        value: _round(player.getBufferRate(), 2, 2) + " s/s"
      });

      context.metrics.push({
        title: "Buffer left",
        value: _round(player.getRemainingBuffer(), 2, 2) + " s"
      });

      var timeUntilStall = controller ? controller.getTimeUntilUnderrun() : 0;

      context.metrics.push({
        title: "Time until stall",
        value: timeUntilStall < Number.MAX_VALUE ? _round(timeUntilStall, 2, 2) + " s" : ""
      });

      context.streams = {};

      for (var streamIndex = 0; streamIndex < controller._streams.length; streamIndex++) {
        var stream = controller._streams[streamIndex];
        var contextStream = {
          metrics: [],
          qualities: []
        };
        context.streams[stream.streamType] = contextStream;
        var val;

        contextStream.metrics.push({
          title: "Quality",
          value: stream.qualityIndex
        });

        val = stream._requestManager.getAverageWait();
        contextStream.metrics.push({
          title: "Avg wait",
          value: val ? Math.round(val, 2) + " ms" : null
        });

        val = stream._requestManager.getAverageReceive();
        contextStream.metrics.push({
          title: "Avg receive",
          value: val ? Math.round(val, 2) + " ms" : null
        });

        val = stream._requestManager.getAverageBytesPerSecond();
        contextStream.metrics.push({
          title: "Avg bandwidth",
          value: val ? _formatBandwidth(val) : null
        });

        for (var fragmentIndex = 0; fragmentIndex < stream.fragments.length; fragmentIndex++) {
          var fragment = stream.fragments[fragmentIndex];

          if (fragment.activeRequest) {
            var contextQuality = contextStream.qualities[fragment.qualityIndex];

            if (!contextQuality) {
              contextQuality = contextStream.qualities[fragment.qualityIndex] = {
                title: fragment.qualityId,
                index: fragment.qualityIndex,
                fragments: []
              };
            }

            var state = _findInEnum(fragment.state, this._dashling.RequestState);

            if (fragment.state == this._dashling.RequestState.downloading && fragment.activeRequest.timeAtFirstByte == -1) {
              state = "waiting";
            }

            contextQuality.fragments.push({
              index: fragmentIndex,
              state: state,
              start: fragment.time.startSeconds,
              length: fragment.time.lengthSeconds
            });


          }
        }
      }
    }

    return context;
  }
};

/* // Test data
function _createTestData() {
  return {
    duration: 52.33333,

    metrics: {
      "Buffer rate": "12",
    },

    streams: {
      audio: {
        metrics: [{
          title: "test1",
          value: "val1"
        }, {
          title: "test2",
          value: "val2"
        }],
        qualities: [{
          index: 1,
          title: "medium",
          fragments: [{
            start: 0,
            length: 5,
            state: "downloading"
          }, {
            start: 5,
            length: 5,
            state: "waiting"
          }]
        }, {
          index: 0,
          title: "low",
          fragments: [{}, {}]
        }]
      },

      video: {
        metrics: [{
          title: "test1",
          value: "val1"
        }, {
          title: "test2",
          value: "val2"
        }],
        qualities: [{
          title: "video med",
          fragments: [{}, {}]
        }, {
          title: "video low",
          fragments: [{}, {}]
        }]
      }
    }
  };
}
*/

// Utility functions.

function _qs(selector, parentElement) {
  parentElement = parentElement || document;

  return parentElement.querySelector(selector);
}

function ce(tag, className, text, parentEl) {
  var el = document.createElement(tag);

  className && (el.className = className);
  text && (el.textContent = text);
  parentEl && parentEl.appendChild(el);

  return el;
}

function _findInEnum(val, en) {
  for (var i in en) {
    if (en[i] == val) {
      return i;
    }
  }
  return "";
}

function _round(number, decimals, padded) {
  var value = parseFloat(number.toFixed(decimals));

  if (padded) {
    value = "" + value;
    if (value.indexOf(".") == -1) {
      value += ".";
    }

    while (value.indexOf(".") != (value.length - 3)) {
      value += "0";
    }
  }

  return value;
}

function _formatBandwidth(bytesPerSecond) {
  var bitsPerKilobit = 1000;
  var bitsPerMegabit = bitsPerKilobit * bitsPerKilobit;
  var bitsPerSecond = bytesPerSecond * 8;

  if (bitsPerSecond < bitsPerKilobit) {
    return bitsPerSecond + " bps";
  } else if (bitsPerSecond < bitsPerMegabit) {
    return _round(bitsPerSecond / bitsPerKilobit, 2, 2) + " kbps";
  } else {
    return _round(bitsPerSecond / bitsPerMegabit, 2, 2) + " mbps";
  }
}

function _toggleClass(element, className, isEnabled) {
  var classes = element.className.trim().split(" ");
  var classesTable = {};
  var i;
  var fullName = "";

  for (i = 0; i < classes.length; i++) {
    if (classes[i]) {
      classesTable[classes[i]] = true;
    }
  }

  isEnabled = isEnabled === undefined ? (!classesTable[className]) : isEnabled;

  if (isEnabled) {
    classesTable[className] = true;
  } else {
    delete classesTable[className];
  }

  for (i in classesTable) {
    fullName += i + " ";
  }

  element.className = fullName.trim();
}

function _bind(obj, func) {
  return function() {
    return func.apply(obj, arguments);
  }
}