Dashling.ManifestParser = function(settings) {
  var _this = this;

  _this._settings = settings;
  _this._requestManager = new Dashling.RequestManager(false, settings);
  _this._requestManager.addEventListener(DashlingEvent.download, function(ev) {
    _this.raiseEvent(DashlingEvent.download, ev);
  });
};

Dashling.ManifestParser.prototype = {
  _parseIndex: 0,

  dispose: function() {
    if (this._requestManager) {
      this._requestManager.dispose();
      this._requestManager = null;
    }
  },

  parse: function(url, onSuccess, onError) {
    var _this = this;
    var parseIndex = ++_this._parseIndex;
    var request = {
      url: url,
      requestType: "manifest",
      onSuccess: _onSuccess,
      onError: _onError
    };

    this._requestManager.load(request);

    function _onSuccess() {
      if (_this._parseIndex == parseIndex) {
        var manifest;

        try {
          manifest = _this._parseManifest(request.data);
        } catch (e) {
          onError(DashlingError.manifestParse, e);
        }

        if (manifest) {
          onSuccess(manifest);
        }
      }
    }

    function _onError() {
      if (_this._parseIndex == parseIndex) {
        onError(DashlingError.manifestDownload, request.statusCode);
      }
    }
  },

  _parseManifest: function(manifestText) {
    var manifest = {};
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(manifestText, "text/xml");
    var i;

    manifest.baseUrl = this._settings.baseUrlOverride || _getXmlNodeValue(xmlDoc, "BaseURL", "");
    manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
    manifest.streams = {};

    var adaptationSets = xmlDoc.querySelectorAll("AdaptationSet");

    for (var adaptIndex = 0; adaptIndex < adaptationSets.length; adaptIndex++) {

      var adaptationElement = adaptationSets[adaptIndex];

      if (adaptationElement) {
        var contentType = adaptationElement.getAttribute("contentType");
        var representationElements = adaptationElement.querySelectorAll("Representation");
        var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
        var timelineElements = adaptationElement.querySelectorAll("S");
        var stream = manifest.streams[contentType] = {
          streamType: contentType,
          mimeType: adaptationElement.getAttribute("mimeType"),
          codecs: adaptationElement.getAttribute("codecs"),
          initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
          fragUrlFormat: segmentTemplateElement.getAttribute("media"),
          qualities: [],
          timeline: []
        };

        var timeScale = segmentTemplateElement.getAttribute("timescale");

        if (!timelineElements || !timelineElements.length) {
          throw "Missing timeline";
        }

        for (var repIndex = 0; repIndex < representationElements.length; repIndex++) {
          var repElement = representationElements[repIndex];
          var quality = {
            id: repElement.getAttribute("id"),
            bandwidth: repElement.getAttribute("bandwidth")
          };

          if (repElement.getAttribute("height")) {
            quality.width = Number(repElement.getAttribute("width"));
            quality.height = Number(repElement.getAttribute("height"));
          }

          stream.qualities.push(quality);
        }

        var startTime = 0;

        for (var timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
          var timelineElement = timelineElements[timelineIndex];
          var repeatCount = Number(timelineElement.getAttribute("r")) || 0;
          var duration = Number(timelineElement.getAttribute("d"));

          for (i = 0; i <= repeatCount; i++) {
            stream.timeline.push({
              start: startTime,
              startSeconds: startTime / timeScale,
              length: duration,
              lengthSeconds: duration / timeScale
            });

            startTime += duration;
          }
        }
      }
    }

    return manifest;
  }
};

_mix(Dashling.ManifestParser.prototype, EventingMixin);