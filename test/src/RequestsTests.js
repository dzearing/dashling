asyncTest("Request.load success", function() {
    expect(4);

    var requests = new Dashling.RequestManager();
    var request = { url: "foo" };
    var success = false;

    requests.maxRetries = 3;
    requests.delayBetweenRetries = [ 0 ];
    requests._xhrType = MockXHR.mockTextResponse("success", 200, 20);

    requests.load(request, false, function() {
        ok(true, "Called success callback");
        equal(request.data, "success", "Response data was correct")
        equal(request.statusCode, 200, "Response status code was correct");
        equal(request.state, DashlingFragmentState.downloaded, "Response has correct dashling state");

        start();
    });
});

asyncTest("Request.load failure", function() {
    expect(3);

    var requests = new Dashling.RequestManager();
    var request = { url: "foo" };
    var calledFailure = false;

    requests.maxRetries = 3;
    requests.delayBetweenRetries = [ 0 ];
    requests._xhrType = MockXHR.mockTextResponse("fail", 500, 20);

    requests.load(request, false, null, function() {
        ok(true, "Called failure callback");
        equal(request.statusCode, 500, "Response status code was correct");
        equal(request.state, DashlingFragmentState.error, "Response has correct dashling state");

        start();
     });

});

