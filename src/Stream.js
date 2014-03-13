    Dashling.Stream = function(mediaSource, manifest, streamType, settings) {
        var streamInfo = this._streamInfo = manifest.streams[streamType];
        var mediaDuration = manifest.mediaDuration;
        var fragmentTargetDuration = manifest.fragmentDuration;
        var fragmentCount = streamInfo.timeline.length;

        this._settings = settings;
        this._manifest = manifest;
        this._mediaSource = mediaSource;
        this._buffer = null;
        this._streamType = streamType;
        this._streamMap = [];
        this._initSegments = [];
        this._qualityIndex = Math.max(0, Math.min(streamInfo.qualities.length - 1, streamType == "audio" ? settings.targetAudioQuality : settings.targetVideoQuality));
        this._latenciesPerQuality = {};

        for (var i = 0; i < fragmentCount; i++) {
            this._streamMap.push({
                qualityIndex: -1,
                qualityId: "",
                time: streamInfo.timeline[i],
                activeRequest: null,
                requests: []
            });
        }
    };

    Dashling.Stream.prototype = {
        insertIndex: 0,
        canPlay: false,

        getState: function (segmentIndex) {
            var streamEntry = this._streamMap[segmentIndex];
            var activeRequest = streamEntry.activeRequest;
            var maxQualityIndex = this._streamInfo.qualities.length - 1;
            var maxInitSegment = this._initSegments[maxQualityIndex];
            var initSegment = activeRequest ? this._initSegments[activeRequest.qualityIndex] : null;
            var state = Dashling.FragmentState.idle;

            var requestState = activeRequest ? Dashling.FragmentStateIndex[activeRequest.state] : Dashling.FragmentStateIndex.idle;
            var initState = initSegment ? Dashling.FragmentStateIndex[initSegment.state] : Dashling.FragmentStateIndex.idle;
            var maxInitState = maxInitSegment ? Dashling.FragmentStateIndex[maxInitSegment.state] : Dashling.FragmentStateIndex.idle;

            var stateIndex = Math.min(requestState, Math.min(maxInitState, initState));

            for (var i in Dashling.FragmentStateIndex) {
                if (Dashling.FragmentStateIndex[i] === stateIndex) {
                    state = i;
                    break;
                }
            }

            return state;
        },

        append: function(segmentIndex, onComplete) {
            var streamEntry = this._streamMap[segmentIndex];
            var buffer = this._buffer;
            var fragmentsToAppend = [];
            var qualityIndex = streamEntry.qualityIndex;
            var maxQualityIndex = this._streamInfo.qualities.length - 1;

            if (!buffer) {
                buffer = this._buffer = this._mediaSource.addSourceBuffer(this._streamInfo.mimeType + ";codecs=" + this._streamInfo.codecs);
                if (maxQualityIndex > qualityIndex) {
                    fragmentsToAppend.push(this._initSegments[maxQualityIndex]);
                }
            }

            if (streamEntry.activeRequest && streamEntry.activeRequest.state == Dashling.FragmentState.downloaded) {
                if (segmentIndex == 0 || qualityIndex != this._streamMap[segmentIndex - 1].qualityIndex) {
                    fragmentsToAppend.push(this._initSegments[qualityIndex]);
                }

                   fragmentsToAppend.push(streamEntry.activeRequest);

                _appendNextEntry();
            }

            function _appendNextEntry()    {
                var request = fragmentsToAppend[0];

                if (fragmentsToAppend.length) {

                    request.state = Dashling.FragmentState.appending;

                    buffer.addEventListener("update", _onAppendComplete);

                    try {
                        buffer.appendBuffer(fragmentsToAppend[0].data);
                    }
                    catch (e) {
                        streamEntry.state = Dashling.FragmentState.error;
                    }

                }
                else {
                    streamEntry.state = Dashling.FragmentState.appended;
                    onComplete();
                }
            }

            function _onAppendComplete() {
                var request = fragmentsToAppend[0];

                buffer.removeEventListener("update", _onAppendComplete);

                request.state = Dashling.FragmentState.appended;
                request.timeAtAppended = new Date().getTime();

                (request.clearDataAfterAppend) && (request.data = null);

                fragmentsToAppend.shift();

                _appendNextEntry();
            }
        },

        loadFragment: function(segmentIndex, onFragmentAvailable) {
            var _this = this;
            var mapEntry = this._streamMap[segmentIndex];

            if (mapEntry) {
                if (mapEntry.activeRequest && mapEntry.activeRequest.state == Dashling.FragmentState.appended) {
                    onFragmentAvailable();
                }
                else if (!mapEntry.activeRequest) {

                    mapEntry.qualityIndex = _this._qualityIndex;
                    mapEntry.qualityId = this._streamInfo.qualities[mapEntry.qualityIndex].id;

                    _this._loadInitSegment(this._qualityIndex, onFragmentAvailable);

                    var request = {
                        url: _this._getUrl(segmentIndex, mapEntry),
                        state: Dashling.FragmentState.downloading,
                        timeAtSesssionStarted: new Date().getTime(),
                        segmentIndex: segmentIndex,
                        qualityIndex: mapEntry.qualityIndex,
                        qualityId: mapEntry.qualityId,
                        retryCount: 0,
                        timeAtDownloadStarted: -1,
                        timeAtFirstByte: -1,
                        timeAtLastByte: -1,
                        timeAtAppended: -1,
                        clearDataAfterAppend: true,
                        data: null,
                        errorCode: null
                    };

                    mapEntry.activeRequest = request;
                    mapEntry.requests.push(request);

                    Dashling.Requests.load(request, true, _onSuccess, _onFailure);
                }
            }

            function _onSuccess() {
                (!_this._latenciesPerQuality[request.qualityIndex]) && (_this._latenciesPerQuality[request.qualityIndex] = []);
                _this._latenciesPerQuality[request.qualityIndex].push((request.timeAtLastByte - request.timeAtDownloadStarted) / 1000);

                onFragmentAvailable();
            }

            function _onFailure() {

                // TODO failure?
            }
        },

        assessQuality: function(durationRemaining, currentIndex) {
            var settings = this._settings;

            if (!settings.isABREnabled) {
                this._qualityIndex = this._streamType == "audio" ? settings.targetAudioQuality : settings.targetVideoQuality;
                this.canPlay = this._getTimeToDownloadAtQuality(this._qualityIndex, currentIndex) < durationRemaining;
            }
            else {
                var qualityIndex = 0;
                var maxQuality = this._streamInfo.qualities.length - 1;
                var timeToDownload = 0;
                var canPlay = false;

                for (; qualityIndex <= maxQuality; qualityIndex++) {
                    timeToDownload = this._getTimeToDownloadAtQuality(qualityIndex, currentIndex);

                    if (timeToDownload >= durationRemaining) {
                        qualityIndex = Math.max(0, qualityIndex - 1);
                        break;
                    }

                    canPlay = true;

                    if (qualityIndex == maxQuality) {
                        break;
                    }
                }

                //this._qualityIndex = Math.min(Math.round(Math.random() * maxQuality), maxQuality);
                //this._qualityIndex = Math.min(4, maxQuality);
                this._qualityIndex = qualityIndex;
                this.canPlay = canPlay;
            }
        },

        _getTimeToDownloadAtQuality: function(qualityIndex, fragmentIndex) {
            var duration = 0;

            for (var i = fragmentIndex; i < this._streamMap.length; i++) {
                var mapEntry = this._streamMap[i];

                // TODO: state >= downloaded
                if (!mapEntry.activeRequest || mapEntry.activeRequest.state != Dashling.appended) {
                    duration += this._getEstimatedDuration(qualityIndex, fragmentIndex);
                }
            }

            return duration;
        },

        _getEstimatedDuration: function(qualityIndex, fragmentIndex) {
            var duration = 0;
            var quality = this._streamInfo.qualities[qualityIndex];
            var qualityLatencies = this._latenciesPerQuality[qualityIndex];

            if (qualityLatencies && qualityLatencies.length) {
                duration = _average(qualityLatencies);
            }
            else {
                var bandwidth = quality.bandwidth / 8;
                var totalBytes = bandwidth * this._streamInfo.timeline[fragmentIndex].lengthSeconds;
                var averageBandwidth = Dashling.Requests.getAverageBytesPerSecond() || 100000;

                duration = totalBytes / averageBandwidth;
            }

            return (duration + Dashling.Requests.getAverageLatency()) * 1.2;
        },

        _loadInitSegment: function(qualityIndex, onFragmentAvailable) {
            var maxQualityIndex = this._streamInfo.qualities.length - 1;

            if (qualityIndex != maxQualityIndex) {
                this._loadInitSegment(maxQualityIndex, onFragmentAvailable);
            }

            if (!this._initSegments[qualityIndex]) {
                var segmentEntry = this._initSegments[qualityIndex] = {
                    url: this._getInitUrl(qualityIndex),
                    state: Dashling.FragmentState.idle,
                    timeAtDownloadStarted: new Date().getTime(),
                    qualityIndex: qualityIndex,
                    qualityId: this._streamInfo.qualities[qualityIndex].id,
                    data: null,
                    errorCode: null
                };

                Dashling.Requests.load(segmentEntry, true, onFragmentAvailable, _onFailure);
            }

            function _onFailure(response) {

            }
        },

        _getInitUrl: function(qualityIndex) {
            var urlPart = this._streamInfo.initUrlFormat.replace("$RepresentationID$", this._streamInfo.qualities[qualityIndex].id);

            return this._manifest.baseUrl + urlPart;
        },

        _getUrl: function(segmentIndex, mapEntry) {
            var urlPart = this._streamInfo.fragUrlFormat.replace("$RepresentationID$", mapEntry.qualityId).replace("$Time$", mapEntry.time.start);

            return this._manifest.baseUrl + urlPart;
        }

    };

    mix(Dashling.Stream.prototype, EventingMixin);
