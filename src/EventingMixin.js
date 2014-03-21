var EventingMixin = {
  on: function(eventName, callback) {
    this.__events = this.__events || {};
    var eventList = this.__events[eventName] = this.__events[eventName] || [];

    eventList.push(callback);
  },

  off: function(eventName, callback) {
    var eventList = this.__events && this.__events[eventName];

    if (eventList) {
      var index = eventList.indexOf(callback);
    }
  },

  raiseEvent: function(eventName, args) {
    var events = this.__events && this.__events[eventName];

    for (var i = 0; events && i < events.length; i++) {
      if (events[i].call(this, args) === false) {
        break;
      }
    }
  }
};