define(["require", "exports", './Utilities'], function (require, exports, Utilities_1) {
    var Manifest = (function () {
        function Manifest(settings) {
            this._settings = settings;
        }
        Manifest.prototype.parseFromRequest = function (request) {
            this.request = request;
            this.parse(request.data);
        };
        Manifest.prototype.parse = function (manifestText) {
            var parser = new DOMParser();
            var xmlDoc = parser.parseFromString(manifestText, "text/xml");
            var i;
            this.baseUrl = this._settings.baseUrlOverride || Utilities_1.default.getXmlNodeValue(xmlDoc, "BaseURL", "");
            this.mediaDuration = Utilities_1.default.fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
            this.streams = {};
            var adaptationSets = xmlDoc.querySelectorAll("AdaptationSet");
            for (var adaptIndex = 0; adaptIndex < adaptationSets.length; adaptIndex++) {
                var adaptationElement = adaptationSets[adaptIndex];
                if (adaptationElement) {
                    var contentType = adaptationElement.getAttribute("contentType");
                    var representationElements = adaptationElement.querySelectorAll("Representation");
                    var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
                    var timelineElements = adaptationElement.querySelectorAll("S");
                    var stream = this.streams[contentType] = {
                        streamType: contentType,
                        mimeType: adaptationElement.getAttribute("mimeType"),
                        codecs: adaptationElement.getAttribute("codecs"),
                        initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
                        fragUrlFormat: segmentTemplateElement.getAttribute("media"),
                        qualities: [],
                        timeline: []
                    };
                    var timeScale = Number(segmentTemplateElement.getAttribute("timescale"));
                    if (!timelineElements || !timelineElements.length) {
                        throw "Missing timeline";
                    }
                    for (var repIndex = 0; repIndex < representationElements.length; repIndex++) {
                        var repElement = representationElements[repIndex];
                        var quality = {
                            id: repElement.getAttribute("id"),
                            bandwidth: repElement.getAttribute("bandwidth"),
                            width: 0,
                            height: 0
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
        };
        return Manifest;
    })();
    exports.default = Manifest;
});
