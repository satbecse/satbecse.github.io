let recognizer,baseRecognizer;
let model;

async function app() {
 baseRecognizer = speechCommands.create('BROWSER_FFT');
 await baseRecognizer.ensureModelLoaded();
 //model = await tf.loadLayersModel('http://127.0.0.1:8080/model.json');
 model = await tf.loadLayersModel('https://satbecse.github.io/model.json');
}
let counter=0;

app().then((result)=>{
  document.getElementById('listen').disabled = false;
  document.getElementById('predictions').style.display = 'flex';
});

async function highlight(label,confidence) {
  pred_divs = document.getElementsByClassName('prediction');
  for(let i=0;i<pred_divs.length;i++){
    pred_divs[i].classList.remove('green_background');
  }
  if((label=='ok_atlas') && (confidence >0.9999)){
   document.getElementById('ok_atlas').classList.add('green_background');
   document.getElementById('yes').play();
   counter=counter+1;
   console.log('counter :'+counter)
  }
  else {
    document.getElementById('other').classList.add('green_background');
  }  
  }  

const NUM_FRAMES = 43;
const INPUT_SHAPE = [NUM_FRAMES, 232, 1];
const words = {
  0:'_background_noise',
  1:'negative',
  2:'ok_atlas',
};

// const words = ['hey_atlas','negative_word','noise'];
let prob;
var wakewordStatus;     // Sathish : 'wakeWordStaus' is a Flag to check whether user clicked on 'Listen for Ok Atlas' Button or not
async function listen(){
  wakewordStatus = 'active'           // Sathish : if user clicks on 'Listen for Ok Atlas' Button ,so wakeWordStaus Flag will be set to'active'
  if (baseRecognizer.isListening()) {
   wakewordStatus = 'inactive'       // Sathish : if user clicks on  'Stop' Button, so wakeWordStaus Flag will be set to'active'
   baseRecognizer.stopListening();
   document.getElementById('listen').textContent = 'Listen for "OK ATLAS"';
   return;
  }
  document.getElementById('listen').textContent = 'Stop';
  baseRecognizer.listen(async ({spectrogram: {frameSize, data}}) => {
   const vals = normalize(data.subarray(-frameSize * NUM_FRAMES));
  // console.log(vals)
   const input = tf.tensor(vals, [1, ...INPUT_SHAPE]);
   const probs = model.predict(input);
   const predLabel = probs.argMax(1);
   const label = (await predLabel.data())[0];
   const confidence = probs.max(1);
   const conf = (await confidence.data())[0];
   console.log(label+","+words[label]+","+conf);
   await highlight(words[label],conf);
   tf.dispose([input, probs, predLabel]);
  }, {
   overlapFactor: 0.75,
   includeSpectrogram: true,
   invokeCallbackOnNoiseAndUnknown: true
  });
}

  // Sathish : stopWakeWordRecognizer() stops baseRecognizer,if baseRecognizer is listening already & if the screen blurs
function stopWakeWordRecognizer() {
 // if (baseRecognizer.isListening()) {
    if ((baseRecognizer.isListening()) && (wakewordStatus === 'active')) {
    console.log('Blur : Stopping wakeWordRecognizer')
    //baseRecognizer.stopListening();
    listen().then( console.log('Stopped')
    document.getElementById('listen').textContent = 'Listen for "OK ATLAS"';
    return;
  }
}

// Sathish : startWakeWordRecognizer() starts baseRecognizer,if baseRecognizer is not listening already & if the screen gets focus
function startWakeWordRecognizer() {
  
  //if (wakewordStatus === 'active') {
    if ((!baseRecognizer.isListening()) && (wakewordStatus === 'active')) {             
    console.log('wakewordStatus is :',wakewordStatus)
    listen().then(console.log('Focus: Starting wakeWordRecognizer'))
    document.getElementById('listen').textContent = 'Stop';
    return;
  }
}

window.addEventListener('blur', stopWakeWordRecognizer)  // Sathish : When screen blurs call the stopWakeWordRecognizer()
window.addEventListener('focus', startWakeWordRecognizer) // Sathish : When screen gets focus call the startWakeWordRecognizer()

app();

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
