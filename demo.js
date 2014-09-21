var video = document.getElementById('v');

var ctx = {
  w: 1280,
  h: 720,
  vw: 1920,
  vh: 1080
};

var scene = new THREE.Scene();
//var camera = new THREE.OrthographicCamera(
 //   -ctx.w / 2, ctx.w / 2, ctx.h / 2, -ctx.h / 2, 1, 1000);
var camera = new THREE.PerspectiveCamera(75, ctx.w / ctx.h, 0.1, 1000);

var renderer = new THREE.WebGLRenderer();
renderer.setSize(ctx.w, ctx.h);
document.body.appendChild(renderer.domElement);


var createCanvasAndTexture = function() {
  var canvas = document.createElement('canvas');
  canvas.width = ctx.vw;
  canvas.height = ctx.vh;
  var context = canvas.getContext('2d');
  context.fillStyle = '#000000';
  context.fillRect(0, 0, ctx.vw, ctx.vh);
  var tex = new THREE.Texture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return {canvas: canvas, ctx: context, tex: tex};
};

var videoCanvas = createCanvasAndTexture();
var lastFrameCanvas = createCanvasAndTexture();

var geometry = new THREE.BoxGeometry(1.6,0.9,1);
var materialUniforms = {
  baseTexture: {type: "t", value: videoCanvas.tex},
  lastTexture: {type: "t", value: lastFrameCanvas.tex},
};

var material = new THREE.ShaderMaterial({
  uniforms: materialUniforms,
  vertexShader: document.getElementById('vertexShader').textContent,
  fragmentShader: document.getElementById('fragmentShader').textContent
});
var cube = new THREE.Mesh(geometry, material);
scene.add(cube);

camera.position.z = 1;

var lastTime = 0;

var hasChanged = function(oldCanvas, newCanvas) {
  // God, the web blows.
  var data = oldCanvas.ctx.getImageData(
      0, ctx.vh / 2, ctx.vw, 1).data;
  var newData = newCanvas.ctx.getImageData(
      0, ctx.vh / 2, ctx.vw, 1).data;
  for (var i = 0; i < data.length; i += 7) {
    if (data[i] != newData[i]) {
      return true;
    }
  }
  return false;
};

function render() {
  requestAnimationFrame(render);
  if (video.readyState === video.HAVE_ENOUGH_DATA) {
    videoCanvas.ctx.drawImage(video, 0, 0);
    if (!hasChanged(videoCanvas, lastFrameCanvas)) {
      return;
    }
    var t = lastFrameCanvas;
    lastFrameCanvas = videoCanvas;
    videoCanvas = t;
    materialUniforms.baseTexture.value = videoCanvas.tex;
    materialUniforms.lastTexture.value = lastFrameCanvas.tex;

    videoCanvas.tex.needsUpdate = true;
  } else {
    console.log('did not pass');
  }

  renderer.render(scene, camera);
}
render();
video.addEventListener('canplay', render);
