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

    function _onSuccess(request) {
      if (_this._parseIndex == parseIndex) {
        var manifest;

        try {
          manifest = _this._parseManifest(request.data, url);
          manifest.request = request;
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

  _parseManifest: function(manifestText, manifestUrl) {
    var manifest = {};
    var parser = new DOMParser();
    var xmlDoc = parser.parseFromString(manifestText, "text/xml");
    var i;

    manifest.baseUrl = this._settings.baseUrlOverride || _getXmlNodeValue(xmlDoc, "BaseURL", "");
    if (manifestUrl && !manifest.baseUrl) {
      // fallback to the parent directory of the manifest URL per DASH spec
      manifest.baseUrl = manifestUrl.substring(0, manifestUrl.lastIndexOf('/')+1);
    }
    manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
    manifest.streams = {};

    var adaptationSets = xmlDoc.querySelectorAll("AdaptationSet");

    for (var adaptIndex = 0; adaptIndex < adaptationSets.length; adaptIndex++) {

      var adaptationElement = adaptationSets[adaptIndex];

      if (adaptationElement) {
        var contentType = adaptationElement.getAttribute("contentType");
		    if (!contentType) {
		      contentType = adaptationElement.getAttribute("mimeType").split("/")[0];
		    }
        var representationElements = adaptationElement.querySelectorAll("Representation");
        var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
        var stream = manifest.streams[contentType] = {
          streamType: contentType,
          mimeType: adaptationElement.getAttribute("mimeType"),
          codecs: adaptationElement.getAttribute("codecs") || adaptationElement.querySelector("[codecs]").getAttribute("codecs"),
          initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
          fragUrlFormat: segmentTemplateElement.getAttribute("media"),
          qualities: [],
          timeline: []
        };

        var timeScale = segmentTemplateElement.getAttribute("timescale");
        var maxSegmentDurationInTimeScale = segmentTemplateElement.getAttribute("duration");
        var maxSegmentDuration = maxSegmentDurationInTimeScale / timeScale;

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
        
        // lowest bandwidth stream should be at index 0
        stream.qualities.sort(function(a,b) {
          return a.bandwidth - b.bandwidth;
        });
        
        var firstSegmentIndex = 1;
        if (segmentTemplateElement.hasAttribute("startNumber")) {
          firstSegmentIndex = parseInt(segmentTemplateElement.getAttribute("startNumber"));
        }
        
        var length;
         
        var timelineElements = adaptationElement.querySelectorAll("S");
        if (timelineElements.length) {
          // timeline-based manifest 
          var startTime = 0;
          for (var timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
            var timelineElement = timelineElements[timelineIndex];
            var repeatCount = Number(timelineElement.getAttribute("r")) || 0;
            length = Number(timelineElement.getAttribute("d"));
            for (i = 0; i <= repeatCount; i++) {
              stream.timeline.push({
                'length': length,
                'lengthSeconds': length / timeScale,
                'start': startTime,
                'startSeconds': startTime / timeScale
              });
              startTime += length;
            }
          }
          
        } else {
          // index-based manifest
          var totalSegmentCount = Math.ceil(manifest.mediaDuration / maxSegmentDuration);

          for (var segmentIndex = 0; segmentIndex < totalSegmentCount; segmentIndex++) {
            var serverSegmentIndex = segmentIndex + firstSegmentIndex;
            var startSeconds = segmentIndex * maxSegmentDuration;
            length = Math.min( maxSegmentDuration, manifest.mediaDuration - startSeconds);
            stream.timeline.push({
              'serverSegmentIndex': serverSegmentIndex,
              'length': length * timeScale,
              'lengthSeconds': length,
              'start': startSeconds * timeScale,
              'startSeconds': startSeconds
            });
          }
          
        }
      }
    }

    return manifest;
  }
};

_mix(Dashling.ManifestParser.prototype, EventingMixin);
