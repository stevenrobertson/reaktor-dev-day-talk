var ALPHA = 0.9;
var video = document.getElementById('v');

var ctx = {
  w: 1280,
  h: 720,
  vw: 1280,
  vh: 720
};

var camera = new THREE.OrthographicCamera(
    -ctx.w / 2, ctx.w / 2, ctx.h / 2, -ctx.h / 2, 1, 2);
camera.position.z = 1;

var renderer = new THREE.WebGLRenderer({precision:'highp'});
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

var createRT = function(factor) {
  var rtTex = new THREE.WebGLRenderTarget(ctx.vw * factor, ctx.vh * factor, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter});
  return rtTex;
};

var videoCanvas = createCanvasAndTexture();
var lastFrameCanvas = createCanvasAndTexture();

var createScene = function (shaderID, vShaderID) {
  var scene = new THREE.Scene();
  var geometry = new THREE.PlaneGeometry(ctx.vw, ctx.vh);
  var uniforms = {
    baseTexture: {type: "t", value: videoCanvas.tex},
    lastTexture: {type: "t", value: lastFrameCanvas.tex},
    vertMode: {type: "i", value: 0},
    invLevel: {type: "f", value: 1},
    qLevel: {type: "f", value: 1},
  };
  vShaderID = vShaderID || 'vertexShader';
  var material = new THREE.ShaderMaterial({
    uniforms: uniforms,
    vertexShader: document.getElementById(vShaderID).textContent,
    fragmentShader: document.getElementById(shaderID).textContent
  });
  var cube = new THREE.Mesh(geometry, material);
  scene.add(cube);

  return {scene:scene, u:uniforms, material:material};
};


var hasChanged = function(oldCanvas, newCanvas) {
  // God, the web blows.
  var data = oldCanvas.ctx.getImageData(0, ctx.vh / 2, ctx.vw, 1).data;
  var newData = newCanvas.ctx.getImageData(0, ctx.vh / 2, ctx.vw, 1).data;
  for (var i = 0; i < data.length; i += 7) {
    if (data[i] != newData[i]) {
      return true;
    }
  }
  return false;
};

var PixelDiffingGraph = function() {
  this.pd = createScene('deltaShader');
  this.pd.u.lowBound = {type: 'f', value: 0.5};
  this.pd.u.highBound = {type: 'f', value: 1.0};

  this.lastTouched = 0;
  this.lowTarget = 0.5;
  this.highTarget = 1.0;
};

PixelDiffingGraph.prototype.render = function() {
  videoCanvas.ctx.drawImage(video, 0, 0);
  videoCanvas.tex.needsUpdate = true;
  if (!hasChanged(videoCanvas, lastFrameCanvas) &&
      Date.now() - this.lastTouched < 1000) {
    return;
  }
  this.lastTouched = Date.now();
  var t = lastFrameCanvas;
  lastFrameCanvas = videoCanvas;
  videoCanvas = t;
  this.pd.u.baseTexture.value = videoCanvas.tex;
  this.pd.u.lastTexture.value = lastFrameCanvas.tex;
  this.pd.u.highBound.value = ALPHA * this.pd.u.highBound.value +
    (1.0 - ALPHA) * this.highTarget;
  this.pd.u.lowBound.value = ALPHA * this.pd.u.lowBound.value +
    (1.0 - ALPHA) * this.lowTarget;
  renderer.render(this.pd.scene, camera);
};

PixelDiffingGraph.prototype.handleKeypress = function(key) {
  if (key == 'a') {
    if (this.lowTarget == 0.5) {
      this.lowTarget = 0.3;
      this.highTarget = 1.0;
    } else if (this.lowTarget == 0.3) {
      this.lowTarget = 0.05;
      this.highTarget = 0.95;
    } else {
      this.lowTarget = 0.5;
      this.highTarget = 1.0;
    }
  }
};

PixelDiffingGraph.prototype.getStatusText = function() {
    return 'diff';
};

var SquiggoGraph = function() {
  this.sq = createScene('squiggo');
  this.sq.u.time = {type: "f", value: 0};
  this.sq.u.rate = {type: "f", value: 4.0};
  this.sq.u.showValue = {type: "i", value: 0};
};

SquiggoGraph.prototype.render = function() {
  this.sq.u.time.value = (this.sq.u.time.value + 1/60) % 4;
  renderer.render(this.sq.scene, camera);
};

SquiggoGraph.prototype.handleKeypress = function(key) {
  if (key == 'r') {
    this.sq.u.rate.value = this.sq.u.rate.value == 4.0 ? 12.0 : 4.0;
  } else if (key == 's') {
    this.sq.u.showValue.value = !this.sq.u.showValue.value;
  }
};

SquiggoGraph.prototype.getStatusText = function() {
    return 'squiggo, rate[r]=' + this.sq.u.rate.value +
      ', show[s]=' + this.sq.u.showValue.value;
};

var CrappyLaplacianGraph = function() {
  this.lp = createScene('laplacian');
  this.lp.u.srcTex = {type: 't', value: videoCanvas.tex};
  this.lp.u.isVertMode = {type: 'i', value: 0};

  this.bl = createScene('blendo');
  this.rtLoTex = createRT(1);
  this.rtMedTex = createRT(1);
  this.rtHighTex = createRT(1);

  this.bl.u.loTex = {type: "t", value: this.rtLoTex};
  this.bl.u.medTex = {type: "t", value: this.rtMedTex};
  this.bl.u.highTex = {type: "t", value: this.rtHighTex};
};

CrappyLaplacianGraph.prototype.render = function() {
  this.lp.u.srcTex.value = videoCanvas.tex;
  renderer.render(this.lp.scene, camera, this.bl.u.j);
};

var MotionCompensationGraph = function() {
  this.mc = createScene('mocompShader');
  this.mc.u.visMode = {type: "i", value: 0};

  this.lastTouched = 0;
  this.visMode = 0;
};

MotionCompensationGraph.prototype.render = function() {
  videoCanvas.ctx.drawImage(video, 0, 0);
  videoCanvas.tex.needsUpdate = true;
  if (!hasChanged(videoCanvas, lastFrameCanvas) &&
      Date.now() - this.lastTouched < 1000) {
    return;
  }
  this.lastTouched = Date.now();
  var t = lastFrameCanvas;
  lastFrameCanvas = videoCanvas;
  videoCanvas = t;
  this.mc.u.baseTexture.value = videoCanvas.tex;
  this.mc.u.lastTexture.value = lastFrameCanvas.tex;
  this.mc.u.visMode.value = this.visMode;
  renderer.render(this.mc.scene, camera);
};

MotionCompensationGraph.prototype.handleKeypress = function(key) {
  if (key == 'v') {
    this.visMode = (this.visMode + 1) % 3;
    play();
  }
};

MotionCompensationGraph.prototype.getStatusText = function() {
    return 'mo, visMode[v]=' + this.visMode;
};

var WaveletGraph = function() {
  this.cb = createScene('loadCheckerboard');
  this.pt = createScene('passThru');
  this.q = createScene('quantize');
  this.ss = createScene('splitscreen');
  this.ss.u.pos = {type: 'f', value: 0};
  this.wa = createScene('waveletAnalysis');
  this.wa.u.randSeed = {type: "f", value: 0};
  this.wa.u.isHorizOnly = {type: "i", value: 0};
  this.we = createScene('waveletEmphasis');
  this.we.u.isHorizOnly = {type: "i", value: 1};
  this.ws = createScene('waveletSynthesis');
  this.ws.u.isHorizOnly = {type: "i", value: 1};
  this.rtFrontTex = createRT(2);
  this.rtBackTex = createRT(2);

  this.numLevels = 0;
  this.qLevels = [];
  this.reconstruct = false;
  this.checkerboard = false;
  this.horizontal = true;
  this.enhance = false;
  this.splitScreenPos = 1.0;
};

WaveletGraph.prototype.flip = function() {
  var x = this.rtFrontTex;
  this.rtFrontTex = this.rtBackTex;
  this.rtBackTex = x;
};

WaveletGraph.prototype.render = function() {
  this.wa.u.baseTexture.value = videoCanvas.tex;
  this.ws.u.baseTexture.value = videoCanvas.tex;
  this.ss.u.lastTexture.value = videoCanvas.tex;
  videoCanvas.ctx.drawImage(video, 0, 0);
  videoCanvas.tex.needsUpdate = true;

  if (this.numLevels <= 0 && !this.checkerboard) {
    this.q.u.baseTexture.value = videoCanvas.tex;
    this.q.u.qLevel.value = this.getQ(0);
    renderer.render(this.q.scene, camera);
    return;
  }

  if (this.checkerboard) {
    renderer.render(this.cb.scene, camera, this.rtBackTex);
    this.wa.u.baseTexture.value = this.rtBackTex;
  }

  this.wa.u.isHorizOnly.value = this.horizontal;
  for (var i = 0; i < this.numLevels; i++) {
    this.wa.u.invLevel.value = Math.pow(2, -i);
    this.wa.u.qLevel.value = this.getQ(i+1);
    this.wa.u.vertMode.value = 0;
    this.wa.u.randSeed.value = Math.random();
    renderer.render(this.wa.scene, camera, this.rtFrontTex);
    this.flip();
    this.wa.u.baseTexture.value = this.rtBackTex;
    if (!this.horizontal) {
      this.wa.u.vertMode.value = 1;
      this.wa.u.randSeed.value = Math.random();
      renderer.render(this.wa.scene, camera, this.rtFrontTex);
      this.flip();
      this.wa.u.baseTexture.value = this.rtBackTex;
    }
  }

  if (this.reconstruct) {
    this.ws.u.isHorizOnly.value = this.horizontal;
    for (var i = this.numLevels - 1; i >= 0; i--) {
        this.ws.u.invLevel.value = Math.pow(2, -i);
        this.ws.u.vertMode.value = 0;
        this.ws.u.baseTexture.value = this.rtBackTex;
        renderer.render(this.ws.scene, camera, this.rtFrontTex);
        this.flip();
      if (!this.horizontal) {
          this.ws.u.vertMode.value = 1;
          this.ws.u.baseTexture.value = this.rtBackTex;
          renderer.render(this.ws.scene, camera, this.rtFrontTex);
          this.flip();
      }
    }
    this.ss.u.baseTexture.value = this.rtBackTex;
    this.ss.u.qLevel.value = this.getQ(0);
    this.ss.u.pos.value = ALPHA * this.ss.u.pos.value +
      (1 - ALPHA) * this.splitScreenPos;
    renderer.render(this.ss.scene, camera);
  } else if (this.enhance) {
    this.we.u.isHorizOnly.value = this.horizontal;
    this.we.u.baseTexture.value = this.rtBackTex;
    this.we.u.invLevel.value = Math.pow(2, -this.numLevels);
    renderer.render(this.we.scene, camera);
  } else {
    this.pt.u.baseTexture.value = this.rtBackTex;
    renderer.render(this.pt.scene, camera);
  }
};

WaveletGraph.prototype.getQ = function(level) {
  return this.qLevels[level] || 256;
};

WaveletGraph.prototype.handleKeypress = function(key) {
  if (key == 'j') {
    this.numLevels += 1;
  } else if (key == 'k') {
    this.numLevels -= 1;
  } else if (key == 'q') {
    this.qLevels[this.numLevels] = this.getQ(this.numLevels) / 2;
  } else if (key == 'w') {
    this.qLevels[this.numLevels] = this.getQ(this.numLevels) * 2;
  } else if (key == 'r') {
    this.reconstruct = !this.reconstruct;
  } else if (key == 'c') {
    this.checkerboard = !this.checkerboard;
  } else if (key == 'h') {
    this.horizontal = !this.horizontal;
  } else if (key == 'e') {
    this.enhance = !this.enhance;
  } else if (key == 's') {
    this.splitScreenPos = (this.splitScreenPos == 1.0) ? 0.5 : 1.0;
  }
};

WaveletGraph.prototype.getStatusText = function() {
  return 'wavelet, levels[jk]=' + this.numLevels + ', qmap[qw]=' + this.qLevels +
    ', reconstruct[r]=' + this.reconstruct + ', honly[h]=' + this.horizontal +
    ', enhance[e]=' + this.enhance + ', sspos[s]=' + this.splitScreenPos;
};

var graph = new SquiggoGraph();

function render() {
  requestAnimationFrame(render);
  if (video.readyState != video.HAVE_ENOUGH_DATA) {
    return;
  }
  graph.render();
}
render();
video.addEventListener('canplay', render);

var statusEl = document.getElementById('status');
var updateStatusText = function() {
  statusEl.innerText = graph.getStatusText();
};
setInterval(updateStatusText, 1000);
updateStatusText();

var play = function() {
  video.currentTime = 12;
  video.play();
};

document.addEventListener('keypress', function(evt) {
  var key = String.fromCharCode(evt.charCode);
  if (key == '1') {
    graph = new WaveletGraph();
    play();
  } else if (key == '2') {
    graph = new PixelDiffingGraph();
    play();
  } else if (key == '3') {
    graph = new MotionCompensationGraph();
    play();
  } else if (key == '0') {
    graph = new SquiggoGraph();
    video.pause();
  } else if (key == '9') {
    graph = new CrappyLaplacianGraph();
    play();
  } else if (key == 'd') {
    play();
  } else if (key == ',') {
    video.playbackRate = video.playbackRate == 1.0 ? 0.5 : 1.0;
  } else if (key == 'p') {
    video.paused ? video.play() : video.pause();
  }
  graph.handleKeypress(key);
  updateStatusText();
});
