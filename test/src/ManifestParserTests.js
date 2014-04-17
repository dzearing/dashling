var workingManifest = '' +
  '<MPD type="static" maxSegmentDuration="PT5.000S" profiles="urn:mpeg:dash:profile:isoff-live:2011" mediaPresentationDuration="PT0H0M9.009S" minBufferTime="PT4.500S" xmlns="urn:mpeg:DASH:schema:MPD:2011">' +
  '  <BaseURL>dog/</BaseURL>' +
  '  <Period>' +
  '    <AdaptationSet id="0" contentType="audio" mimeType="audio/mp4" segmentAlignment="true" bitstreamSwitching="true" codecs="mp4a.40.2">' +
  '      <SegmentTemplate timescale="48000" initialization="init-$RepresentationID$.bin" media="$RepresentationID$-$Time$.bin">' +
  '        <SegmentTimeline>' +
  '          <S d="240000" r="0" />' +
  '          <S d="192432" />' +
  '        </SegmentTimeline>' +
  '      </SegmentTemplate>' +
  '      <Representation id="audio-low" audioSamplingRate="48000" bandwidth="96000" codecs="mp4a.40.2" />' +
  '      <Representation id="audio-medium" audioSamplingRate="48000" bandwidth="128000" codecs="mp4a.40.2" />' +
  '      <Representation id="audio-high" audioSamplingRate="48000" bandwidth="192000" codecs="mp4a.40.2" />' +
  '    </AdaptationSet>' +
  '    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" segmentAlignment="true" bitstreamSwitching="true" maxFrameRate="30000/1001" maxWidth="1920" maxHeight="1080" codecs="avc1.4d0028">' +
  '      <SegmentTemplate timescale="29970" initialization="init-$RepresentationID$.bin" media="$RepresentationID$-$Time$.bin">' +
  '        <SegmentTimeline>' +
  '          <S d="149850" r="0" />' +
  '          <S d="120149" />' +
  '        </SegmentTimeline>' +
  '      </SegmentTemplate>' +
  '      <Representation id="video-240p" width="426" height="240" frameRate="30000/1001" bandwidth="360000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-360p" width="640" height="360" frameRate="30000/1001" bandwidth="672000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-480p" width="852" height="480" frameRate="30000/1001" bandwidth="1200000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-720p" width="1280" height="720" frameRate="30000/1001" bandwidth="2704000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-1080p" width="1920" height="1080" frameRate="30000/1001" bandwidth="6072000" codecs="avc1.4d0028" />' +
  '    </AdaptationSet>' +
  '  </Period>' +
  '</MPD>';

var workingManifestExpectedResult = {
  "baseUrl": "dog/",
  "mediaDuration": 9.009,
  "streams": {
    "audio": {
      "codecs": "mp4a.40.2",
      "fragUrlFormat": "$RepresentationID$-$Time$.bin",
      "initUrlFormat": "init-$RepresentationID$.bin",
      "mimeType": "audio/mp4",
      "qualities": [{
        "bandwidth": "96000",
        "id": "audio-low"
      }, {
        "bandwidth": "128000",
        "id": "audio-medium"
      }, {
        "bandwidth": "192000",
        "id": "audio-high"
      }],
      "streamType": "audio",
      "timeline": [{
        "length": 240000,
        "lengthSeconds": 5,
        "start": 0,
        "startSeconds": 0
      }, {
        "length": 192432,
        "lengthSeconds": 4.009,
        "start": 240000,
        "startSeconds": 5
      }]
    },
    "video": {
      "codecs": "avc1.4d0028",
      "fragUrlFormat": "$RepresentationID$-$Time$.bin",
      "initUrlFormat": "init-$RepresentationID$.bin",
      "mimeType": "video/mp4",
      "qualities": [{
        "bandwidth": "360000",
        "height": 240,
        "id": "video-240p",
        "width": 426
      }, {
        "bandwidth": "672000",
        "height": 360,
        "id": "video-360p",
        "width": 640
      }, {
        "bandwidth": "1200000",
        "height": 480,
        "id": "video-480p",
        "width": 852
      }, {
        "bandwidth": "2704000",
        "height": 720,
        "id": "video-720p",
        "width": 1280
      }, {
        "bandwidth": "6072000",
        "height": 1080,
        "id": "video-1080p",
        "width": 1920
      }],
      "streamType": "video",
      "timeline": [{
        "length": 149850,
        "lengthSeconds": 5,
        "start": 0,
        "startSeconds": 0
      }, {
        "length": 120149,
        "lengthSeconds": 4.008975642308975,
        "start": 149850,
        "startSeconds": 5
      }]
    }
  }
};

var videoOnlyManifest = '' +
  '<MPD type="static" maxSegmentDuration="PT5.000S" profiles="urn:mpeg:dash:profile:isoff-live:2011" mediaPresentationDuration="PT0H0M9.009S" minBufferTime="PT4.500S" xmlns="urn:mpeg:DASH:schema:MPD:2011">' +
  '  <BaseURL>dog/</BaseURL>' +
  '  <Period>' +
  '    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" segmentAlignment="true" bitstreamSwitching="true" maxFrameRate="30000/1001" maxWidth="1920" maxHeight="1080" codecs="avc1.4d0028">' +
  '      <SegmentTemplate timescale="29970" initialization="init-$RepresentationID$.bin" media="$RepresentationID$-$Time$.bin">' +
  '        <SegmentTimeline>' +
  '          <S d="149850" r="0" />' +
  '          <S d="120149" />' +
  '        </SegmentTimeline>' +
  '      </SegmentTemplate>' +
  '      <Representation id="video-240p" width="426" height="240" frameRate="30000/1001" bandwidth="360000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-360p" width="640" height="360" frameRate="30000/1001" bandwidth="672000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-480p" width="852" height="480" frameRate="30000/1001" bandwidth="1200000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-720p" width="1280" height="720" frameRate="30000/1001" bandwidth="2704000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-1080p" width="1920" height="1080" frameRate="30000/1001" bandwidth="6072000" codecs="avc1.4d0028" />' +
  '    </AdaptationSet>' +
  '  </Period>' +
  '</MPD>';

var videoOnlyManifestExpectedResult = {
  "baseUrl": "dog/",
  "mediaDuration": 9.009,
  "streams": {
    "video": {
      "codecs": "avc1.4d0028",
      "fragUrlFormat": "$RepresentationID$-$Time$.bin",
      "initUrlFormat": "init-$RepresentationID$.bin",
      "mimeType": "video/mp4",
      "qualities": [{
        "bandwidth": "360000",
        "height": 240,
        "id": "video-240p",
        "width": 426
      }, {
        "bandwidth": "672000",
        "height": 360,
        "id": "video-360p",
        "width": 640
      }, {
        "bandwidth": "1200000",
        "height": 480,
        "id": "video-480p",
        "width": 852
      }, {
        "bandwidth": "2704000",
        "height": 720,
        "id": "video-720p",
        "width": 1280
      }, {
        "bandwidth": "6072000",
        "height": 1080,
        "id": "video-1080p",
        "width": 1920
      }],
      "streamType": "video",
      "timeline": [{
        "length": 149850,
        "lengthSeconds": 5,
        "start": 0,
        "startSeconds": 0
      }, {
        "length": 120149,
        "lengthSeconds": 4.008975642308975,
        "start": 149850,
        "startSeconds": 5
      }]
    }
  }
};

var missingTimelineManifest = '' +
  '<MPD type="static" maxSegmentDuration="PT5.000S" profiles="urn:mpeg:dash:profile:isoff-live:2011" mediaPresentationDuration="PT0H0M9.009S" minBufferTime="PT4.500S" xmlns="urn:mpeg:DASH:schema:MPD:2011">' +
  '  <BaseURL>dog/</BaseURL>' +
  '  <Period>' +
  '    <AdaptationSet id="1" contentType="video" mimeType="video/mp4" segmentAlignment="true" bitstreamSwitching="true" maxFrameRate="30000/1001" maxWidth="1920" maxHeight="1080" codecs="avc1.4d0028">' +
  '      <SegmentTemplate timescale="29970" initialization="init-$RepresentationID$.bin" media="$RepresentationID$-$Time$.bin">' +
  '      </SegmentTemplate>' +
  '      <Representation id="video-240p" width="426" height="240" frameRate="30000/1001" bandwidth="360000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-360p" width="640" height="360" frameRate="30000/1001" bandwidth="672000" codecs="avc1.4d401e" />' +
  '      <Representation id="video-480p" width="852" height="480" frameRate="30000/1001" bandwidth="1200000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-720p" width="1280" height="720" frameRate="30000/1001" bandwidth="2704000" codecs="avc1.4d001f" />' +
  '      <Representation id="video-1080p" width="1920" height="1080" frameRate="30000/1001" bandwidth="6072000" codecs="avc1.4d0028" />' +
  '    </AdaptationSet>' +
  '  </Period>' +
  '</MPD>';

test("Working manifest parse", function() {
  var parser = new Dashling.ManifestParser({});

  deepEqual(parser._parseManifest(workingManifest), workingManifestExpectedResult, "Parse valid");

  parser.dispose();
});

test("Video-only manifest parse", function() {
  var parser = new Dashling.ManifestParser({});

  deepEqual(parser._parseManifest(videoOnlyManifest), videoOnlyManifestExpectedResult, "Parse valid");

  parser.dispose();
});

test("ManifestParser.parse success", function() {
  var parser = new Dashling.ManifestParser({});
  var request = null;
  var manifest = null;

  parser._requestManager = {
    load: function(r) {
      request = r;
    },
    dispose: function() {}
  };

  parser.parse("url", function(man) {
    manifest = man;
  });

  ok(request, "Request was loaded");

  request.data = workingManifest;
  request.onSuccess(request);

  // Ignore the request in the deepEqual.
  delete manifest.request;

  deepEqual(manifest, workingManifestExpectedResult, "Success called with valid parse");

  parser.dispose();
});

test("ManifestParser.parse 404 error", function() {
  var parser = new Dashling.ManifestParser({});
  var request = null;
  var manifest = null;
  var error;
  var code;

  parser._requestManager = {
    load: function(r) {
      request = r;
    },
    dispose: function() {}
  };

  parser.parse("url", function(man) {
    manifest = man;
  }, function(e, c) {
    error = e;
    code = c;
  });

  ok(request, "Request was loaded");

  request.statusCode = 404;
  request.onError();

  equal(error, Dashling.Error.manifestDownload, "Returned manifestDownload error");
  equal(code, 404, "Returned 404");

  parser.dispose();
});

test("ManifestParser.parse missing timeline", function() {
  var parser = new Dashling.ManifestParser({});
  var request = null;
  var manifest = null;
  var error;
  var code;

  parser._requestManager = {
    load: function(r) {
      request = r;
    },
    dispose: function() {}
  };

  parser.parse(
    "url",
    function(man) {
      manifest = man;
    },
    function(e, c) {
      error = e;
      code = c;
    });

  ok(request, "Request was loaded");

  request.data = missingTimelineManifest;
  request.onSuccess();

  equal(error, Dashling.Error.manifestParse, "Returned manifestParse error");

  parser.dispose();
});
