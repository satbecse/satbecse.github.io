(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tensorflow/tfjs')) :
        typeof define === 'function' && define.amd ? define(['exports', '@tensorflow/tfjs'], factory) :
            (factory((global.speechCommands = {}), global.tf));
}(this, (function (exports, tf) {
    'use strict';

    function getAudioContextConstructor() {
        return window.AudioContext || window.webkitAudioContext;
    }

    var Tracker = (function () {
        function Tracker(period, numFrames/*,suppressionPeriod*/) {             // Sathish : Added numFrames as a parameter 
            this.period = period;
            this.numFrames = numFrames;
            this.counter = 0;
            tf.util.assert(this.period > 0, function () { return "Expected period to be positive, but got " + this.period; });
        }
        Tracker.prototype.tick = function () {
            this.counter++;
            var shouldFire = ((this.counter % this.period === 0) && (this.counter > this.numFrames));
            if (shouldFire) {
                //console.log('Counter:',this.counter,this.period)
                this.counter = this.numFrames + 1;
            }
            return shouldFire;
        };
        return Tracker;
    }());

    var FftFeatureExtractor = (function () {
        function FftFeatureExtractor(callback, config) {
            if (config == null) {
                throw new Error("Configuration is missing for FftFeatureExtractor Constructor");
            }
            if (!(config.overlapFactor >= 0 && config.overlapFactor < 1)) {
                throw new Error("Invalid value in overlapFactor: " +
                    ("" + config.overlapFactor));
            }
            if (!(config.numFramesPerSpectrogram > 0)) {
                throw new Error("Invalid value in numFramesPerSpectrogram: " +
                    ("" + config.numFramesPerSpectrogram));
            }
            this.overlapFactor = config.overlapFactor;
            this.numFrames = config.numFramesPerSpectrogram;
            this.sampleRateHz = config.sampleRateHz || 44100;
            this.fftSize = config.fftSize || 1024;              // It has to be a power of 2
            // this.frameDurationMillis = this.fftSize / this.sampleRateHz * 1e3;
            this.columnTruncateLength = config.columnTruncateLength || this.fftSize;
            this.frameInterval = config.frameInterval;
            console.log('---------FftFeatureExtractor Settings------------')
            console.log('overlapFactor          :', this.overlapFactor)
            console.log('numFrames              :', this.numFrames)
            console.log('sampleRateHz           :', this.sampleRateHz)
            console.log('fftSize                :', this.fftSize)
            console.log('columnTruncateLength   :', this.columnTruncateLength)
            console.log('frameInterval          :', this.frameInterval)
            console.log('-------------------------------------------------')

            this.audioContextConstructor = getAudioContextConstructor();
            this.spectrogramCallback = callback;

            // getUserMedia Constraints 
            this.constraints = { "audio": true };


            //Get an audio context 
            this.audioContext = new this.audioContextConstructor();

            // Create an analyser
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            // console.log("Analyser fftsize", this.analyser.fftSize)

            // Create the scriptProcessorNode
            this.scriptProcessorNode = this.audioContext.createScriptProcessor(1024, 1, 1);  
            this.scriptProcessorNode.onaudioprocess = this.onAudioFrame();

        }
        /* Function : Start 
                                                    Fig : Audio Graph
                   _________________________________________________________________________________________________      
                   |                                     Audio Context                                              |
                   |    ________________________________________________________________________________________    |
                   |   |   --------           ----------           --------------------           -----------   |   |      
                   |   |  | source | ------> | analyser | ------> |scriptProcessorNode | ------> |Destination|  |   |      
                   |   |   --------           ----------           --------------------           -----------   |   |      
                   |   |________________________________________________________________________________________|   |          
                   |                                                                                                |
                   |_______________________________________________________________________________________________ |
                   
       */


        FftFeatureExtractor.prototype.start = async function () {
            var source, period;
            navigator.getUserMedia(this.constraints, successCallback, errorCallback);                // Accessing the Mic to stream the live Audio
            var _this = this;
            function successCallback(stream) {                                                       // Suceess : User Gave Permission to Access Mic  
                _this.stream = stream
                _this.audioContext.resume().then(() => {
                    source = _this.audioContext.createMediaStreamSource(stream);
                    source.connect(_this.analyser);
                    _this.analyser.connect(_this.scriptProcessorNode);
                    //This is needed for chrome
                    _this.scriptProcessorNode.connect(_this.audioContext.destination);

                    _this.freqDataQueue = [];
                    _this.freqData = new Float32Array(_this.fftSize);
                    period = Math.max(1, Math.round(_this.numFrames * (1 - _this.overlapFactor)));                   // period  = max(1,round(56*0.25)) = 14
                    _this.tracker = new Tracker(period, _this.numFrames)
                    _this.frameIntervalTask = setInterval(_this.onAudioFrame.bind(_this), _this.frameInterval);      // frameInterval = 1024/44100*1000 =23.2199
                });
            }

            function errorCallback(error) {
                _this.stop();
                console.error('navigator.getUserMedia error: ', error);
            }
        }

        FftFeatureExtractor.prototype.stop = function () {
            // clearInterval(this.dummyIntervalTask)
            clearInterval(this.frameIntervalTask)
            this.analyser.disconnect();
            this.scriptProcessorNode.disconnect();
            this.audioContext.close();
            if (this.stream != null && this.stream.getTracks().length > 0) {
                this.stream.getTracks()[0].stop();
            }
        }

        /*                  Function : onAudioFrame 
        
                                    Freq Data Queue  [56*232]
                 Freq                                                                     
                   ^                                                                   
                   |
                   |
                   |   
               232 |__________________________________________________________     
                   |F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F|F| 
                   |R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|R|
                   |A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|A|
                   |M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|M|
                   |E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|E|  
                   |1|2|3|4|5|6|7|8|9|.|.|.| | | | | | | | | | | | | |.|.|.|56| 
                0   ----------------------------------------------------------->   Time
                    
                                                                              1300(ms) 
            Note : 
            Totally we have 1300ms. 
            Each Frame is 23.219 seconds (i.e FrameInterval=  1024/44100*1000)
            Totally there are 56 frames (i.e1300/23.219).
                                                                              
        */

        FftFeatureExtractor.prototype.onAudioFrame = function () {                         // Gets called every 23.219(frameInterval) milliseconds. i.e for each frame

            //console.log('onAudioFrame:', getTime())
            var flatQueue, spectrogramData, shouldFire;
            var _this = this;
            return function (audioProcessingEvent) {
                _this.analyser.getFloatFrequencyData(_this.freqData)
                if (_this.freqData[0] === -Infinity || 0) {
                    return;
                }
                _this.freqDataQueue.push(_this.freqData.slice(0, _this.columnTruncateLength));    //columnTruncateLength is 232
                if (_this.freqDataQueue.length > _this.numFrames) {
                    _this.freqDataQueue.shift();
                }
                shouldFire = _this.tracker.tick();
                if (shouldFire) {
                    flatQueue = flattenQueue(_this.freqDataQueue)
                    spectrogramData = normalize(flatQueue)
                    _this.spectrogramCallback(spectrogramData)
                }
            }
        }
        return FftFeatureExtractor;
    }());

    var SpectrogramGenerator = (function () {
        function SpectrogramGenerator() {
            this.streaming = false;
        }
        SpectrogramGenerator.prototype.listen = function (callback, config) {
            if (this.streaming) {
                throw new Error('Cannot start streaming again when streaming is ongoing.');
            }
            if (config == null) {
                config = {};
            }
            this.audioDataExtractor = new FftFeatureExtractor(callback, config)
            this.audioDataExtractor.start()
            this.streaming = true;
        }

        SpectrogramGenerator.prototype.stopListening = function () {
            if (!this.streaming) {
                throw new Error('Cannot stop streaming when streaming is not ongoing.');
            }
            this.audioDataExtractor.stop()
            this.streaming = false;
        }

        SpectrogramGenerator.prototype.isListening = function () {
            return this.streaming;
        };
        return SpectrogramGenerator;
    }());

    // Sathish : Creating a SpectrogramGenerator
    function create() {
        return new SpectrogramGenerator();
    }

    // Sathish : Helper functions 
    function addZero(x, n) {
        while (x.toString().length < n) {
            x = "0" + x;
        }
        return x;
    }

    function getTime() {
        var d = new Date();
        var h = addZero(d.getHours(), 2);
        var m = addZero(d.getMinutes(), 2);
        var s = addZero(d.getSeconds(), 2);
        var ms = addZero(d.getMilliseconds(), 3);
        return h + ":" + m + ":" + s + ":" + ms;
    }

    function normalize(x) {
        const mean = -100;
        const std = 10;
        return x.map(x => (x - mean) / std);
    }

    function flattenQueue(queue) {
        var frameSize = queue[0].length;        //queue[0].length=232
        var freqData = new Float32Array(queue.length * frameSize);  //56*232
        queue.forEach(function (data, i) { return freqData.set(data, i * frameSize); });
        return freqData;
    }

    exports.create = create;

})));

/* Note :

Here,
 SpectrogramGenerator = BrowserFftSpeechCommandRecognizer
 FftFeatureExtractor  = BrowserFftFeatureExtractor
 */
