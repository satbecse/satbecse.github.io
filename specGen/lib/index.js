let specGenerator;
let model;

async function app() {
  specGenerator = speechCommands.create();
  //console.log(specGenerator)
  model = await tf.loadLayersModel(inputUrl+'/model.json');     // Reading from Properties file
}

app().then((result) => {
  document.getElementById('listen').disabled = false;
  document.getElementById('predictions').style.display = 'flex';
});

async function highlight(label, confidence) {
  pred_divs = document.getElementsByClassName('prediction');
  for (let i = 0; i < pred_divs.length; i++) {
    pred_divs[i].classList.remove('green_background');
  }
  if ((label == 'ok_atlas') && (confidence > confidenceThreshold)) {
    document.getElementById('ok_atlas').classList.add('green_background');
    //document.getElementById('yes').play();
  }
  else {
    document.getElementById('other').classList.add('green_background');
  }
}

const NUM_FRAMES = numFramesPerSpectrogramValue;
const INPUT_SHAPE = [NUM_FRAMES, columnTruncateLengthValue, 1];
/*const words = {
  0: '_background_noise',
  1: 'negative',
  2: 'ok_atlas',
};*/
const words = { 0:'ok_atlas', }     // Sathish : Changed words as per the latest model

async function listen() {
  if (specGenerator.isListening()) {
    specGenerator.stopListening();
    document.getElementById('listen').textContent = 'Listen for "OK ATLAS"';
    return;
  }
  document.getElementById('listen').textContent = 'Stop';
  //specGenerator.listen(async ({ spectrogram: { frameSize, data } }) => {
    specGenerator.listen (async (vals) => { 
   //const vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
   //console.log(vals)
    const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
    const probs = model.predict(input);
    const predLabel = probs.argMax(1);
    const label = (await predLabel.data())[0];
    const confidence = probs.max(1);
    const conf = (await confidence.data())[0];
    console.log(label + "," + words[label] + "," + conf);
    await highlight(words[label], conf);
    tf.dispose([input, probs, predLabel]);
  }, {
    //Sathish : Reading from properties.js file 
    fftSize : fftSizeValue,
    sampleRateHz : sampleRateHzValue,
    overlapFactor: overlapFactorThreshold,
    numFramesPerSpectrogram: numFramesPerSpectrogramValue, 
    columnTruncateLength:columnTruncateLengthValue
  });
}
//app();

/*function normalize(x) {
  const mean = -100;
  const std = 10;
  return x.map(x => (x - mean) / std);
}*/
