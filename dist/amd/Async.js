define(["require", "exports"], function (require, exports) {
    var Async = (function () {
        function Async(parent) {
            this._parent = parent;
            this._throttleIds = {};
            this._timeoutIds = {};
        }
        Async.prototype.dispose = function () {
            if (!this._isDisposed) {
                this._isDisposed = true;
                this.clearAllThrottles();
                this.clearAllTimeouts();
            }
        };
        Async.prototype.setTimeout = function (func, delay) {
            var _this = this;
            var timeoutId;
            timeoutId = setTimeout(function () {
                delete _this._timeoutIds[timeoutId];
                timeoutId = 0;
                func.apply(_this._parent);
            }, delay);
            if (timeoutId) {
                this._timeoutIds[timeoutId] = true;
            }
            return timeoutId;
        };
        Async.prototype.clearTimeout = function (timeoutId) {
            clearTimeout(timeoutId);
            delete this._timeoutIds[timeoutId];
        };
        Async.prototype.clearAllTimeouts = function () {
            for (var id in this._timeoutIds) {
                clearTimeout(id);
            }
            this._timeoutIds = {};
        };
        Async.prototype.throttle = function (func, id, minTime, shouldReset, shouldCallImmediately) {
            var _this = this;
            if (shouldReset) {
                this.clearThrottle(id);
            }
            if (!this._throttleIds[id]) {
                this._throttleIds[id] = setTimeout(function () {
                    if (!shouldCallImmediately) {
                        func.apply(_this._parent);
                    }
                    delete _this._throttleIds[id];
                }, minTime);
                if (shouldCallImmediately) {
                    shouldCallImmediately = false;
                    func.apply(this._parent);
                }
            }
        };
        Async.prototype.clearThrottle = function (id) {
            if (this._throttleIds) {
                clearTimeout(this._throttleIds[id]);
                delete this._throttleIds[id];
            }
        };
        Async.prototype.clearAllThrottles = function () {
            if (this._throttleIds) {
                for (var id in this._throttleIds) {
                    clearTimeout(this._throttleIds[id]);
                }
                this._throttleIds = null;
            }
        };
        return Async;
    })();
    exports.default = Async;
});
