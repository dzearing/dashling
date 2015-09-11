define(["require", "exports"], function (require, exports) {
    var Storage = (function () {
        function Storage(prefix, useSessionStorage) {
            this._prefix = prefix || '';
            this._useSessionStorage = !!useSessionStorage;
        }
        Storage.prototype.getItem = function (key, defaultValue) {
            var value = defaultValue;
            key = this._prefix + key;
            try {
                if (this._useSessionStorage) {
                    value = window.sessionStorage.getItem(key);
                }
                else {
                    value = window.localStorage.getItem(key);
                }
            }
            catch (e) { }
            return value;
        };
        Storage.prototype.setItem = function (key, value) {
            key = this._prefix + key;
            try {
                if (this._useSessionStorage) {
                    window.sessionStorage.setItem(key, value);
                }
                else {
                    window.localStorage.setItem(key, value);
                }
            }
            catch (e) { }
        };
        return Storage;
    })();
    exports.default = Storage;
});
