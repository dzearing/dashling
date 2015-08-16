define(["require", "exports"], function (require, exports) {
    /** An instance of EventGroup allows anything with a handle to it to trigger events on it.
     *  If the target is an HTMLElement, the event will be attached to the element and can be
     *  triggered as usual (like clicking for onclick).
     *  The event can be triggered by calling EventGroup.raise() here. If the target is an
     *  HTMLElement, the event gets raised and is handled by the browser. Otherwise, it gets
     *  handled here in EventGroup, and the handler is called in the context of the parent
     *  (which is passed in in the constructor).
     */
    var EventGroup = (function () {
        /** parent: the context in which events attached to non-HTMLElements are called */
        function EventGroup(parent) {
            this._id = EventGroup._uniqueId++;
            this._parent = parent;
            this._eventRecords = [];
        }
        /** For IE8, bubbleEvent is ignored here and must be dealt with by the handler.
         *  Events raised here by default have bubbling set to false and cancelable set to true.
         *  This applies also to built-in events being raised manually here on HTMLElements,
         *  which may lead to unexpected behavior if it differs from the defaults.
         */
        EventGroup.raise = function (target, eventName, eventArgs, bubbleEvent) {
            var retVal;
            if (EventGroup._isElement(target)) {
                if (document.createEvent) {
                    var ev = document.createEvent('HTMLEvents');
                    ev.initEvent(eventName, bubbleEvent, true);
                    ev['args'] = eventArgs;
                    retVal = target.dispatchEvent(ev);
                }
                else if (document['createEventObject']) {
                    var evObj = document['createEventObject'](eventArgs);
                    // cannot set cancelBubble on evObj, fireEvent will overwrite it
                    target.fireEvent("on" + eventName, evObj);
                }
            }
            else {
                while (target && retVal !== false) {
                    var eventRecords = target.__events__ ? target.__events__[eventName] : null;
                    for (var id in eventRecords) {
                        var eventRecordList = eventRecords[id];
                        for (var listIndex = 0; retVal !== false && listIndex < eventRecordList.length; listIndex++) {
                            var record = eventRecordList[listIndex];
                            // Call the callback in the context of the parent, using the supplied eventArgs.
                            retVal = record.callback.call(record.parent, eventArgs);
                        }
                    }
                    // If the target has a parent, bubble the event up.
                    target = bubbleEvent ? target.parent : null;
                }
            }
            return retVal;
        };
        EventGroup.isObserved = function (target, eventName) {
            return !!(target && target.__events__ && target.__events__[eventName]);
        };
        /** Check to see if the target has declared support of the given event. */
        EventGroup.isDeclared = function (target, eventName) {
            return !!(target && target.__declaredEvents && target.__declaredEvents[eventName]);
        };
        EventGroup.stopPropagation = function (event) {
            if (event.stopPropagation) {
                event.stopPropagation();
            }
            else {
                event.cancelBubble = true;
            }
        };
        EventGroup._isElement = function (target) {
            return !!target && (target instanceof HTMLElement || (target.dispatchEvent && target.addEventListener));
        };
        EventGroup.prototype.dispose = function () {
            this.off();
            this._parent = null;
        };
        /** On the target, attach a set of events, where the events object is a name to function mapping. */
        EventGroup.prototype.onAll = function (target, events, useCapture) {
            for (var eventName in events) {
                this.on(target, eventName, events[eventName], useCapture);
            }
        };
        /** On the target, attach an event whose handler will be called in the context of the parent
         * of this instance of EventGroup.
         */
        EventGroup.prototype.on = function (target, eventName, callback, useCapture) {
            if (eventName.indexOf(',') > -1) {
                var events = eventName.split(/[ ,]+/);
                for (var i = 0; i < events.length; i++) {
                    this.on(target, events[i], callback, useCapture);
                }
            }
            else {
                var parent = this._parent;
                var eventRecord = {
                    target: target,
                    eventName: eventName,
                    parent: parent,
                    callback: callback,
                    elementCallback: null,
                    useCapture: useCapture
                };
                // Initialize and wire up the record on the target, so that it can call the callback if the event fires.
                target.__events__ = target.__events__ || {};
                target.__events__[eventName] = target.__events__[eventName] || {
                    count: 0
                };
                target.__events__[eventName][this._id] = target.__events__[eventName][this._id] || [];
                target.__events__[eventName][this._id].push(eventRecord);
                target.__events__[eventName].count++;
                function _processElementEvent() {
                    try {
                        var result = callback.apply(parent, arguments);
                        if (result === false && arguments[0] && arguments[0].preventDefault) {
                            var e = arguments[0];
                            e.preventDefault();
                            e.cancelBubble = true;
                        }
                    }
                    catch (e) {
                    }
                    return result;
                }
                if (EventGroup._isElement(target)) {
                    eventRecord.elementCallback = _processElementEvent;
                    if (target.addEventListener) {
                        /* tslint:disable:ban-native-functions */
                        target.addEventListener(eventName, _processElementEvent, useCapture);
                    }
                    else if (target.attachEvent) {
                        target.attachEvent("on" + eventName, _processElementEvent);
                    }
                }
                // Remember the record locally, so that it can be removed.
                this._eventRecords.push(eventRecord);
            }
        };
        EventGroup.prototype.off = function (target, eventName, callback, useCapture) {
            for (var i = 0; i < this._eventRecords.length; i++) {
                var eventRecord = this._eventRecords[i];
                if ((!target || target === eventRecord.target) &&
                    (!eventName || eventName === eventRecord.eventName) &&
                    (!callback || callback === eventRecord.callback) &&
                    ((typeof useCapture !== 'boolean') || useCapture === eventRecord.useCapture)) {
                    var targetArrayLookup = eventRecord.target.__events__[eventRecord.eventName];
                    var targetArray = targetArrayLookup ? targetArrayLookup[this._id] : null;
                    // We may have already target's entries, so check for null.
                    if (targetArray) {
                        if (targetArray.length === 1 || !callback) {
                            targetArrayLookup.count -= targetArray.length;
                            delete eventRecord.target.__events__[eventRecord.eventName][this._id];
                        }
                        else {
                            targetArrayLookup.count--;
                            targetArray.splice(targetArray.indexOf(eventRecord), 1);
                        }
                        if (!targetArrayLookup.count) {
                            delete eventRecord.target.__events__[eventRecord.eventName];
                        }
                    }
                    if (eventRecord.elementCallback) {
                        if (eventRecord.target.removeEventListener) {
                            eventRecord.target.removeEventListener(eventRecord.eventName, eventRecord.elementCallback, eventRecord.useCapture);
                        }
                        else if (eventRecord.target.detachEvent) {
                            eventRecord.target.detachEvent("on" + eventRecord.eventName, eventRecord.elementCallback);
                        }
                    }
                    this._eventRecords.splice(i--, 1);
                }
            }
        };
        /** Trigger the given event in the context of this instance of EventGroup. */
        EventGroup.prototype.raise = function (eventName, eventArgs, bubbleEvent) {
            return EventGroup.raise(this._parent, eventName, eventArgs, bubbleEvent);
        };
        /** Declare an event as being supported by this instance of EventGroup. */
        EventGroup.prototype.declare = function (event) {
            var declaredEvents = this._parent.__declaredEvents = this._parent.__declaredEvents || {};
            if (typeof event === 'string') {
                declaredEvents[event] = true;
            }
            else {
                for (var i = 0; i < event.length; i++) {
                    declaredEvents[event[i]] = true;
                }
            }
        };
        EventGroup._uniqueId = 0;
        return EventGroup;
    })();
    exports.default = EventGroup;
});
