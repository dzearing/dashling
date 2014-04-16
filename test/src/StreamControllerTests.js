test("StreamController.constructor", function() {
  var streamController = new Dashling.StreamController();

  streamController.dispose();

  equal(streamController.isDisposed, true, "StreamController can be created and disposed.");
});

test("StreamController._getCurrentFragmentRange", function() {
  var streamController = new Dashling.StreamController();

  _mix(streamController, {
    _videoElement: {
      currentTime: 0
    },
    _settings: {
      maxBufferSeconds: 0,
      manifest: {
        mediaDuration: 5
      }
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

  streamController._videoElement.currentTime = streamController._settings.manifest.mediaDuration;

  deepEqual(streamController._getCurrentFragmentRange(), {
    start: -1,
    end: -1
  }, "Moving the currentTime to end results in -1 range");
});

test("StreamController._ensureStreamsUpdated", function() {
  var streamController = new Dashling.StreamController();

  _mix(streamController, {
    _videoElement: {
      currentTime: 0
    },
    _streams: [{
      assessQuality: function() {},
      isMissing: function(index, time) {
        return true;
      },
      fragments: [{
        time: {
          startSeconds: 0
        },
        state: DashlingFragmentState.appended
      }, {
        time: {
          startSeconds: 0
        },
        state: DashlingFragmentState.appended
      }, {
        time: {
          startSeconds: 0
        },
        state: DashlingFragmentState.appended
      }, {
        time: {
          startSeconds: 0
        },
        state: DashlingFragmentState.appended

      }]
    }]
  });

  streamController._ensureStreamsUpdated({
    start: 1,
    end: 2
  });
  equal(streamController._streams[0].fragments[0].state, DashlingFragmentState.appended);
  equal(streamController._streams[0].fragments[1].state, DashlingFragmentState.idle);
  equal(streamController._streams[0].fragments[2].state, DashlingFragmentState.idle);
  equal(streamController._streams[0].fragments[3].state, DashlingFragmentState.appended);

  streamController._ensureStreamsUpdated({
    start: 0,
    end: 3
  });
  equal(streamController._streams[0].fragments[0].state, DashlingFragmentState.idle);
  equal(streamController._streams[0].fragments[1].state, DashlingFragmentState.idle);
  equal(streamController._streams[0].fragments[2].state, DashlingFragmentState.idle);
  equal(streamController._streams[0].fragments[3].state, DashlingFragmentState.idle);
});

test("StreamController._getMissingFragmentIndex", function() {
  var streamController = new Dashling.StreamController();

  _mix(streamController, {
    _streams: [{
      fragments: [{
        state: DashlingFragmentState.idle
      }, {
        state: DashlingFragmentState.appended
      }, {
        state: DashlingFragmentState.appended
      }, {
        state: DashlingFragmentState.idle
      }]
    }]
  });

  equal(streamController._getMissingFragmentIndex({
    start: 1,
    end: 2
  }), -1);

  equal(streamController._getMissingFragmentIndex({
    start: 0,
    end: 2
  }), 0);

  equal(streamController._getMissingFragmentIndex({
    start: 0,
    end: 3
  }), 0);

  equal(streamController._getMissingFragmentIndex({
    start: 1,
    end: 3
  }), 3);
});

test("StreamController._getDownloadableIndexes", function() {
  var streamController = new Dashling.StreamController();

  _mix(streamController, {
    _settings: {
      maxSegmentLeadCount: {
        foo: 1
      },
      maxConcurrentRequests: {
        foo: 3
      }
    }
  });

  var testStream = {
    getActiveRequestCount: function() {
      return this.activeRequests;
    },
    activeRequests: 0,
    streamType: "foo",
    fragments: [{
      state: DashlingFragmentState.error
    }, {
      state: DashlingFragmentState.idle
    }, {
      state: DashlingFragmentState.idle
    }, {
      state: DashlingFragmentState.idle
    }, {
      state: DashlingFragmentState.idle
    }]
  };

  deepEqual(streamController._getDownloadableIndexes(
      testStream, {
        start: 0,
        end: 4
      }), [0, 1],
    "Full range test with max lead count restricting requests");

  testStream.activeRequests = 2;

  deepEqual(streamController._getDownloadableIndexes(
      testStream, {
        start: 0,
        end: 4
      }), [0],
    "Full range test with max concurrency restricting requests");

  testStream.activeRequests = 0;
  testStream.fragments[0].state = DashlingFragmentState.downloading;
  testStream.fragments[1].state = DashlingFragmentState.downloading;

  deepEqual(streamController._getDownloadableIndexes(
      testStream, {
        start: 0,
        end: 4
      }), [],
    "Full range test with max lead count and partial completion restricting requests");

  streamController._settings.maxSegmentLeadCount.foo = 5;

  deepEqual(streamController._getDownloadableIndexes(
      testStream, {
        start: 0,
        end: 4
      }), [2, 3, 4],
    "Full range test with partial completion restricting requests");
});

test("StreamController.getRemainingBuffer", function() {
  var streamController = new Dashling.StreamController();
  var buffered = {
    length: 1,
    ranges: [{
      start: 0,
      end: 0.25
    }],
    start: function(index) {
      return this.ranges[index].start;
    },
    end: function(index) {
      return this.ranges[index].end;
    }
  };

  _mix(streamController, {
    _settings: {
      startTime: 0
    },
    _videoElement: {
      currentTime: 0,
      buffered: buffered
    }
  });

  equal(streamController.getRemainingBuffer(), 0.25, "0.25 seconds left");

  buffered.ranges[0].start = .8;
  buffered.ranges[0].end = 5;

  equal(streamController.getRemainingBuffer(), 4.2, "4.2 seconds left");

  buffered.ranges[0].start = 1;

  equal(streamController.getRemainingBuffer(), 0, "0 seconds left");

  streamController._videoElement.currentTime = 1;
  equal(streamController.getRemainingBuffer(), 4, "4 seconds left");

  streamController._videoElement.currentTime = 2;
  equal(streamController.getRemainingBuffer(), 3, "3 seconds left");

  buffered.ranges[0].end = 10;
  equal(streamController.getRemainingBuffer(), 8, "8 seconds left");

  buffered.length = 2;
  buffered.ranges.push({
    start: 10.001,
    end: 15
  });

  equal(streamController.getRemainingBuffer(), 13, "13 seconds left, after small gap");
});
