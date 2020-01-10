let specGenerator;
let model; 
let threshold = 0.99;
let count = 0;
var chartData = [];
var xVal = 0;

async function app() {
  specGenerator = speechCommands.create();
  let modelName = "atlas_model_v7_2";
  console.log("model used:", modelName);
  model = await tf.loadLayersModel('http://127.0.0.1:8080/models/'+ modelName +'/model.json');
  document.getElementById('model_version').innerHTML = "Model used: " + modelName;
  updateChart(0);
}

app().then((result)=>{
  document.getElementById('listen').disabled = false;
  document.getElementById('predictions').style.display = 'flex';
});

async function highlight(confidence) {
  updateChart(confidence);
  pred_divs = document.getElementsByClassName('prediction');
  for(let i=0;i<pred_divs.length;i++){
    pred_divs[i].classList.remove('green_background');
  }
  if((confidence >threshold)){
    document.getElementById('ok_atlas').innerHTML = 'ok_Atlas<br>' + confidence.toFixed(5);
    document.getElementById('ok_atlas').classList.add('green_background');
    console.log("OK ATLAS DETECTED!")
   // document.getElementById('yes').play();
  }
  else {
    let val = 1.000 - confidence.toFixed(5);
    document.getElementById('other').innerHTML = 'other<br>' + val;
    document.getElementById('other').classList.add('red_background');
  }
}

function setThreshold(){
  let value = document.getElementById("threshold").value;
  console.log("update threshold: ",value);
  threshold = value;
}

const NUM_FRAMES = numFramesPerSpectrogramValue;
const INPUT_SHAPE = [NUM_FRAMES, 232, 1];

function download(content, fileName, contentType) {
    content =  JSON.stringify(content)
    var a = document.createElement("a");
    var file = new Blob([content], {type: contentType});
    a.href = URL.createObjectURL(file);
    a.download = fileName;
    a.click();
}

let prob;
let timer;

async function listen(){
  if (specGenerator.isListening()) {
    specGenerator.stopListening();
   document.getElementById('listen').textContent = 'Listen for "OK ATLAS"';
   return;
  }
  document.getElementById('listen').textContent = 'Stop';
  specGenerator.listen(async(vals) => {
  // const vals = normalize(data.subarray(-frameSize * NUM_FRAMES)); // (232 * 43)
   const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
   const probs = model.predict(input);
   const confidence = await probs.data();
   console.log("confidence:", confidence[0].toFixed(4));
    await highlight(confidence[0]);
  //  updateChart(confidence[0]);


   // download(vals, "new_wraper_spec!.json", "text/plain");
  // // save false positives
  //  if (confidence[0] >= threshold){
  //   // console.log("False positive", confidence[0]);
  //   download(vals, "test_sample(SC).json", 'text/plain');
  // }

   tf.dispose([input, probs]);
  }, {
    fftSize : fftSizeValue,
    sampleRateHz : sampleRateHzValue,
    overlapFactor: overlapFactorThreshold,
    numFramesPerSpectrogram: numFramesPerSpectrogramValue, 
    columnTruncateLength:columnTruncateLengthValue
  });
}

// app();

function flatten(tensors) {
 const size = tensors[0].length;
 const result = new Float32Array(tensors.length * size);
 tensors.forEach((arr, i) => result.set(arr, i * size));
 return result;
}

function normalize(x) {
 const mean = -100;
 const std = 10;
 return x.map(x => (x - mean) / std);
}

var updateChart = function(value) {
  chartData.push({
    x: xVal,
    y: value
  })
  xVal ++;

  if (chartData.length > 20) {
    chartData.shift();
  }

  chart.render();

}