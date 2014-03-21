var ThrottleMixin = {
  throttle: function(func, id, minTime, shouldReset, shouldCallImmediately) {
    var _this = this;

    (!_this._throttleIds) && (_this._throttleIds = {});
    (shouldReset) && (_this.clearThrottle(id));

    if (!_this._throttleIds[id]) {
      _this._throttleIds[id] = setTimeout(function() {
        if (!shouldCallImmediately) {
          func();
        }

        delete _this._throttleIds[id];
      }, minTime);

      if (shouldCallImmediately) {
        shouldCallImmediately = false;
        func();
      }
    }
  },

  clearThrottle: function(id) {
    if (this._throttleIds) {
      clearTimeout(this._throttleIds[id]);
      delete this._throttleIds[id];
    }
  },

  clearAllThrottles: function() {
    if (this._throttleIds) {
      for (var id in this._throttleIds) {
        clearTimeout(this._throttleIds[id]);
      }
      this._throttleIds = null;
    }
  }
};