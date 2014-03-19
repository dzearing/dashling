var _instance = 0;

// Utility functions.
function byId(id) { return document.getElementById(id); }
function ce(tag, className, text, parentEl) {
    var el = document.createElement(tag);

    el.className = className;
    el.textContent = text || "";
    parentEl && parentEl.appendChild(el);

    return el;
}

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

    this._updateSeekBar = function() { DashMonitor.prototype._updateSeekBar.call(_this); };
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

        this._update();
    },

    renderHtml: function() {
        var html = "<div id=\"" + this.id + "\" class=\"c-DashMonitor\">" +
            "<div class=\"segmentData\">" +
                "<div id=\"" + this.id + "_1" + "\"></div>" +
                "<div class=\"seekContainer\"><div id=\"" + this.id + "_2" + "\" class=\"seekBar\"></div></div>" +
            "</div>" +
            "<div class=\"key\">" +
                "<div class=\"keyItem\"><div class=\"keyBox pending\"></div><span>Waiting for response</span></div>" +
                "<div class=\"keyItem\"><div class=\"keyBox downloading\"></div><span>Receiving bytes</span></div>" +
                "<div class=\"keyItem\"><div class=\"keyBox downloaded\"></div><span>Downloaded</span></div>" +
                "<div class=\"keyItem\"><div class=\"keyBox appending\"></div><span>Appending</span></div>" +
                "<div class=\"keyItem\"><div class=\"keyBox appended\"></div><span>Appended</span></div>" +
                "<div class=\"keyItem\"><div class=\"keyBox error\"></div><span>Error</span></div>" +
            "</div>" +
        "</div>";

        return html;
    },

    activate: function() {
        this.element = byId(this.id);
        this.qualityContainer = byId(this.id + "_1");
        this.seekBar = byId(this.id + "_2");
        this._update();
    },

    deactivate: function() {
    },

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

        _this.seekBar.style.left = (100 * video.currentTime / video.duration) + "%";
    },

    _update: function() {
        if (this.dataContext && this.dataContext.videoDuration && this.dataContext.qualities && this.dataContext.qualities.length) {
            var i;
            var rows = this._rowElements;
            var videoDuration = this.dataContext.videoDuration;
            var qualities = this.dataContext.qualities;
            var metricCount = 0;

            for (i = 0; i < qualities.length; i++) {
                metricCount += qualities[i].requests.length;
            }

            // Handle reset.
            if (metricCount < this._metricCount) {
                this._metricCount = metricCount;
                this.qualityContainer.innerHTML = "";
                delete this.qualityContainer.rowElements;
            }

            this._metricCount = metricCount;

            this.qualityContainer.rowElements = this.qualityContainer.rowElements || {};

            this.element.className = "c-DashMonitor hasData";

            for (i = 0; i < qualities.length; i++) {
                var quality = qualities[i];
                var rowElement = this.qualityContainer.rowElements[quality.name];

                if (!rowElement) {
                    rowElement = this.qualityContainer.rowElements[quality.name] = ce("div", "row", "", this.qualityContainer);
                    ce("div", "rowHeader", quality.name, rowElement);
                    rowElement.rowRequestsElement = ce("div", "rowRequests", null, rowElement);
                    rowElement.rowRequests = {};
                }

                var rowRequestsElement = rowElement.rowRequestsElement;

                for (var j = 0; j < quality.requests.length; j++) {
                    var request = quality.requests[j];

                    if (request.segmentPosition != NaN) {
                        var requestElement = rowElement.rowRequests[request.segmentPosition];

                        if (!requestElement) {
                            requestElement = rowElement.rowRequests[request.segmentPosition] = ce("div", "rowRequest " + request.state, null, rowRequestsElement);
                            requestElement.style.left = (100 * request.segmentPosition / videoDuration) + "%";
                            requestElement.style.width = (100 * request.segmentDuration / videoDuration) + "%";
                        }

                        requestElement.className = "rowRequest " + request.state;
                    }
                }
            }
        }
        else {
            this.element.className = "c-DashMonitor";
        }
    }
};
