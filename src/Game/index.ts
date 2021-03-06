/* global requestAnimationFrame, cancelAnimationFrame, window */
import {
  PerspectiveCamera,
  Scene,
  Fog,
  WebGLRenderer,
  Vector3,
  Vector2,
  FontLoader,
  Color,
  AxesHelper,
  HemisphereLight,
  DirectionalLight,
  AmbientLight,
  PCFSoftShadowMap,
  Font,
  Mesh
} from 'three';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';

import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';

import { OrbitControls } from 'three-orbitcontrols-ts';
import TWEEN from '@tweenjs/tween.js';
import * as dat from 'dat.gui';
import Stats from 'stats.js';
import buildTextObject from './Objects/buildTextObject';
import buildBox from './Objects/buildBox';
import buildFloor from './Objects/buildFloor';
import ProgressBox from './Objects/ProgressBox';
import Helpers from './helpers';
import GAME_SETTINGS from './settings';

import GlowsPass from './Passes/Glows';

interface IXAxis {
  prevBox: Mesh | null;
  widthPrevBox: number;
  activeBox: Mesh | null;
}

interface IZAxis {
  prevBox: Mesh | null;
  depthPrevBox: number;
  activeBox: Mesh | null;
}

export default class Game {
  public stopGameStatus = true;
  public count = 0;
  public heightStack = 0;
  private vectorForCamera!: Vector3;
  private container: HTMLElement;
  private currentYPosition = 15;
  private requestAnimationId!: number | null;
  private directionAnimation = 'up'; // up or down
  private animationAxis = 'x'; // x or z
  private scene: Scene;
  private camera: PerspectiveCamera;
  private renderer: WebGLRenderer;
  private progressBox!: ProgressBox | null;
  private textHeightStack: Mesh | null;
  private textHeightStackPositionY = 20;
  private fontFor3DText!: Font;
  private composer: EffectComposer;
  private xAxis: IXAxis;
  private zAxis: IZAxis;

  // lights
  private directionalLight!: DirectionalLight;
  private hemisphereLight!: HemisphereLight;

  // develop
  public enableDeveloperTools = false;
  private stats!: Stats | null;
  private showStats = false;
  private controls!: OrbitControls | null;
  private showControls = false;

  constructor(container: HTMLElement) {
    this.xAxis = {
      prevBox: null,
      widthPrevBox: 50,
      activeBox: null
    };

    this.zAxis = {
      prevBox: null,
      depthPrevBox: 50,
      activeBox: null
    };

    this.textHeightStack = null;
    this.container = container;
    this.setNewStack = this.setNewStack.bind(this);
    this.onWindowResize = this.onWindowResize.bind(this);

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera = new PerspectiveCamera(70, width / height, 0.1, 2000);
    this.scene = new Scene();
    this.scene.background = new Color(0x2b6dbd);
    this.scene.fog = new Fog(0x2b6dbd, 2, 2200);
    this.renderer = new WebGLRenderer({ antialias: true });

    const renderPass = new RenderPass(this.scene, this.camera);
    renderPass.renderToScreen = true;

    this.vectorForCamera = new Vector3(0, 0, 0);

    this.camera.position.x = 130;
    this.camera.position.z = 130;

    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;

    this.composer = new EffectComposer(this.renderer);
    this.composer.setSize(width, height);
    this.composer.addPass(renderPass);

    const floor = buildFloor(5000, 5000);
    this.scene.add(floor);

    this.container.appendChild(this.renderer.domElement);

    const loader = new FontLoader();
    loader.load('/stack/fonts/Android_101.json', res => {
      this.fontFor3DText = res;
      this.createHeightStackText();
    });

    this.createLights();
    this.initPasses();
    window.addEventListener('resize', this.onWindowResize, false);
  }

  init() {
    this.addBoxesForInit();
    this.scene.children.reverse();

    if (this.enableDeveloperTools) {
      this.setDeveloperTools();
    }
  }

  private initPasses() {
    const glowsPass: ShaderPass = new ShaderPass(GlowsPass);

    glowsPass.material.uniforms.uPosition.value = new Vector2(0, 0.25);
    glowsPass.material.uniforms.uRadius.value = 0.7;
    glowsPass.material.uniforms.uColor.value = new Color('#ffcfe0');
    glowsPass.material.uniforms.uAlpha.value = 0.55;
    glowsPass.renderToScreen = true;

    const pixelRatio = this.renderer.getPixelRatio();

    const fxaaPass: ShaderPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.x = 1 / (this.container.offsetWidth * pixelRatio);
    fxaaPass.material.uniforms['resolution'].value.y = 1 / (this.container.offsetHeight * pixelRatio);

    this.composer.addPass(fxaaPass);
    this.composer.addPass(glowsPass);
  }

  private addBoxesForInit() {
    const firstBox = buildBox(50, 10, 50);
    firstBox.position.set(50, 5, 50);
    this.scene.add(firstBox);

    const secondBox = buildBox(50, 10, 50);
    secondBox.position.set(50, this.currentYPosition, 50);
    this.scene.add(secondBox);

    this.progressBox = new ProgressBox();
    this.progressBox.mesh.position.set(-120, 5, 50);
    this.scene.add(this.progressBox.mesh);

    this.xAxis.activeBox = secondBox;
    this.xAxis.prevBox = firstBox;

    const cameraPositionYOffset = 125;

    this.camera.position.y = this.xAxis.prevBox.position.y + cameraPositionYOffset;
    this.vectorForCamera.x = this.xAxis.prevBox.position.x;
    this.vectorForCamera.y = this.xAxis.prevBox.position.y;
    this.vectorForCamera.z = this.xAxis.prevBox.position.z;
  }

  private createHeightStackText() {
    const textPositionX = -120;
    const textPositionZ = 100;

    if (this.textHeightStack) {
      this.scene.remove(this.textHeightStack);
      this.textHeightStack = null;
    }

    this.textHeightStack = buildTextObject(this.heightStack.toString(), this.fontFor3DText);

    this.textHeightStack.rotation.y = Math.PI / 2;
    this.textHeightStack.position.set(textPositionX, this.textHeightStackPositionY, textPositionZ);

    this.scene.add(this.textHeightStack);
  }

  private createLights() {
    this.hemisphereLight = new HemisphereLight(0xffffff, 0xffffff, 0.3);
    this.hemisphereLight.color.setHSL(0.6, 1, 0.6);
    this.hemisphereLight.groundColor.setHSL(0.095, 1, 0.75);
    this.hemisphereLight.position.set(
      GAME_SETTINGS.light.hemisphereLightPosition.x,
      GAME_SETTINGS.light.hemisphereLightPosition.y,
      GAME_SETTINGS.light.hemisphereLightPosition.z
    );

    this.directionalLight = new DirectionalLight(0xffffff, 0.5);
    const ambientLight = new AmbientLight(0xdc8874, 0.7);

    this.directionalLight.position.set(
      GAME_SETTINGS.light.directionalLightPosition.x,
      GAME_SETTINGS.light.directionalLightPosition.y,
      GAME_SETTINGS.light.directionalLightPosition.z
    );
    this.directionalLight.target.position.set(
      GAME_SETTINGS.light.directionalLightTargetPosition.x,
      GAME_SETTINGS.light.directionalLightTargetPosition.y,
      GAME_SETTINGS.light.directionalLightTargetPosition.z
    );
    this.directionalLight.castShadow = true;
    this.directionalLight.shadow.mapSize.width = 2048;
    this.directionalLight.shadow.mapSize.height = 2048;
    this.directionalLight.shadow.camera.left = -400;
    this.directionalLight.shadow.camera.right = 400;
    this.directionalLight.shadow.camera.top = 400;
    this.directionalLight.shadow.camera.bottom = -400;

    this.directionalLight.shadow.camera.far = 5000;
    this.directionalLight.shadow.bias = -0.0001;

    this.scene.add(this.hemisphereLight);
    this.scene.add(this.directionalLight);
    this.scene.add(this.directionalLight.target);
    this.scene.add(ambientLight);
  }

  private animationOnXAxis(boxObject: Mesh) {
    const maximumRangeOfMotionUp = -80;
    const maximumRangeOfMotionDown = 180;

    if (boxObject.position.x >= maximumRangeOfMotionDown) {
      this.directionAnimation = 'up';
    } else if (boxObject.position.x < maximumRangeOfMotionUp) {
      this.directionAnimation = 'down';
    }

    if (this.directionAnimation === 'down') {
      boxObject.position.set(boxObject.position.x + GAME_SETTINGS.speed, boxObject.position.y, boxObject.position.z);
    } else {
      boxObject.position.set(boxObject.position.x - GAME_SETTINGS.speed, boxObject.position.y, boxObject.position.z);
    }
  }

  private animationOnZAxis(boxObject: Mesh) {
    const maximumRangeOfMotionUp = -80;
    const maximumRangeOfMotionDown = 180;

    if (boxObject.position.z >= maximumRangeOfMotionDown) {
      this.directionAnimation = 'up';
    } else if (boxObject.position.z < maximumRangeOfMotionUp) {
      this.directionAnimation = 'down';
    }

    if (this.directionAnimation === 'down') {
      boxObject.position.set(boxObject.position.x, boxObject.position.y, boxObject.position.z + GAME_SETTINGS.speed);
    } else {
      boxObject.position.set(boxObject.position.x, boxObject.position.y, boxObject.position.z - GAME_SETTINGS.speed);
    }
  }

  private toggleAnimationAxis() {
    this.animationAxis = this.animationAxis === 'x' ? 'z' : 'x';
  }

  stopGame() {
    if (this.animationAxis === 'x') {
      if (this.xAxis.activeBox) this.scene.remove(this.xAxis.activeBox);
    } else {
      if (this.zAxis.activeBox) this.scene.remove(this.zAxis.activeBox);
    }
    this.stopGameStatus = true;

    if (this.requestAnimationId) cancelAnimationFrame(this.requestAnimationId);
    this.requestAnimationId = null;
    this.render();
  }

  restartGame() {
    if (this.requestAnimationId) cancelAnimationFrame(this.requestAnimationId);

    this.xAxis = {
      prevBox: null,
      widthPrevBox: 50,
      activeBox: null
    };

    this.zAxis = {
      prevBox: null,
      depthPrevBox: 50,
      activeBox: null
    };

    this.stopGameStatus = true;
    this.currentYPosition = 15;
    this.requestAnimationId = null;
    this.directionAnimation = 'up'; // up or down
    this.animationAxis = 'x'; // x or z
    this.count = 0;
    this.heightStack = 0;
    this.progressBox = null;
    this.textHeightStackPositionY = 20;

    for (let i = this.scene.children.length - 1; i >= 0; i -= 1) {
      if (this.scene.children[i].type === 'Mesh' && this.scene.children[i].name !== 'floor') {
        this.scene.remove(this.scene.children[i]);
      }
    }

    this.camera.position.x = 130;
    this.camera.position.z = 130;

    this.addBoxesForInit();
    this.createHeightStackText();
    this.start();
  }

  getStopStatusGame() {
    return this.stopGameStatus;
  }

  start() {
    this.stopGameStatus = false;
    this.render();
  }

  private createNewStack() {
    if (this.animationAxis === 'x') {
      if (!this.xAxis.activeBox) return;
      const newBox = buildBox(
        this.zAxis.depthPrevBox,
        10,
        this.xAxis.widthPrevBox,
        this.xAxis.activeBox.userData.currentColor
      );

      const newActiveBox = buildBox(this.zAxis.depthPrevBox, 10, this.xAxis.widthPrevBox);

      if (!this.xAxis.activeBox || !this.xAxis.prevBox) return;
      const positionForNewBox = Helpers.getPositionForNewBox(
        this.xAxis.activeBox.position.x,
        this.xAxis.prevBox.position.x
      );

      newBox.position.set(
        positionForNewBox,
        this.currentYPosition,
        this.xAxis.prevBox ? this.xAxis.prevBox.position.z : 50
      );
      newActiveBox.position.set(positionForNewBox, this.currentYPosition + 10, -80);

      this.currentYPosition += 10;

      this.scene.remove(this.xAxis.activeBox);
      this.scene.add(newBox);
      this.scene.add(newActiveBox);

      this.zAxis.prevBox = newBox;
      this.zAxis.activeBox = newActiveBox;
    }

    if (this.animationAxis === 'z') {
      if (!this.zAxis.activeBox) return;
      const newBox = buildBox(
        this.zAxis.depthPrevBox,
        10,
        this.xAxis.widthPrevBox,
        this.zAxis.activeBox.userData.currentColor
      );
      const newActiveBox = buildBox(this.zAxis.depthPrevBox, 10, this.xAxis.widthPrevBox);

      if (!this.zAxis.activeBox || !this.zAxis.prevBox) return;
      const positionForNewBox = Helpers.getPositionForNewBox(
        this.zAxis.activeBox.position.z,
        this.zAxis.prevBox.position.z
      );

      newBox.position.set(this.zAxis.prevBox.position.x, this.currentYPosition, positionForNewBox);
      newActiveBox.position.set(-80, this.currentYPosition + 10, positionForNewBox);

      this.currentYPosition += 10;

      this.scene.remove(this.zAxis.activeBox);
      this.scene.add(newBox);
      this.scene.add(newActiveBox);

      this.xAxis.prevBox = newBox;
      this.xAxis.activeBox = newActiveBox;
    }

    this.heightStack += 1;
    this.count += 1;
    this.createHeightStackText();
    this.textHeightStackPositionY += 10;
  }

  getCount() {
    return this.count;
  }

  getStackHeight() {
    return this.heightStack;
  }

  private startTweenAnimations() {
    if (
      !this.xAxis.activeBox ||
      !this.xAxis.prevBox ||
      !this.zAxis.activeBox ||
      !this.zAxis.prevBox ||
      !this.progressBox
    )
      return;
    // Camera position
    const tweenCameraPosition = new TWEEN.Tween(this.camera.position)
      .to(
        {
          y: this.camera.position.y + 10
        },
        500
      )
      .easing(TWEEN.Easing.Linear.None);

    // Camera look
    const vectorForCamera = new TWEEN.Tween(this.vectorForCamera)
      .to(
        {
          y: this.animationAxis === 'x' ? this.xAxis.prevBox.position.y : this.zAxis.prevBox.position.y
        },
        500
      )
      .easing(TWEEN.Easing.Linear.None);

    // Text count position
    if (!this.textHeightStack) return;
    const tweenTextHeightStackPosition = new TWEEN.Tween(this.textHeightStack.position)
      .to(
        {
          y: this.textHeightStackPositionY
        },
        500
      )
      .easing(TWEEN.Easing.Quartic.InOut);

    this.progressBox.setYPosition(10);

    tweenTextHeightStackPosition.start();
    if (!this.enableDeveloperTools) {
      tweenCameraPosition.start();
      vectorForCamera.start();
    }
  }

  setNewStack() {
    if (this.stopGameStatus) {
      return false;
    }

    if (this.animationAxis === 'x') {
      if (!this.xAxis.activeBox || !this.xAxis.prevBox || !this.zAxis.depthPrevBox) return;
      if (
        !Helpers.checkIntersection(this.xAxis.prevBox, this.xAxis.activeBox, this.zAxis.depthPrevBox, 'x').intersection
      ) {
        this.stopGame();
        return false;
      }

      this.zAxis.depthPrevBox = Helpers.getWidthNewBox(
        this.xAxis.activeBox.position.x,
        this.xAxis.prevBox.position.x,
        this.zAxis.depthPrevBox
      );

      this.createNewStack();
      if (!this.zAxis.prevBox) return;
      if (
        Helpers.checkIntersection(this.xAxis.prevBox, this.xAxis.activeBox, this.zAxis.depthPrevBox, 'x')
          .fullIntersection
      ) {
        Helpers.transparentMeshAnimate(this.zAxis.prevBox);
        this.count += 1;
      }
    }

    if (this.animationAxis === 'z') {
      if (!this.zAxis.prevBox || !this.zAxis.activeBox) return;
      if (
        !Helpers.checkIntersection(this.zAxis.prevBox, this.zAxis.activeBox, this.xAxis.widthPrevBox, 'z').intersection
      ) {
        this.stopGame();
        return false;
      }

      this.xAxis.widthPrevBox = Helpers.getWidthNewBox(
        this.zAxis.activeBox.position.z,
        this.zAxis.prevBox.position.z,
        this.xAxis.widthPrevBox
      );

      this.createNewStack();
      if (!this.xAxis.prevBox) return;
      if (
        Helpers.checkIntersection(this.zAxis.prevBox, this.zAxis.activeBox, this.xAxis.widthPrevBox, 'z')
          .fullIntersection
      ) {
        Helpers.transparentMeshAnimate(this.xAxis.prevBox);
        this.count += 1;
      }
    }

    this.startTweenAnimations();

    this.toggleAnimationAxis();

    return true;
  }

  private onWindowResize() {
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.composer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  // Main loop
  private render() {
    this.composer.render();
    TWEEN.update();

    if (this.showStats && this.stats) {
      this.stats.update();
    }

    if (this.showControls && this.controls) {
      this.controls.update();
    } else {
      this.camera.lookAt(this.vectorForCamera);
    }

    if (!this.stopGameStatus) {
      if (this.animationAxis === 'x') {
        if (this.xAxis.activeBox) {
          this.animationOnXAxis(this.xAxis.activeBox);
        }
        /*if (
          Helpers.checkIntersection(this.xAxis.prevBox, this.xAxis.activeBox, this.zAxis.depthPrevBox, 'x')
            .fullIntersection
        ) {
          this.setNewStack();
        }*/
      } else {
        if (this.zAxis.activeBox) {
          this.animationOnZAxis(this.zAxis.activeBox);
        }
        /*if (
          Helpers.checkIntersection(this.zAxis.prevBox, this.zAxis.activeBox, this.xAxis.widthPrevBox, 'z')
            .fullIntersection
        ) {
          this.setNewStack();
        }*/
      }
    }

    this.requestAnimationId = requestAnimationFrame(this.render.bind(this));
  }

  // Developer tools
  private setDeveloperTools() {
    this.enableDatGui();
    this.enableStats();
    this.enableAxesHelper();
    this.enableOrbitControls();
  }

  private enableDatGui() {
    const datGui = new dat.GUI({ autoPlace: false });
    const lightSettings = { ...GAME_SETTINGS.light };

    datGui.domElement.id = 'gui';
    datGui.add(GAME_SETTINGS, 'speed', 1, 10, 1);

    const lightsGui = datGui.addFolder('lights');
    const directionalLightPositionGui = lightsGui.addFolder('directionalLightPosition');

    directionalLightPositionGui
      .add(lightSettings.directionalLightPosition, 'x', 1, 1500, 10)
      .listen()
      .onChange(value => {
        this.directionalLight.position.x = value;
      });
    directionalLightPositionGui
      .add(lightSettings.directionalLightPosition, 'y', 1, 1500, 10)
      .listen()
      .onChange(value => {
        this.directionalLight.position.y = value;
      });
    directionalLightPositionGui
      .add(lightSettings.directionalLightPosition, 'z', 1, 1500, 10)
      .listen()
      .onChange(value => {
        this.directionalLight.position.z = value;
      });

    const directionalLightTargetPositionGui = lightsGui.addFolder('directionalLightTargetPosition');

    directionalLightTargetPositionGui
      .add(lightSettings.directionalLightTargetPosition, 'x', 1, 200, 1)
      .listen()
      .onChange(value => {
        this.directionalLight.target.position.x = value;
      });
    directionalLightTargetPositionGui
      .add(lightSettings.directionalLightTargetPosition, 'y', 1, 200, 1)
      .listen()
      .onChange(value => {
        this.directionalLight.target.position.y = value;
      });
    directionalLightTargetPositionGui
      .add(lightSettings.directionalLightTargetPosition, 'z', 1, 200, 1)
      .listen()
      .onChange(value => {
        this.directionalLight.target.position.z = value;
      });

    const hemisphereLightPositionGui = lightsGui.addFolder('hemisphereLightPosition');

    hemisphereLightPositionGui
      .add(lightSettings.hemisphereLightPosition, 'x', 0, 1000, 5)
      .listen()
      .onChange(value => {
        this.hemisphereLight.position.x = value;
      });
    hemisphereLightPositionGui
      .add(lightSettings.hemisphereLightPosition, 'y', 0, 1000, 5)
      .listen()
      .onChange(value => {
        this.hemisphereLight.position.y = value;
      });
    hemisphereLightPositionGui
      .add(lightSettings.hemisphereLightPosition, 'z', 0, 1000, 5)
      .listen()
      .onChange(value => {
        this.hemisphereLight.position.z = value;
      });

    this.container.appendChild(datGui.domElement);
  }

  private enableStats() {
    this.showStats = true;
    this.stats = new Stats();
    this.stats.showPanel(0);
    this.container.appendChild(this.stats.dom);
  }

  private enableOrbitControls() {
    this.showControls = true;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
  }

  private enableAxesHelper() {
    const axesHelper = new AxesHelper(500);
    this.scene.add(axesHelper);
  }
}
