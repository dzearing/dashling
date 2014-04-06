test("EventingMixin eventing", function() {
  var callbackExecuteCount = 0;
  var obj = {};
  _mix(obj, EventingMixin);

  function _execute() {
    callbackExecuteCount++;
  }

  function _returnFalse() {
    return false;
  }

  obj.addEventListener("foo", _execute);
  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 1, "Raised event 1 time");

  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 2, "Raised event 2 times");

  obj.removeEventListener("foo", _execute);
  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 2, "Raised event 2 times after removing");

  obj.addEventListener("foo", _execute);
  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 3, "Raised event 3 times after adding again");

  obj.raiseEvent("bar");
  equal(callbackExecuteCount, 3, "Raised event 3 times after raising a random event");

  obj.removeAllEventListeners();
  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 3, "Raised event 3 times after removeAllEventListeners called");

  obj.addEventListener("foo", _returnFalse);
  obj.addEventListener("foo", _execute);
  obj.raiseEvent("foo");

  equal(callbackExecuteCount, 3, "Raised event 3 times after event handler canceled event");

});