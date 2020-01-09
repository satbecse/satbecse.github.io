(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('@tensorflow/tfjs')) :
        typeof define === 'function' && define.amd ? define(['exports', '@tensorflow/tfjs'], factory) :
            (factory((global.speechCommands = {}), global.tf));
}(this, (function (exports, tf) {
    'use strict';


    function getAudioContextConstructor() {
        return window.AudioContext || window.webkitAudioContext;
    }

    /*function getAudioMediaStream(/*audioTrackConstraints) {
       navigator.mediaDevices.getUserMedia({
            audio: audioTrackConstraints == null ? true : audioTrackConstraints
        })
    }*/

    var Tracker = (function () {
        function Tracker(period, numFrames/*,suppressionPeriod*/) {             // Sathish : Added numFrames as a parameter 
            var _this = this;
            this.period = period;
            this.numFrames = numFrames; // 
            /*this.suppressionTime = suppressionPeriod == null ? 0 : suppressionPeriod;*/
            this.counter = 0;
            tf.util.assert(this.period > 0, function () { return "Expected period to be positive, but got " + _this.period; });
        }
        Tracker.prototype.tick = function () {
            this.counter++;
            var shouldFire = ((this.counter % this.period === 0) && (this.counter > this.numFrames));/*&&
                (this.suppressionOnset == null ||
                    this.counter - this.suppressionOnset > this.suppressionTime);*/

            if(shouldFire){
            //console.log('counter:',this.counter,' period:',this.period)
            //console.log('shouldFire:',shouldFire)    
            this.counter =this.numFrames+1;    
            }
            return shouldFire;
        };
        /*Tracker.prototype.suppress = function () {
            this.suppressionOnset = this.counter;
        };*/
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
            this.columnTruncateLength = config.columnTruncateLength || this.fftSize;    // 232    //Doubt         
            this.audioContextConstructor = getAudioContextConstructor();
            this.spectrogramCallback = callback;
            console.log('overlapFactor:', this.overlapFactor)
            console.log('numFrames    :', this.numFrames)
            console.log('sampleRateHz:', this.sampleRateHz)
            console.log('fftSize:', this.fftSize)
            console.log('columnTruncateLength:', this.columnTruncateLength)
        }

        FftFeatureExtractor.prototype.start = async function (config) {
           /* working code
            var streamSource, period;
            this.stream = null;
            this.audioContext = new this.audioContextConstructor();                   // Sathish 1. getting the audio context 
            
            this.analyser = this.audioContext.createAnalyser();
            console.log(this)

            //console.log(this.audioContext)
          
            try {
                this.stream = await navigator.mediaDevices.getUserMedia({ audio: true }) // Sathish 2. Accessing the mic 
            } catch (err) {
                console.log('Error:', err)
            }
            streamSource = this.audioContext.createMediaStreamSource(this.stream)      //Sathish 3. creating the MediaStreamSource
            this.analyser = this.audioContext.createAnalyser();                        //Sathish 4. creating an Analyser
            streamSource.connect(this.analyser)                                        //Sathish 5. Connecting the analyser with streamSource
          */


            var streamSource, period;
            this.audioContext = new this.audioContextConstructor();  
            var constraints = { "audio": true  };
            this.analyser.fftSize = 2048;                  //this.fftSize;
            console.log("Analyser fftsize",this.analyser.fftSize)
            this.scriptNode = this.audioContext.createScriptProcessor(this.analyser.fftSize, 1, 1);
            this.scriptNode.onaudioprocess = this.onAudioFrame();

            navigator.getUserMedia(constraints, successCallback, errorCallback);
 
             var _this = this;
             function successCallback(stream) {
                 _this.stream = stream;
                 _this.audioContext.resume().then(() => {
                     streamSource = _this.audioContext.createMediaStreamSource(stream);
                     streamSource.connect(_this.analyser);
                     this.analyser.connect(_this.scriptNode);
 
                     //This is needed for chrome
                     this.scriptNode.connect(_this.audioCtx.destination);
                 });
             }
             function errorCallback(error) {
                 console.error('navigator.getUserMedia1 error: ', error);
             }

            console.log("Analyser is:", this.analyser);
            this.analyser.fftSize = this.fftSize;  //* 2;
            this.freqDataQueue = [];
            this.freqData = new Float32Array(this.fftSize);                          // data = new Float32Array(analyser.frequencyBinCount); 
            //            console.log(this.analyser.frequencyBinCount)                               // 1024
            //this.freqData=new Float32Array(this.analyser.frequencyBinCount)            

            this.spectrogramCounter = 0;
            //            console.log('Seconds:' ,this.fftSize / this.sampleRateHz * 1e3)           // 43.46  
            period = Math.max(1, Math.round(this.numFrames * (1 - this.overlapFactor)));
            this.tracker = new Tracker(period, this.numFrames)
            this.frameIntervalTask = setInterval(this.onAudioFrame.bind(this), this.fftSize / this.sampleRateHz * 1e3);
        }

        FftFeatureExtractor.prototype.stop = function () {
            clearInterval(this.frameIntervalTask)
            this.analyser.disconnect();
            this.audioContext.close();
            if (this.stream != null && this.stream.getTracks().length > 0) {
                this.stream.getTracks()[0].stop();
            }
            this.spectrogramCounter = 0;
        }

        FftFeatureExtractor.prototype.onAudioFrame = function () {
            var flatQueue, spectrogramData, shouldFire;
            // this.spectrogramData = null;
            this.analyser.getFloatFrequencyData(this.freqData)
            if (this.freqData[0] === -Infinity || 0) {
                return;
            }

            this.freqDataQueue.push(this.freqData.slice(0, this.columnTruncateLength));    //columnTruncateLength is 232


            /* this.audioContext.onstatechange = function () {     //Sathish :debugging 
                 console.log('Audio Context state :', this.audioContext.state);
             }  */

            if (this.freqDataQueue.length > this.numFrames) {          //this.numFrames : 43
                /* console.log('freqDataQueue:',this.freqDataQueue)
                 console.log('length b4',this.freqDataQueue.length)*/
                this.freqDataQueue.shift();
                /* console.log('freqDataQueue:',this.freqDataQueue)
                 console.log('length after',this.freqDataQueue.length)*/

            }
            shouldFire = this.tracker.tick();

            if (shouldFire) {
                flatQueue = flattenQueue(this.freqDataQueue)
                spectrogramData = normalize(flatQueue)
                //console.log('Time:',getTime()) ///* new Date(),*/new Date().getMilliseconds())
                //                    console.log('normalizedData or spectrogramData :', this.spectrogramCounter++, /*this.*/spectrogramData)
                //console.log('freqQueue:', freqQueue)   
                this.spectrogramCallback(spectrogramData)
            }

            /*
             console.log('CTL:',this.columnTruncateLength);
            if (this.freqDataQueue.length > this.numFrames - 1) {       // It has to be 55
                flatQueue = flattenQueue(this.freqDataQueue)
                spectrogramData = normalize(flatQueue)
                // this.spectrogramData = normalize(flatQueue)
                console.log('normalizedData or spectrogramData :', this.spectrogramCounter++, this.spectrogramData)
                //console.log('freqQueue:', freqQueue)   
                this.spectrogramCallback(spectrogramData)                  // Callback with Spectrogram Data               
                // const deleteCount = Math.floor(this.freqDataQueue.length   * (1 - this.overlapFactor));    // 0.25 is a overlapfactor   
                const deleteCount = Math.floor(this.numFrames * (1 - this.overlapFactor));    // 0.25 is a overlapfactor   
                this.freqDataQueue.splice(0, deleteCount)
            } */
        }
        return FftFeatureExtractor;
    }());

    var SpectrogramGenerator = (function () {
        function SpectrogramGenerator(/*sampleRate,fftSize*/) {
            this.streaming = false;
        }
        SpectrogramGenerator.prototype.listen = function (callback, config) {
            //var overlapFactor;
            if (this.streaming) {
                throw new Error('Cannot start streaming again when streaming is ongoing.');
            }
            if (config == null) {
                config = {};
            }
            this.audioDataExtractor = new FftFeatureExtractor(callback, config)
            this.audioDataExtractor.start(config)
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
            //console.log('I am here from isLiestening()')
            return this.streaming;
        };
        return SpectrogramGenerator;
    }());

    // Sathish : Creating a SpectrogramGenerator
    function create() {
        return new SpectrogramGenerator(/*sampleRate,fftSize*/);
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
        //  x.innerHTML = 
        //  console.log(h + ":" + m + ":" + s + ":" + ms);
    }


    function normalize(x) {
        const mean = -100;
        const std = 10;
        return x.map(x => (x - mean) / std);
    }

    function flattenQueue(queue) {
        var frameSize = queue[0].length;        //queue[0].length=232
        var freqData = new Float32Array(queue.length * frameSize);  //56*232queue.length=56 queue[0].length=232
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
