Dashling.ManifestParser = function() {
    this._requests = new Dashling.Requests();
};

Dashling.prototype = {
    _parseIndex: 0,

    dispose: function() {
        if (this._requests) {
            this._requests.dispose();
            this._requests = null;
        }
    },

    parse: function(url, onSuccess, onError) {
        var _this = this;
        var parseIndex = ++_this._parseIndex;
        var request = { url: url };

        this._requests.load(request, false, _onSuccess, _onError);

        function _onSuccess() {
            if (_this._parseIndex == parseIndex) {
                onSuccess(_this._parseManifest(request.data));
            }
        }

        function _onError() {
            if (_this._parseIndex == parseIndex) {
                onError(request);
            }
        }
    },

    _parseManifest: function(manifestText) {
        var manifest = {};
        var parser = new DOMParser();
        var xmlDoc = parser.parseFromString(manifestText,"text/xml");
        var i;

        manifest.baseUrl = _getXmlNodeValue(xmlDoc, "BaseURL", "");
        manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
        manifest.streams = {};

        var adaptations = [
            xmlDoc.querySelector("AdaptationSet[contentType='audio']"),
            xmlDoc.querySelector("AdaptationSet[contentType='video']")
        ];

        for (var adaptIndex = 0 ; adaptIndex < adaptations.length; adaptIndex++) {
            var adaptationElement = adaptations[adaptIndex];

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


                for (var repIndex = 0; repIndex < representationElements.length; repIndex++) {
                    var repElement = representationElements[repIndex];
                    var quality = {
                        id: repElement.getAttribute("id"),
                        bandwidth: repElement.getAttribute("bandwidth"),
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
                            lengthSeconds: duration / timeScale });

                        startTime += duration;
                    }
                }
            }
        }

        return manifest;
    }
};

