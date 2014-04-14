test("StreamController.constructor", function() {
  var streamController = new Dashling.StreamController();

  streamController.dispose();

  equal(streamController.isDisposed, true, "StreamController can be created and disposed.");
});

test("StreamController._getCurrentFragmentRange", function() {
  var streamController = new Dashling.StreamController();

  _mix(streamController, {
    _videoElement: {
      currentTime: 0,
      duration: 5
    },
    _settings: {
      maxBufferSeconds: 0
    },
    _streams: [{
      fragments: [{
        time: {
          lengthSeconds: 2
        }
      }, {
        time: {
          lengthSeconds: 2
        }
      }, {
        time: {
          lengthSeconds: 1
        }
      }]
    }]
  });

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: 0,
    end: 0
  }, "A max buffer seconds of 0 results in 1 fragment");

  streamController._settings.maxBufferSeconds = 2;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: 0,
    end: 1
  }, "A max buffer seconds of 2 results in 2 fragments");

  streamController._videoElement.currentTime = 2;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: 0,
    end: 2
  }, "Moving the currentTime to 2 moves the end range up");

  streamController._videoElement.currentTime = 3;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: 1,
    end: 2
  }, "Moving the currentTime to 3 moves the start range up");

  streamController._videoElement.currentTime = 4.5;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: 2,
    end: 2
  }, "Moving the currentTime to almost end returns last fragment");

  streamController._videoElement.currentTime = streamController._videoElement.duration;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: -1,
    end: -1
  }, "Moving the currentTime to end results in -1 range");
});