var _defaultSettings = {
  targetQuality: {
    video: 5
  },
  manifest: {
    mediaDuration: 10,
    streams: {
      video: {
        timeline: [{
          startSeconds: 0,
          lengthSeconds: 5
        }, {
          startSeconds: 5,
          lengthSeconds: 10
        }],
        qualities: ["quality1", "quality2"]
      }
    }
  }
};

test("Stream.constructor", function() {
  var stream = new Dashling.Stream("video", null, null, _defaultSettings);

  equal(stream.fragments.length, 2, "Stream has 2 fragments");
  equal(stream.qualityIndex, 1, "Stream has correct default quality");

  stream.dispose();

  ok(stream.isDisposed, "Stream was disposed");
});


test("Stream.isBuffered", function() {
  var stream = new Dashling.Stream("video", null, null, _defaultSettings);

  var bufferRanges = stream._buffer = {
    buffered: {
      ranges: [{
        s: 0,
        e: 5
      }],
      start: function(index) {
        return this.ranges[index].s;
      },
      end: function(index) {
        return this.ranges[index].e;
      },
      length: 1
    }
  };

  equal(stream.isBuffered(0, 0), true, "first fragment is buffered");
  equal(stream.isBuffered(1, 0), false, "second fragment is not buffered");

  // Adjust the start to be missing up to .5 s.
  bufferRanges.buffered.ranges[0].s = .5;
  equal(stream.isBuffered(0, 0), true, "first fragment is still considered buffered with .5 start");

  bufferRanges.buffered.ranges[0].s = .51;
  equal(stream.isBuffered(0, 0), false, "first fragment is not considered buffered if gap is greater than .5");

  bufferRanges.buffered.ranges[0].s = 0;
  bufferRanges.buffered.ranges[0].e = 4.85;
  equal(stream.isBuffered(0, 0), true, "first fragment is considered buffered if end is >= .15 seconds to the end");

  bufferRanges.buffered.ranges[0].e = 4.84;
  equal(stream.isBuffered(0, 0), false, "first fragment is not considered buffered if end is < .15 seconds to the end");
});
