define(["require", "exports", './RequestManager', './Request', './EventGroup', './DashlingEnums', './Manifest'], function (require, exports, RequestManager_1, Request_1, EventGroup_1, DashlingEnums_1, Manifest_1) {
    var ManifestParser = (function () {
        function ManifestParser(settings) {
            var _this = this;
            this._events = new EventGroup_1.default(this);
            this._parseIndex = 0;
            this._settings = settings;
            this._requestManager = new RequestManager_1.default(settings);
            this._events.on(this._requestManager, DashlingEnums_1.DashlingEvent.download, function () {
                _this._events.raise(ManifestParser.DownloadEvent);
            });
        }
        ManifestParser.prototype.dispose = function () {
            if (this._requestManager) {
                this._requestManager.dispose();
                this._requestManager = null;
            }
        };
        ManifestParser.prototype.parse = function (url, onSuccess, onError) {
            var _this = this;
            var parseIndex = ++this._parseIndex;
            var request;
            var onParseSuccess = function (request) {
                if (_this._parseIndex === parseIndex) {
                    var manifest = new Manifest_1.default(_this._settings);
                    try {
                        manifest.parseFromRequest(request);
                        onSuccess(manifest);
                    }
                    catch (e) {
                        onError(DashlingEnums_1.DashlingError.manifestParse, e);
                    }
                }
            };
            var onParseError = function () {
                if (_this._parseIndex === parseIndex) {
                    onError(DashlingEnums_1.DashlingError.manifestDownload, request.statusCode);
                }
            };
            request = new Request_1.default({
                url: url,
                requestType: 'manifest',
                onSuccess: onParseSuccess,
                onError: onParseError
            }, this._settings);
            this._requestManager.start(request);
        };
        ManifestParser.DownloadEvent = 'download';
        return ManifestParser;
    })();
    exports.default = ManifestParser;
});
