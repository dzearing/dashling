test("_mix", function() {
  var obj1 = {
    foo: "foo"
  };
  var obj2 = {
    bar: "bar"
  };

  var result = _mix(obj1, obj2);

  ok(result === obj1, "returns dest object");
  equal(result.foo, "foo", "has original property");
  equal(result.bar, "bar", "has new property");
});

test("_bind", function() {
  var result = null;
  var obj = {
    foo: "passed"
  };

  function _testBind() {
    result = this.foo;
  }

  var _boundFunction = _bind(obj, _testBind);


  _boundFunction();

  equal(result, "passed", "function was called in the correct context");
});


test("_fromISOToSeconds", function() {
  equal(_fromISOToSeconds("PT0H0M0S"), 0, "0");
  equal(_fromISOToSeconds("PT0H0M29.367S"), 29.367, "29.367");
  equal(_fromISOToSeconds("PT0H1M1S"), 61, "61");
  equal(_fromISOToSeconds("PT1H1M1S"), 3661, "3661");
});

test("_addMetric", function() {
  var metrics = [];

  _addMetric(metrics, 1, 2);
  equal(metrics.average, 1, "1");

  _addMetric(metrics, 2, 2);
  equal(metrics.average, 1.5, "1.5");

  _addMetric(metrics, 2, 2);
  equal(metrics.average, 2, "2");
  equal(metrics.length, 2, "should be 2 after 2");

  _addMetric(metrics, 4, 2);
  equal(metrics.average, 3, "3");
  equal(metrics.length, 2, "should be 2 after 3");
});

test("_getXmlNodeValue", function() {
  var parser = new DOMParser();
  var xmlDoc = parser.parseFromString('<xml><node>text</node></xml>', "text/xml");

  equal(_getXmlNodeValue(xmlDoc, "node", "blah"), "text", "Success query works");
  equal(_getXmlNodeValue(xmlDoc, "foo", "blah"), "blah", "Missing node works");
});