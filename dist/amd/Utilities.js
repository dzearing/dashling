define(["require", "exports"], function (require, exports) {
    var VideoErrorCode;
    (function (VideoErrorCode) {
        VideoErrorCode[VideoErrorCode["MEDIA_ERR_ABORTED"] = 1] = "MEDIA_ERR_ABORTED";
        VideoErrorCode[VideoErrorCode["MEDIA_ERR_NETWORK"] = 2] = "MEDIA_ERR_NETWORK";
        VideoErrorCode[VideoErrorCode["MEDIA_ERR_DECODE"] = 3] = "MEDIA_ERR_DECODE";
        VideoErrorCode[VideoErrorCode["MEDIA_ERR_SRC_NOT_SUPPORTED"] = 4] = "MEDIA_ERR_SRC_NOT_SUPPORTED";
    })(VideoErrorCode || (VideoErrorCode = {}));
    var Utilities = (function () {
        function Utilities() {
        }
        Utilities.bind = function (obj, func) {
            return function () {
                return func.apply(obj, arguments);
            };
        };
        Utilities.log = function (message, settings) {
            if (!settings || settings.logToConsole) {
                console.log(message);
            }
        };
        Utilities.getXmlNodeValue = function (xmlDoc, elementName, defaultValue) {
            var element = xmlDoc.getElementsByTagName(elementName)[0];
            var elementText = element ? element.childNodes[0] : null;
            return elementText ? elementText.nodeValue : defaultValue;
        };
        Utilities.getVideoBufferString = function (videoElement) {
            var ranges = '';
            videoElement = videoElement || document.querySelector('video');
            for (var rangeIndex = 0; videoElement && rangeIndex < videoElement.buffered.length; rangeIndex++) {
                ranges += '[' + videoElement.buffered.start(rangeIndex) + '-' + videoElement.buffered.end(rangeIndex) + '] ';
            }
            return ranges;
        };
        Utilities.fromISOToSeconds = function (isoString) {
            // "PT0H0M29.367S";
            var seconds = 0;
            var tempString = isoString.substring(2); // Remove PT
            var tempIndex = tempString.indexOf("H");
            if (tempIndex > -1) {
                seconds += Number(tempString.substring(0, tempIndex)) * 60 * 60;
                tempString = tempString.substring(tempIndex + 1);
            }
            tempIndex = tempString.indexOf("M");
            if (tempIndex > -1) {
                seconds += Number(tempString.substring(0, tempIndex)) * 60;
                tempString = tempString.substring(tempIndex + 1);
            }
            tempIndex = tempString.indexOf("S");
            if (tempIndex > -1) {
                seconds += Number(tempString.substring(0, tempIndex));
            }
            return seconds;
        };
        Utilities.getVideoError = function (videoElement) {
            var videoError = videoElement.error;
            return videoError ? (VideoErrorCode[videoError.code] || String(videoError.code)) : null;
        };
        return Utilities;
    })();
    exports.default = Utilities;
});
