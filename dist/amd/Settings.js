define(["require", "exports"], function (require, exports) {
    var Settings = (function () {
        function Settings() {
            // The manifest object to use, if you want to skip the serial call to fetch the xml.
            this.manifest = null;
            // Default start time for video, in seconds.
            this.startTime = 0;
            // If auto bitrate regulation is enabled.
            this.isABREnabled = true;
            // Randomize bitrate (testing purposes)
            this.isRBREnabled = false;
            // The quality to use if we have ABR disabled, or if default bandwidth is not available.
            this.targetQuality = {
                audio: 2,
                video: 2
            };
            // If we should auto play the video when enough buffer is available.
            this.shouldAutoPlay = true;
            // Logs debug data to console.
            this.logToConsole = false;
            // Number of buffered seconds in which we will start to be more aggressive on estimates.
            this.safeBufferSeconds = 12;
            // Number of buffered seconds before we stop buffering more.
            this.maxBufferSeconds = 119.5;
            // Max number of simultaneous requests per stream.
            this.maxConcurrentRequests = {
                audio: 4,
                video: 6
            };
            // Max number of fragments each stream can be ahead of the other stream by.
            this.maxSegmentLeadCount = {
                audio: 1,
                video: 5
            };
            // Default bytes per millisecond, used to determine default request staggering (480p is around 520 bytes per millisecond (4.16 mbps.)
            this.defaultBandwidth = 520;
            // Default request timeout
            this.requestTimeout = 30000;
            // Number of attempts beyond original request to try downloading something.
            this.maxRetries = 3;
            // Millisecond delays between retries.
            this.delaysBetweenRetries = [200, 1500, 3000];
            // Milliseconds that a request must be to register as a "download" that triggers the download event (used for ignoring cache responses.)
            this.requestCacheThreshold = 80;
            // Optional override for manifest baseurl.
            this.baseUrlOverride = null;
        }
        return Settings;
    })();
    exports.default = Settings;
});
