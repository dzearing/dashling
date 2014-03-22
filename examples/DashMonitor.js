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

  this._updateSeekBar = function() {
    DashMonitor.prototype._updateSeekBar.call(_this);
  };
};

window.DashMonitor.prototype = {
  id: "",
  dataContext: null,
  element: null,
  qualityContainer: null,

  _metricCount: 0,
  _video: null,

  setDataContext: function(dataContext) {
    this.dataContext = dataContext;

    this._update(this.dataContext);
  },

  renderHtml: function() {
    var html = '<div id="' + this.id + '" class="c-DashMonitor">' +

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
      audio: {
        metrics: _qs(".audio .streamMetrics", element),
        qualities: _qs(".audio .qualities", element),
        seekBar: _qs(".audio .seekBar", element)
      },
      video: {
        metrics: _qs(".video .streamMetrics", element),
        qualities: _qs(".video .qualities", element),
        seekBar: _qs(".video .seekBar", element)
      },
    };

    this._update(this.dataContext);
  },

  deactivate: function() {},

  observeVideoElement: function(video) {
    var _this = this;

    _this._video = video;

    video.addEventListener("timeupdate", _this._updateSeekBar);
    video.addEventListener("seeking", _this._updateSeekBar);

    this._updateSeekBar();
  },

  _updateSeekBar: function() {
    var _this = this;
    var video = _this._video;
    var percentage = (100 * video.currentTime / video.duration) + "%";

    _this.subElements.audio.seekBar.style.left = percentage;
    _this.subElements.video.seekBar.style.left = percentage;
  },

  _update: function(dataContext) {
    var subElements = this.subElements;
    var hasData = !! (dataContext && dataContext.duration);

    this.element.className = "c-DashMonitor" + (hasData ? " hasData" : "");

    if (hasData) {
      this._updateMetrics(subElements.audio.metrics, dataContext.streams.audio.metrics);
      this._updateQualities(subElements.audio.qualities, dataContext.streams.audio.qualities);

      this._updateMetrics(subElements.video.metrics, dataContext.streams.video.metrics);
      this._updateQualities(subElements.video.qualities, dataContext.streams.video.qualities);
    }
  },

  _updateMetrics: function(metricListElement, metrics) {
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

      metricElement.textContent = metric.value;
    }
  },

  _updateQualities: function(qualityListElement, qualities) {
    var qualityRowLookup = qualityListElement._qualityRowLookup = qualityListElement._qualityRowLookup || [];

    for (var qualityIndex = 0; qualityIndex < qualities.length; qualityIndex++) {
      var quality = qualities[qualityIndex];

      if (quality) {
        var qualityRow = qualityRowLookup[qualityIndex];

        if (!qualityRow) {
          qualityRow = qualityRowLookup[qualityIndex] = ce("div", "row");
          ce("div", "rowHeader", quality.title, qualityRow);
          ce("div", "rowFragments", null, qualityRow);

          qualityListElement.appendChild(qualityRow);
        }

        this._updateFragments(_qs(".rowFragments", qualityRow), quality.fragments);

      }
    }
  },

  _updateFragments: function(fragmentListElement, fragments) {
    var fragmentListLookup = fragmentListElement._fragmentListLookup = fragmentListElement._fragmentListLookup || {};
    var videoDuration = this.dataContext.duration;

    for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex++) {
      var fragment = fragments[fragmentIndex];
      var fragmentElement = fragmentListLookup[fragmentIndex];

      if (!fragmentElement) {
        fragmentElement = fragmentListLookup[fragmentIndex] = ce("div", "rowRequest", null, fragmentListElement);
        fragmentElement.style.left = (100 * fragment.start / videoDuration) + "%";
        fragmentElement.style.width = (100 * fragment.length / videoDuration) + "%";
      }

      fragmentElement.className = "rowRequest " + fragment.state;
    }
  }
};

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