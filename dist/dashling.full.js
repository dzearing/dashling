(function() {

	function mix(dest, source) {
		for (var i in source) {
			if (source.hasOwnProperty(i)) {
				dest[i] = source[i];
			}
		}
	}

    function bind(obj, func) { return function() { return func.apply(obj, arguments); }; }

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

	window.Dashling = function() {
        this._tryAppendFragments = bind(this, this._tryAppendFragments);

        this.settings = {
            targetAudioQuality: 0,
            targetVideoQuality: 0,
            isABREnabled: true
        };
    };

	Dashling.prototype = {
		_videoElement: null,
		_mediaSource: null,
		_audioStream: null,
		_videoStream: null,
		_fragmentIndex: 0,

		load: function (videoElement, url) {
			this._videoElement = videoElement;		
			this._initializeMediaSource(videoElement);
			this._loadManifest(url);
		},

		_initializeMediaSource: function(videoElement) {
			var _this = this;
	        var ms = new MediaSource();
			
			ms.addEventListener("sourceopen", _onOpened, false);	        
	        videoElement.addEventListener("error", _onError, false);
	        videoElement.autoplay = false;

	        videoElement.src = window.URL.createObjectURL(ms);

	        function _onOpened() {
	        	_this._mediaSource = ms;
	        	_this._tryStart();	        	
	        }

	        function _onError() {
	        	// TODO
	        	alert("error initializing media source");
	        }
		},

		_loadManifest: function(url) {
            var _this = this;
            var request = { url: url };

            Dashling.Requests.load(request, false, _onSuccess, _onError);
			
            function _onSuccess(responseText) {
                _this._manifest = _this._parseManifest(request.data);
                _this._tryStart();
            }

            function _onError() {
                // TODO
            }
		},

        _parseManifest: function (manifestText) {
            var manifest = {};
            var parser = new DOMParser();
            var xmlDoc = parser.parseFromString(manifestText,"text/xml");
            var i;

            manifest.baseUrl = _getXmlNodeValue(xmlDoc, "BaseURL", "");
            manifest.mediaDuration = _fromISOToSeconds(xmlDoc.documentElement.getAttribute("mediaPresentationDuration"));
            manifest.streams = {};

            var adaptations = [
                xmlDoc.querySelector("AdaptationSet[contentType='audio']"),
                xmlDoc.querySelector("AdaptationSet[contentType='video']")
            ];

            for (var adaptIndex = 0 ; adaptIndex < adaptations.length; adaptIndex++) {
                var adaptationElement = adaptations[adaptIndex];

                if (adaptationElement) {
                    var contentType = adaptationElement.getAttribute("contentType");
                    var representationElements = adaptationElement.querySelectorAll("Representation");
                    var segmentTemplateElement = adaptationElement.querySelector("SegmentTemplate");
                    var timelineElements = adaptationElement.querySelectorAll("S");
                    var stream = manifest.streams[contentType] = {
                        streamType: contentType,
                        mimeType: adaptationElement.getAttribute("mimeType"),
                        codecs: adaptationElement.getAttribute("codecs"),
                        initUrlFormat: segmentTemplateElement.getAttribute("initialization"),
                        fragUrlFormat: segmentTemplateElement.getAttribute("media"),
                        qualities: [],
                        timeline: []
                    };

                    var timeScale = segmentTemplateElement.getAttribute("timescale");


                    for (var repIndex = 0; repIndex < representationElements.length; repIndex++) {
                        var repElement = representationElements[repIndex];
                        var quality = {
                            id: repElement.getAttribute("id"),
                            bandwidth: repElement.getAttribute("bandwidth"),
                        };

                        if (repElement.getAttribute("height")) {
                            quality.width = Number(repElement.getAttribute("width"));
                            quality.height = Number(repElement.getAttribute("height"));
                        }

                        stream.qualities.push(quality);
                    }

                    var startTime = 0;

                    for (var timelineIndex = 0; timelineIndex < timelineElements.length; timelineIndex++) {
                        var timelineElement = timelineElements[timelineIndex];                        
                        var repeatCount = Number(timelineElement.getAttribute("r")) || 0;
                        var duration = Number(timelineElement.getAttribute("d"));

                        for (i = 0; i <= repeatCount; i++) {
                            stream.timeline.push({
                                start: startTime,
                                startSeconds: startTime / timeScale,
                                length: duration,
                                lengthSeconds: duration / timeScale });

                            startTime += duration;
                        }                        
                    }
                }
            }
            
            return manifest;
        },

		_tryStart: function() {
			var manifest = this._manifest;
			var mediaSource = this._mediaSource;

			if (manifest && mediaSource && !this._audioStream && !this._videoStream) {
				
				mediaSource.duration = manifest.mediaDuration;

				this._audioStream = new Dashling.Stream(mediaSource, manifest, "audio", this.settings);
				this._videoStream = new Dashling.Stream(mediaSource, manifest, "video", this.settings);

				this._loadNextFragment();
			}			
		},

		_loadNextFragment: function() {
			this._audioStream.loadFragment(this._fragmentIndex, this._tryAppendFragments);
			this._videoStream.loadFragment(this._fragmentIndex, this._tryAppendFragments);				
		},

        _assessQuality: function() {
            var timeRemainingToPlay = this._manifest.mediaDuration - this._videoElement.currentTime;

            this._audioStream.assessQuality(timeRemainingToPlay, this._fragmentIndex);
            this._videoStream.assessQuality(timeRemainingToPlay, this._fragmentIndex);
        },

		_tryAppendFragments: function() {			
            var audioState = this._audioStream.getState(this._fragmentIndex);
            var videoState = this._videoStream.getState(this._fragmentIndex);

			if (audioState == Dashling.FragmentState.downloaded && videoState == Dashling.FragmentState.downloaded) {
				this._audioStream.append(this._fragmentIndex, this._tryAppendFragments);
				this._videoStream.append(this._fragmentIndex, this._tryAppendFragments);			
			}
            else if (audioState == Dashling.FragmentState.appended && videoState == Dashling.FragmentState.appended) {
				this._fragmentIndex++;
                this._assessQuality();
                if (this._audioStream.canPlay && this._videoStream.canPlay) {
                	this._videoElement.play();
                }
				this._loadNextFragment();
			}
		},

		_tryStartPlaying: function() {

		},

		reset: function() {
			this.manifestLoader.cancelAll();
			this.fragmentLoader.cancelAll();		
		}
	};

    Dashling.FragmentState = {
        error: "error",
        idle: "idle",
        waiting: "waiting",
        downloading: "downloading",
        downloaded: "downloaded",
        appending: "appending",
        appended: "appended"
    };

    Dashling.FragmentStateIndex = {
        error: -1,
        idle: 0,
        waiting: 1,
        downloading: 2,
        downloaded: 3,
        appending: 4,
        appended: 5
};

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

			function _appendNextEntry()	{
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

	Dashling.Requests = {
        
        _latencies: [],
        _bandwidths: [],

        getAverageLatency: function() {
            return _average(this._latencies) / 1000;
        },

        getAverageBytesPerSecond: function() {
            return _average(this._bandwidths);
        },

		load: function(request, isArrayBuffer, onSuccess, onFailure) {
			var _this = this;
			var maxRetries = 5;		
			var retryIndex = -1;
			var delayBetweenRetries = [ 200, 1500, 3000 ];

            request.retryCount = 0;
            _startRequest();

			function _startRequest() {
				var xhr = new XMLHttpRequest();

				xhr.open("GET", request.url, true);
				isArrayBuffer && (xhr.responseType = "arraybuffer");
				
                xhr.onreadystatechange = function() {
                    if (xhr.readyState > 0 && request.timeAtFirstByte < 0) {
                        request.timeAtFirstByte = new Date().getTime()
                    }
                };

				xhr.onprogress = function() {
                    (request.timeAtFirstByte < 0) && (request.timeAtFirstByte = new Date().getTime());                    
				};

				xhr.onload = function() {				

					if (xhr.status >= 200 && xhr.status <= 299) {
                        request.timeAtLastByte = new Date().getTime();                        
                        request.bytesDownloaded = isArrayBuffer ? xhr.response.byteLength : xhr.responseText.length;
    
                        if (request.timeAtFirstByte < 0) {
                            // There was only one response returned.
                            request.timeAtFirstByte = new Date().getTime();
                        }

                        request.latency = request.timeAtFirstByte - request.timeAtDownloadStarted;
                        request.bandwidth = (1000 * request.bytesDownloaded)  / (request.timeAtLastByte - request.timeAtDownloadStarted);


                        if (request.bytesDownloaded > 50000) {
                            _this._latencies.push(request.latency);
                            _this._bandwidths.push(request.bandwidth);                            
                        }

                        request.data = isArrayBuffer ? new Uint8Array(xhr.response) : xhr.responseText;
                        request.state = Dashling.FragmentState.downloaded;
						onSuccess();
					}
                    else { 
                        _onError();
                    }
				};

				function _onError() {
					if (++retryIndex < maxRetries) {
                        request.timeAtFirstByte = -1;
                        request.timeAtLastByte = -1;
                        request.timeAtDownloadStarted = -1;
                        request.retryCount++;
						setTimeout(_startRequest, delayBetweenRetries[Math.min(delayBetweenRetries.length - 1, retryIndex)]);
					}
					else {
                        request.state = Dashling.FragmentState.error;                        
                        request.errorCode = xhr.status;
						onFailure(request);
					}
				};

                request.state = Dashling.FragmentState.downloading;
                request.timeAtDownloadStarted = new Date().getTime();
				xhr.send();
			}
		}
	};

    function _average(numbers) {
        var total = 0;

        for (var i = 0; numbers && i < numbers.length; i++) {
            total += numbers[i];
        }

        return total / (numbers.length || 1);
    }

    function _getXmlNodeValue(xmlDoc, elementName, defaultValue) {
        var element = xmlDoc.getElementsByTagName(elementName)[0];
        var elementText = element ? element.childNodes[0] : null;

        return elementText ? elementText.nodeValue : defaultValue;
    }

    function _fromISOToSeconds(isoString) {
        // "PT0H0M29.367S";
        var seconds = 0;
        var tempString = isoString.substring("2"); // Remove PT
        var tempIndex = tempString.indexOf("H");

        if (tempIndex > -1) {
            seconds += Number(tempString.substring(0, tempIndex)) * 60 * 60;
            tempString = tempString.substring(tempIndex + 1);
        }

        tempIndex = tempString.indexOf("M");
        if (tempIndex > -1) {
            seconds += Number(tempString.substring(0, tempIndex)) * 60;            
            tempString = tempString.substring(tempIndex + 1);
        }

        tempIndex = tempString.indexOf("S");
        if (tempIndex > -1) {
            seconds += Number(tempString.substring(0, tempIndex));
        }

        return seconds;
    }
})();
