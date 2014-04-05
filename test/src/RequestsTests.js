var settings = {
  maxRetries: 0,
  delaysBetweenRetries: [0]
};

asyncTest("Request.load success", function() {
  expect(5);

  var requests = new Dashling.RequestManager(false, settings);
  var successCalled, errorCalled;
  var request = {
    url: "foo",
    onSuccess: function() {
      successCalled = true;
      _tryComplete();
    },
    onError: function() {
      errorCalled = true;
      _tryComplete();
    }
  };

  requests._xhrType = MockXHR.mockTextResponse({
    response: "success",
    status: 200,
    latency: 20
  });

  requests.load(request);

  function _tryComplete() {
    ok(successCalled, "Success was called");
    ok(!errorCalled, "Error was not called");
    equal(request.data, "success", "Response data was correct")
    equal(request.statusCode, 200, "Response status code was correct");
    equal(request.state, Dashling.FragmentState.downloaded, "Response has correct state");

    start();
  };
});

asyncTest("Request.load failure", function() {
  expect(4);

  var requests = new Dashling.RequestManager(false, settings);
  var successCalled, errorCalled;
  var request = {
    url: "foo",
    onSuccess: function() {
      successCalled = true;
      _tryComplete();
    },
    onError: function() {
      errorCalled = true;
      _tryComplete();
    }
  };

  requests._xhrType = MockXHR.mockTextResponse({
    response: "fail",
    status: 500,
    latency: 20
  });

  requests.load(request);

  function _tryComplete() {
    ok(!successCalled, "Success was not called");
    ok(errorCalled, "Error was called");
    equal(request.statusCode, 500, "Response status code was correct");
    equal(request.state, Dashling.FragmentState.error, "Response has correct dashling state");

    start();
  }
});

test("Request.abortAll", function() {
  var requests = new Dashling.RequestManager(false, settings);
  var successCalled, errorCalled;
  var request = {
    url: 'foo',
    onSuccess: function() {
      successCalled = true;
    },
    onError: function() {
      errorCalled = true;
    }
  };

  requests._xhrType = MockXHR.mockTextResponse();
  requests.load(request);

  equal(requests.getActiveRequestCount(), 1, "There was 1 active request");

  requests.abortAll();

  equal(requests.getActiveRequestCount(), 0, "After abort, there were 0 active requests");
  ok(!successCalled, "Success callback was not called");
  ok(errorCalled, "Error callback was called");
  equal(request.statusCode, "aborted", "Request status marked as aborted");
});