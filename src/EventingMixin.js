var EventingMixin = {
  addEventListener: function(eventName, callback) {
    this.__events = this.__events || {};
    var eventList = this.__events[eventName] = this.__events[eventName] || [];

    eventList.push(callback);
  },

  removeEventListener: function(eventName, callback) {
    var eventList = this.__events && this.__events[eventName];

    if (eventList) {
      var index = eventList.indexOf(callback);
    }
  },

  removeAllEventListeners: function() {
    this.__events = null;
  },

  raiseEvent: function(eventName) {
    var events = this.__events && this.__events[eventName];

    for (var i = 0; events && i < events.length; i++) {
      if (events[i].apply(this, Array.prototype.slice.apply(arguments, [1])) === false) {
        break;
      }
    }
  }
};