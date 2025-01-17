/*
 * Title: PainterNode ComflyUI from ControlNet
 * Author: AlekPet
 * Version: 2024.02.05
 * Github: https://github.com/AlekPet/ComfyUI_Custom_Nodes_AlekPet
 */

import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { fabric } from "./fabric.js";
import SymmetryBrush, { svgSymmetryButtons } from "./brushes.js";

// ================= FUNCTIONS ================
const painters_settings_json = false; // save settings in JSON file on the extension folder [big data settings includes images] if true else localStorage
const removeIcon =
  "data:image/svg+xml,%3Csvg version='1.1' id='Ebene_1' x='0px' y='0px' width='595.275px' height='595.275px' viewBox='200 215 230 470' xmlns='http://www.w3.org/2000/svg'%3E%3Cdefs%3E%3C/defs%3E%3Crect x='125.3' y='264.6' width='350.378' height='349.569' style='fill: rgb(237, 0, 0); stroke: rgb(197, 2, 2);' rx='58.194' ry='58.194'%3E%3C/rect%3E%3Cg%3E%3Crect x='267.162' y='307.978' transform='matrix(0.7071 -0.7071 0.7071 0.7071 -222.6202 340.6915)' style='fill:white;' width='65.545' height='262.18' rx='32.772' ry='32.772'%3E%3C/rect%3E%3Crect x='266.988' y='308.153' transform='matrix(0.7071 0.7071 -0.7071 0.7071 398.3889 -83.3116)' style='fill:white;' width='65.544' height='262.179' rx='32.772' ry='32.772'%3E%3C/rect%3E%3C/g%3E%3C/svg%3E";

const removeImg = document.createElement("img");
removeImg.src = removeIcon;

function renderIcon(icon) {
  return function renderIcon(ctx, left, top, styleOverride, fabricObject) {
    var size = this.cornerSize;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(fabric.util.degreesToRadians(fabricObject.angle));
    ctx.drawImage(icon, -size / 2, -size / 2, size, size);
    ctx.restore();
  };
}

function removeObject(eventData, transform) {
  var target = transform.target;
  var canvas = target.canvas;
  canvas.remove(target);
  canvas.requestRenderAll();
  this.viewListObjects(this.list_objects_panel__items);
}

function toRGBA(hex, alpha = 1.0) {
  let array_hex = hex.match(/[^#]./g);
  if (array_hex) {
    return `rgba(${array_hex
      .map((h) => parseInt(h, 16))
      .join(", ")}, ${alpha})`;
  }
  return hex;
}

function getColorHEX(c) {
  let colorStyle = new fabric.Color(c),
    color = colorStyle.toHex(),
    alpha = colorStyle.getAlpha();
  return { color: `#${color}`, alpha: parseFloat(alpha) };
}

function showHide({ elements = [], hide = null }) {
  Array.from(elements).forEach((el) => {
    if (hide !== null) {
      el.style.display = !hide ? "block" : "none";
    } else {
      el.style.display =
        !el.style.display || el.style.display == "none" ? "block" : "none";
    }
  });
}

function makeElement(tag, attrs = {}) {
  if (!tag) tag = "div";
  const element = document.createElement(tag);
  Object.keys(attrs).forEach((key) => {
    const currValue = attrs[key];
    if (key === "class") {
      if (Array.isArray(currValue)) {
        element.classList.add(...currValue);
      } else if (currValue instanceof String && typeof currValue === "string") {
        element.className = currValue;
      }
    } else if (key === "dataset") {
      try {
        if (Array.isArray(currValue)) {
          currValue.forEach((datasetArr) => {
            const [prop, propval] = Object.entries(datasetArr)[0];
            element.dataset[prop] = propval;
          });
        } else {
          const [prop, propval] = Object.entries(currValue)[0];
          element.dataset[prop] = propval;
        }
      } catch (err) {
        console.log(err);
      }
    } else {
      element[key] = currValue;
    }
  });
  return element;
}

window.LS_Painters = {};
export function LS_PSave() {
  if (painters_settings_json) {
    saveData();
  } else {
    localStorage.setItem("ComfyUI_Painter", JSON.stringify(LS_Painters));
  }
}
// ================= END FUNCTIONS ================

// ================= CLASS PAINTER ================
class Painter {
  constructor(node, canvas) {
    this.originX = 0;
    this.originY = 0;
    this.drawning = true;
    this.mode = false;
    this.type = "Brush";
    this.disabled=true;

    this.locks = {
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
      lockRotation: false,
    };

    this.currentCanvasSize = { width: 512, height: 512 };
    this.maxNodeSize = 1024;

    this.max_history_steps = 20;
    this.undo_history = [];
    this.redo_history = [];

    // this.undo_history = LS_Painters[node.name].undo_history || [];
    // this.redo_history = LS_Painters[node.name].redo_history || [];

    this.fonts = {
      Arial: "arial",
      "Times New Roman": "Times New Roman",
      Verdana: "verdana",
      Georgia: "georgia",
      Courier: "courier",
      "Comic Sans MS": "comic sans ms",
      Impact: "impact",
    };

    this.bringFrontSelected = true;

    this.node = node;
    this.history_change = false;
    this.canvas = this.initCanvas(canvas);
    this.image = node.widgets.find((w) => w.name === "image");

    let default_value = this.image.value;
    Object.defineProperty(this.image, "value", {
      set: function (value) {
        this._real_value = value;
      },

      get: function () {
        let value = "";
        if (this._real_value) {
          value = this._real_value;
        } else {
          return default_value;
        }

        if (value.filename) {
          let real_value = value;
          value = "";
          if (real_value.subfolder) {
            value = real_value.subfolder + "/";
          }

          value += real_value.filename;

          if (real_value.type && real_value.type !== "input")
            value += ` [${real_value.type}]`;
        }
        return value;
      },
    });
  }

  initCanvas(canvasEl) {
    this.canvas = new fabric.Canvas(canvasEl, {
      isDrawingMode: true,
      width: 512,
      height: 512,
    });

    this.canvas.backgroundColor = "#000000";
    this.canvas.setBackgroundColor('transparent', fabric.StaticCanvas.NONE_CACHING, false);
    return this.canvas;
  }

  makeElements() {
    const panelPaintBox = document.createElement("div");
    panelPaintBox.innerHTML = `<div class="painter_manipulation_box" f_name="Locks" style="display:none;">
        <div class="comfy-menu-btns">
            <button id="lockMovementX" title="锁移动X">锁X</button>
            <button id="lockMovementY" title="锁移动Y">锁Y</button>
            <button id="lockScalingX" title="锁缩放X">锁缩放X</button>
            <button id="lockScalingY" title="锁缩放Y">锁缩放Y</button>
            <button id="lockRotation" title="锁旋转">锁旋转</button>
        </div>
        <div class="comfy-menu-btns">
            <button id="zpos_BringForward" title="在绘制的对象堆栈中向上移动对象或选择">上移一层</button>
            <button id="zpos_SendBackwards" title="在绘制的对象堆栈中向下移动对象或选择">下移一层</button>
            <button id="zpos_BringToFront" title="将一个或多个选择的对象移动到顶部">移到顶层</button>
            <button id="zpos_SendToBack" title="将一个或多个选择的对象移动到底部">移到底层</button>
            <button id="zpos_BringFrontSelected" title="单击鼠标后将一个或多个选择的对象移动到顶部" class="${
              this.bringFrontSelected ? "active" : ""
            }">始终在顶层</button>
        </div>
    </div>
    <div class="painter_drawning_box_property" style='display:block;'></div>
    <div class="painter_drawning_box">
        <div class="painter_mode_box fieldset_box comfy-menu-btns" f_name="模式">
            <button id="painter_change_mode" title="启用选择模式">选择模式</button>
            <div class="list_objects_panel" style="display:none;">
                <div class="list_objects_align">
                    <div class="list_objects_panel__items"></div>
                    <div class="painter_shapes_box_modify"></div>
                </div>
            </div>
        </div>
        <div class="painter_drawning_elements" style="display:block;">
            <div class="painter_grid_style painter_shapes_box fieldset_box comfy-menu-btns" f_name="形状">
                <button class="active" data-shape='Brush' title="笔刷">B</button>
                <button data-shape='Erase' title="擦除">E</button>
                <button data-shape='Circle' title="圆形">◯</button>
                <button data-shape='Rect' title="矩形">▭</button>
                <button data-shape='Triangle' title="三角形">△</button>
                <button data-shape='Line' title="直线">|</button>
                <button data-shape='Image' title="添加图片">P</button>
                <button data-shape='Textbox' title="添加文字">T</button>
            </div>
            <div class="painter_colors_box fieldset_box" f_name="颜色">
                <div class="painter_grid_style painter_colors_alpha">
                    <span>填充</span><span>深浅</span>
                    <input id="fillColor" type="color" value="#FF00FF" title="填充颜色">
                    <input id="fillColorTransparent" type="number" max="1.0" min="0" step="0.05" value="0.0" title="Alpha fill value">
                </div>
                <div class="painter_grid_style painter_colors_alpha">
                    <span>笔色</span><span>深浅</span>
                    <input id="strokeColor" type="color" value="#FFFFFF" title="笔颜色">    
                    <input id="strokeColorTransparent" type="number" max="1.0" min="0" step="0.05" value="1.0" title="Stroke alpha value">
                </div>
            </div>
            <div class="painter_stroke_box fieldset_box" f_name="笔刷/擦除宽度">
                <label for="strokeWidth"><span>笔刷:</span><input id="strokeWidth" type="number" min="0" max="150" value="5" step="1" title="Brush width"></label>
                <label for="eraseWidth"><span>擦除:</span><input id="eraseWidth" type="number" min="0" max="150" value="20" step="1" title="Erase width"></label>
            </div>
            <div class="painter_grid_style painter_bg_setting fieldset_box comfy-menu-btns" f_name="背景设置">
                <input id="bgColor" type="color" value="#000000" data-label="BG" title="背景颜色">
                <button id="traBackground" bgImage="traBackground" title="Add background image">透明</button>
            </div>
            <div class="painter_settings_box fieldset_box comfy-menu-btns" f_name="功能按钮">      
            <button id="clearCanvas" title="清除画布内容" width="50px">清除</button>  
          </div>
        </div>
    </div>
    <div class="painter_history_panel comfy-menu-btns">
      <button id="history_undo" title="上一步" disabled>⟲</button>
      <button id="history_redo" title="下一步" disabled>⟳</button>
    </div> 
    `;

    // Main panelpaint box
    panelPaintBox.className = "panelPaintBox";

    this.canvas.wrapperEl.appendChild(panelPaintBox);
    // Manipulation box
    this.manipulation_box = panelPaintBox.querySelector(
      ".painter_manipulation_box"
    );
    this.painter_drawning_box_property = panelPaintBox.querySelector(
      ".painter_drawning_box_property"
    );

    [this.undo_button, this.redo_button] = panelPaintBox.querySelectorAll(
      ".painter_history_panel button"
    );

    // Modify in change mode
    this.painter_shapes_box_modify = panelPaintBox.querySelector(
      ".painter_shapes_box_modify"
    );
    this.painter_drawning_elements = panelPaintBox.querySelector(
      ".painter_drawning_elements"
    );
    [
      this.painter_shapes_box,
      this.painter_colors_box,
      this.painter_stroke_box,
      //this.painter_bg_setting,
    ] = this.painter_drawning_elements.children;

    this.change_mode = panelPaintBox.querySelector("#painter_change_mode");
    this.painter_shapes_box = panelPaintBox.querySelector(
      ".painter_shapes_box"
    );
    this.strokeWidth = panelPaintBox.querySelector("#strokeWidth");
    this.eraseWidth = panelPaintBox.querySelector("#eraseWidth");
    this.strokeColor = panelPaintBox.querySelector("#strokeColor");
    this.fillColor = panelPaintBox.querySelector("#fillColor");

    this.list_objects_panel__items = panelPaintBox.querySelector(
      ".list_objects_panel__items"
    );

    this.strokeColorTransparent = panelPaintBox.querySelector(
      "#strokeColorTransparent"
    );
    this.fillColorTransparent = panelPaintBox.querySelector(
      "#fillColorTransparent"
    );
    this.bgColor = panelPaintBox.querySelector("#bgColor");
    this.traBackground= panelPaintBox.querySelector("#traBackground");
    this.clear = panelPaintBox.querySelector("#clear");

    // this.painter_bg_setting = panelPaintBox.querySelector(
    //   ".painter_bg_setting"
    // );

    // this.buttonSetCanvasSize = panelPaintBox.querySelector(
    //   "#painter_canvas_size"
    // );
    this.buttonClearCanvas = panelPaintBox.querySelector(
      "#clearCanvas"
    );


    this.bgImageFile = document.createElement("input");
    Object.assign(this.bgImageFile, {
      accept: "image/jpeg,image/png,image/webp",
      type: "file",
      style: "display:none",
    });

    //this.painter_bg_setting.appendChild(this.bgImageFile);
    this.changePropertyBrush();
    this.createBrushesToolbar();
    this.bindEvents();
  }

  traBackgroundColor(){
    if('transparent' == this.canvas.backgroundColor){
      this.canvas.backgroundColor = this.bgColor.value || "#000000";
    }else{
      this.canvas.setBackgroundColor('transparent', fabric.StaticCanvas.NONE_CACHING, false);
    }
    this.canvas.renderAll();
    this.uploadPaintFile(this.node.name);
  }

  clearCanvas() {
    this.canvas.clear();
    this.canvas.setBackgroundColor('transparent', fabric.StaticCanvas.NONE_CACHING, false);
    this.canvas.requestRenderAll();
    this.addToHistory();
    this.canvasSaveSettingsPainter();
  }

  viewListObjects(list_body) {
    list_body.innerHTML = "";

    let objectNames = [];
    this.canvas.getObjects().forEach((o) => {
      let type = o.type,
        obEl = document.createElement("button"),
        countType = objectNames.filter((t) => t == type).length + 1,
        text_value = type + `_${countType}`;

      obEl.setAttribute("painter_object", text_value);
      obEl.textContent = text_value;

      objectNames.push(o.type);

      obEl.addEventListener("click", () => {
        // Style active
        this.setActiveElement(obEl, list_body);
        // Select element
        this.canvas.discardActiveObject();
        this.canvas.setActiveObject(o);
        this.canvas.renderAll();
      });

      list_body.appendChild(obEl);
    });
  }

  clearLocks() {
    try {
      const locksElements =
        this.manipulation_box.querySelectorAll("[id^=lock]");
      if (locksElements) {
        locksElements.forEach((element) => {
          const id = element.id;
          if (id) {
            this.locks[id] = false;
            element.classList.remove("active");
          }
        });
      }
    } catch (e) {
      console.log("Clear locks error:" + e.message);
    }
  }

  changeMode(b) {
    let target = b.target,
      nextElement = target.parentElement.nextElementSibling,
      panelListObjects = target.nextElementSibling;

    if (["Image", "Textbox"].includes(this.type)) {
      this.drawning = true;
    }

    if (this.drawning) {
      this.canvas.isDrawingMode = false;
      this.drawning = false;
    } else {
      this.canvas.discardActiveObject();
      this.canvas.isDrawingMode = this.drawning = true;

      if (
        !["Brush", "Erase", "BrushSymmetry", "Image", "Textbox"].includes(
          this.type
        )
      )
        this.canvas.isDrawingMode = false;
    }

    if (!this.mode) {
      target.textContent = "绘图模式";
      target.title = "启用绘图模式";
      this.viewListObjects(this.list_objects_panel__items);

      showHide({
        elements: [
          this.manipulation_box,
          nextElement,
          panelListObjects,
          this.painter_drawning_box_property,
        ],
      });
      this.clearLocks();
      this.painter_shapes_box_modify.appendChild(this.painter_colors_box);
      this.painter_shapes_box_modify.appendChild(this.painter_stroke_box);
    } else {
      target.textContent = "选择模式";
      target.title = "启用选择模式";
      showHide({
        elements: [
          this.manipulation_box,
          nextElement,
          panelListObjects,
          this.painter_drawning_box_property,
        ],
      });
      this.painter_shapes_box.insertAdjacentElement(
        "afterend",
        this.painter_colors_box
      );
      this.painter_colors_box.insertAdjacentElement(
        "afterend",
        this.painter_stroke_box
      );
    }

    this.mode = !this.mode;
  }

  setActiveElement(element_active, parent) {
    let elementActive = parent?.querySelector(".active");
    if (elementActive) elementActive.classList.remove("active");
    element_active.classList.add("active");
  }

  // Chancge properties brush and shapes, when change color and strokeWidth
  changePropertyBrush(type = "Brush") {
    if (type === "Brush" || type === "BrushSymmetry") {
      if (type === "Brush") {
        this.canvas.freeDrawingBrush = new fabric.PencilBrush(this.canvas);
      }

      if (type === "BrushSymmetry") {
        this.canvas.freeDrawingBrush = new fabric.SymmetryBrush(this.canvas);
        if (this.symmetryBrushOptionsCopy)
          this.canvas.freeDrawingBrush._options = this.symmetryBrushOptionsCopy;
      }

      this.canvas.freeDrawingBrush.color = toRGBA(
        this.strokeColor.value,
        this.strokeColorTransparent.value
      );
      this.canvas.freeDrawingBrush.width = parseInt(this.strokeWidth.value, 10);
    }

    if (type != "Erase" || (type == "Erase" && !this.drawning)) {
      let a_obs = this.canvas.getActiveObjects();
      if (a_obs) {
        a_obs.forEach((a_o) => {
          this.setActiveStyle(
            "strokeWidth",
            parseInt(this.strokeWidth.value, 10),
            a_o
          );
          this.setActiveStyle(
            "stroke",
            toRGBA(this.strokeColor.value, this.strokeColorTransparent.value),
            a_o
          );
          this.setActiveStyle(
            "fill",
            toRGBA(this.fillColor.value, this.fillColorTransparent.value),
            a_o
          );
        });
      }
    } else {
      this.canvas.freeDrawingBrush = new fabric.EraserBrush(this.canvas);
      this.canvas.freeDrawingBrush.width = parseInt(this.eraseWidth.value, 10);
    }

    this.canvas.renderAll();
  }

  // Make shape
  shapeCreate({
    type,
    left,
    top,
    stroke,
    fill,
    strokeWidth,
    points = [],
    path = "",
  }) {
    let shape = null;

    if (type == "Rect") {
      shape = new fabric.Rect();
    } else if (type == "Circle") {
      shape = new fabric.Circle();
    } else if (type == "Triangle") {
      shape = new fabric.Triangle();
    } else if (type == "Line") {
      shape = new fabric.Line(points);
    } else if (type == "Path") {
      shape = new fabric.Path(path);
    }

    Object.assign(shape, {
      angle: 0,
      left: left,
      top: top,
      originX: "left",
      originY: "top",
      strokeWidth: strokeWidth,
      stroke: stroke,
      transparentCorners: false,
      hasBorders: false,
      hasControls: false,
      radius: 1,
      fill: type == "Path" ? false : fill,
    });

    return shape;
  }

  // Toolbars
  createFontToolbar() {
    const property_textbox = makeElement("div", {
      class: ["property_textBox", "comfy-menu-btns"],
    });
    const buttonItalic = makeElement("button", {
      dataset: { prop: "prop_fontStyle" },
      title: "Italic",
      style: "font-style:italic;",
      textContent: "I",
    });
    const buttonBold = makeElement("button", {
      dataset: { prop: "prop_fontWeight" },
      title: "Bold",
      style: "font-weight:bold;",
      textContent: "B",
    });
    const buttonUnderline = makeElement("button", {
      dataset: { prop: "prop_underline" },
      title: "Underline",
      style: "text-decoration: underline;",
      textContent: "U",
    });
    const separator = makeElement("div", { class: ["separator"] });
    const selectFontFamily = makeElement("select", {
      class: ["font_family_select"],
    });

    for (let f in this.fonts) {
      const option = makeElement("option");
      if (f === "Arial") option.setAttribute("selected", true);
      option.value = this.fonts[f];
      option.textContent = f;
      selectFontFamily.appendChild(option);
    }

    // Select front event
    selectFontFamily.onchange = (e) => {
      if (this.getActiveStyle("fontFamily") != selectFontFamily.value)
        this.setActiveStyle("fontFamily", selectFontFamily.value);
    };

    property_textbox.append(
      buttonItalic,
      buttonBold,
      buttonUnderline,
      separator,
      selectFontFamily
    );
    this.painter_drawning_box_property.append(property_textbox);
  }

  createBrushesToolbar() {
    // First panel
    const property_brushesBox = makeElement("div", {
      class: ["property_brushesBox", "comfy-menu-btns"],
    });

    const buttonBrush = makeElement("button", {
      dataset: [{ shape: "Brush" }, { prop: "prop_brushDefault" }],
      title: "刷子",
      textContent: "B",
    });

    const buttonBrushSymmetry = makeElement("button", {
      dataset: [{ shape: "BrushSymmetry" }, { prop: "prop_BrushSymmetry" }],
      title: "对称笔刷",
      textContent: "S",
    });

    const separator = makeElement("div", { class: ["separator"] });

    // Second panel setting brushes
    this.property_brushesSecondBox = makeElement("div", {
      class: ["property_brushesSecondBox"],
    });

    property_brushesBox.append(
      buttonBrush,
      buttonBrushSymmetry,
      separator,
      this.property_brushesSecondBox
    );

    this.painter_drawning_box_property.append(property_brushesBox);
  }

  async createToolbarOptions(type) {
    this.property_brushesSecondBox.innerHTML = "";
    if (type === "BrushSymmetry") {
      // Wait
      function waitOptions() {
        return new Promise((res) => {
          function waitTime() {
            setTimeout(() => {
              const options = this.canvas.freeDrawingBrush?._options;
              if (!options) waitTime();
              else res(options);
            }, 0);
          }
          waitTime.call(this);
        });
      }

      const options = await waitOptions.call(this);
      Object.keys(options).forEach((symoption, indx) => {
        const current = options[symoption];
        const buttonOpt = makeElement("button", {
          innerHTML: svgSymmetryButtons[indx],
          dataset: { prop: `prop_symmetry_${indx}` },
          title: current.type,
        });

        if (current.enable) buttonOpt.classList.add("active");

        buttonOpt.optindex = indx;
        this.property_brushesSecondBox.append(buttonOpt);
      });
    }
    app.graph.setDirtyCanvas(true, false);
  }
  // end - Toolbars

  selectPropertyToolbar(type) {
    this.painter_drawning_box_property.innerHTML = "";
    if (["Textbox", "Brush"].includes(this.type)) {
      this.painter_drawning_box_property.style.display = "block";

      switch (this.type) {
        case "Textbox":
          this.createFontToolbar();
          break;
        case "Brush":
          this.createBrushesToolbar();
          break;
      }
    } else {
      this.painter_drawning_box_property.style.display = "";
    }
    app.graph.setDirtyCanvas(true, false);
  }

  setCanvasSize(new_width, new_height) {
    this.canvas.setDimensions({
      width: new_width,
      height: new_height,
    });
    this.currentCanvasSize = { width: new_width, height: new_height };
    this.node.title = `${this.node.type} - ${new_width}x${new_height}`;
    this.canvas.renderAll();
    app.graph.setDirtyCanvas(true, false);
    this.node.onResize();
  }

  bindEvents() {
    // Button tools select
    this.painter_shapes_box.onclick = (e) => {
      let target = e.target,
        currentTarget = target.dataset?.shape;
      if (currentTarget) {
        this.type = currentTarget;

        switch (currentTarget) {
          case "Erase":
          case "Brush":
            this.changePropertyBrush(currentTarget);
            this.canvas.isDrawingMode = true;
            this.drawning = true;
            break;
          case "Image":
            this.bgImageFile.func = (img) => {
              let img_ = img
                .set({
                  left: 0,
                  top: 0,
                  angle: 0,
                  strokeWidth: 1,
                })
                .scale(0.3);
              this.canvas.add(img_).renderAll();
              this.uploadPaintFile(this.node.name);
              this.bgImageFile.value = "";
            };
            this.bgImageFile.click();
            this.canvas.isDrawingMode = false;
            this.drawning = false;
            break;
          case "Textbox":
            let textbox = new fabric.Textbox("Text here", {
              fontFamily: "Arial",
              stroke: toRGBA(
                this.strokeColor.value,
                this.strokeColorTransparent.value
              ),
              fill: toRGBA(
                this.fillColor.value,
                this.fillColorTransparent.value
              ),
              strokeWidth: 1,
            });
            this.strokeWidth.value = +textbox.strokeWidth;
            this.canvas.add(textbox).setActiveObject(textbox);
            this.canvas.isDrawingMode = false;
            this.drawning = false;
            break;
          default:
            this.canvas.isDrawingMode = false;
            this.drawning = true;
            break;
        }
        this.selectPropertyToolbar(this.type);
        this.setActiveElement(target, this.painter_shapes_box);
      }
    };

    // Button Mode select
    this.change_mode.onclick = (e) => this.changeMode(e);

    // Buttons Lock events
    const stackPositionObjects = (tool, target) => {
      let a_object = this.canvas.getActiveObject();
      if (tool) {
        switch (tool) {
          case "zpos_BringForward":
            this.canvas.bringForward(a_object);
            break;
          case "zpos_BringToFront":
            this.canvas.bringToFront(a_object);
            break;
          case "zpos_SendToBack":
            this.canvas.sendToBack(a_object);
            break;
          case "zpos_SendBackwards":
            this.canvas.sendBackwards(a_object);
            break;
          case "zpos_BringFrontSelected":
            this.bringFrontSelected = !this.bringFrontSelected;
            target.classList.toggle("active");
            break;
        }
        this.canvas.renderAll();
      }
    };

    // Manipulation box events
    this.manipulation_box.onclick = (e) => {
      let target = e.target,
        listButtons = [
          ...Object.keys(this.locks),
          "zpos_BringForward",
          "zpos_BringToFront",
          "zpos_SendToBack",
          "zpos_SendBackwards",
          "zpos_BringFrontSelected",
        ],
        index = listButtons.indexOf(target.id);
      if (index != -1) {
        if (
          listButtons[index].includes("_Send") ||
          listButtons[index].includes("_Bring")
        ) {
          stackPositionObjects(listButtons[index], target);
        } else {
          let buttonSel = listButtons[index];
          this.locks[buttonSel] = !this.locks[buttonSel];
          target.classList.toggle("active");
        }
      }
    };

    // Drawning box property box events
    this.getActiveStyle = (styleName, object) => {
      object = object || this.canvas.getActiveObject();
      if (!object) return "";

      return object.getSelectionStyles && object.isEditing
        ? object.getSelectionStyles()[styleName] || ""
        : object[styleName] || "";
    };

    this.setActiveStyle = (styleName, value, object) => {
      object = object || this.canvas.getActiveObject();
      if (!object) return;

      if (object.setSelectionStyles && object.isEditing) {
        var style = {};
        style[styleName] = value;
        object.setSelectionStyles(style);
        object.setCoords();
      } else {
        object.set(styleName, value);
      }

      object.setCoords();
      this.canvas.requestRenderAll();
    };

    this.painter_drawning_box_property.onclick = (e) => {
      const listButtonsStyles = [
        "prop_fontStyle",
        "prop_fontWeight",
        "prop_underline",
        "prop_brushDefault",
        // Symmetry
        "prop_BrushSymmetry",
        "prop_symmetry_",
      ];

      let { target, currentTarget } = e;
      while (target.tagName !== "BUTTON") {
        target = target.parentElement;
        if (target === currentTarget) return;
      }

      const index = listButtonsStyles.indexOf(target.dataset.prop);
      if (index != -1) {
        if (listButtonsStyles[index].includes("prop_")) {
          const buttonSelStyle = listButtonsStyles[index].replace("prop_", ""),
            activeOb = this.canvas.getActiveObject();

          if (activeOb?.type === "textbox") {
            switch (buttonSelStyle) {
              case "fontWeight":
                if (this.getActiveStyle("fontWeight") == "bold") {
                  this.setActiveStyle(buttonSelStyle, "");
                  target.classList.remove("active");
                } else {
                  this.setActiveStyle(buttonSelStyle, "bold");
                  target.classList.add("active");
                }
                break;
              case "fontStyle":
                if (this.getActiveStyle("fontStyle") == "italic") {
                  this.setActiveStyle(buttonSelStyle, "");
                  target.classList.remove("active");
                } else {
                  this.setActiveStyle(buttonSelStyle, "italic");
                  target.classList.add("active");
                }
                break;
              case "underline":
                if (Boolean(this.getActiveStyle("underline"))) {
                  this.setActiveStyle("underline", false);
                  target.classList.remove("active");
                } else {
                  this.setActiveStyle("underline", true);
                  target.classList.add("active");
                }

                this.fillColorTransparent.value = "1.0";
                this.setActiveStyle("fill", toRGBA(this.fillColor.value));
                break;
            }
          }

          // Default brush
          if (target.parentElement?.classList.contains("property_brushesBox")) {
            Array.from(target.parentElement.children).forEach((b) =>
              b.classList.remove("active")
            );
            if (buttonSelStyle === "brushDefault") {
              this.canvas.isDrawingMode = true;
              this.drawning = true;
              this.type = "Brush";

              if (this.property_brushesSecondBox) {
                this.property_brushesSecondBox.innerHTML = "";
              }

              this.changePropertyBrush(this.type);
              this.setActiveElement(target, this.painter_shapes_box);
            }

            // Symmetry
            if (buttonSelStyle === "BrushSymmetry") {
              this.canvas.isDrawingMode = true;
              this.drawning = true;
              this.type = "BrushSymmetry";

              if (this.property_brushesSecondBox) {
                this.createToolbarOptions(this.type);
              }

              this.changePropertyBrush(this.type);
              this.setActiveElement(target, this.painter_shapes_box);
            }
          }
        }
      }

      // Second toolbar options
      if (
        target.parentElement?.classList.contains("property_brushesSecondBox")
      ) {
        const options = this.canvas.freeDrawingBrush?._options;
        if (options) {
          const optionsKeys = Object.keys(options);
          const optionKeyChange = optionsKeys[target.optindex];

          options[optionKeyChange].enable = !options[optionKeyChange].enable;
          this.symmetryBrushOptionsCopy = this.canvas.freeDrawingBrush._options;
          target.classList.toggle("active");
        }
      }
    };
    // Event input bgcolor
    this.reset_set_bg = () => {
      this.canvas.setBackgroundImage(null);
      this.canvas.backgroundColor = this.bgColor.value;
      this.canvas.renderAll();
      this.uploadPaintFile(this.node.name);
    };

    const fileReaderFunc = (e, func) => {
      let file = e.target.files[0],
        reader = new FileReader();

      reader.onload = (f) => {
        let data = f.target.result;
        fabric.Image.fromURL(data, (img) => func(img));
      };
      reader.readAsDataURL(file);
    };

    this.bgColor.oninput = this.reset_set_bg;

    // Event input bg image
    this.bgImageFile.onchange = (e) => {
      fileReaderFunc(e, this.bgImageFile.func);
    };

    this.traBackground.addEventListener("click", () => {
      this.traBackgroundColor();
    });

    this.buttonClearCanvas.addEventListener("click", () => {
      this.list_objects_panel__items.innerHTML = "";
      this.clearCanvas();
    });

    // this.painter_bg_setting.onclick = (e) => {
    //   let target = e.target;
    //   if (target.hasAttribute("bgImage")) {
    //     let typeEvent = target.getAttribute("bgImage");
    //     switch (typeEvent) {
    //       case "img_load":
    //         this.bgImageFile.func = (img) => {
    //           if (confirm("Change canvas size equal image?")) {
    //             this.setCanvasSize(img.width, img.height);
    //           }

    //           this.canvas.setBackgroundImage(
    //             img,
    //             () => {
    //               this.canvas.renderAll();
    //               this.uploadPaintFile(this.node.name);
    //               this.bgImageFile.value = "";
    //             },
    //             {
    //               scaleX: this.canvas.width / img.width,
    //               scaleY: this.canvas.height / img.height,
    //               strokeWidth: 0,
    //             }
    //           );
    //         };
    //         this.bgImageFile.click();
    //         break;
    //       case "img_reset":
    //         this.reset_set_bg();
    //         break;
    //     }
    //   }
    // };

    // Settings
    // this.buttonSetCanvasSize.addEventListener("click", () => {
    //   function checkSized(prop = "", defaultVal = 512) {
    //     let inputSize;
    //     let correct = false;
    //     while (!correct) {
    //       inputSize = +prompt(`Enter canvas ${prop}:`, defaultVal);
    //       if (
    //         Number(inputSize) === inputSize &&
    //         inputSize % 1 === 0 &&
    //         inputSize > 0
    //       ) {
    //         return inputSize;
    //       }
    //       alert(`[${prop}] Invalid number "${inputSize}" or <=0!`);
    //     }
    //   }

    //   let width = checkSized("width", this.currentCanvasSize.width),
    //     height = checkSized("height", this.currentCanvasSize.height);

    //   this.setCanvasSize(width, height);
    //   this.uploadPaintFile(this.node.name);
    // });

    // History undo, redo
    this.undo_button.onclick = (e) => {
      this.undo();
    };
    this.redo_button.onclick = (e) => {
      this.redo();
    };

    // Event inputs stroke, fill colors and transparent
    this.strokeColorTransparent.oninput =
      this.strokeColor.oninput =
      this.fillColor.oninput =
      this.fillColorTransparent.oninput =
        () => {
          if (
            ["Brush", "Textbox", "BrushSymmetry", "Image", "Erase"].includes(
              this.type
            ) ||
            !this.drawning
          ) {
            this.changePropertyBrush(this.type);
          }
        };

    this.strokeColorTransparent.onchange =
      this.strokeColor.onchange =
      this.fillColor.onchange =
      this.fillColorTransparent.onchange =
        () => {
          if (this.canvas.getActiveObject()) {
            this.uploadPaintFile(this.node.name);
          }
        };

    //this.bgColor.onchange = () => this.uploadPaintFile(this.node.name);

    // Event change stroke and erase width
    this.eraseWidth.onchange = () => {
      if (["Erase"].includes(this.type) || !this.drawning) {
        this.changePropertyBrush(this.type);
      }
    };

    this.strokeWidth.onchange = () => {
      if (
        ["Brush", "BrushSymmetry", "Textbox", "Image"].includes(this.type) ||
        !this.drawning
      ) {
        this.changePropertyBrush(this.type);
      }

      if (this.canvas.getActiveObject()) {
        this.uploadPaintFile(this.node.name);
      }
    };

    this.setInputsStyleObject = () => {
      let targets = this.canvas.getActiveObjects();
      if (!targets || targets.length == 0) return;

      // Selected tools
      const setProps = (style, check) => {
        const propEl = this.painter_drawning_box_property.querySelector(
          `#prop_${style}`
        );

        if (propEl) propEl.classList[check ? "remove" : "add"]("active");
      };

      targets.forEach((target) => {
        if (target.type == "textbox") {
          setProps(
            "fontWeight",
            this.getActiveStyle("fontWeight", target) == "normal"
          );
          setProps(
            "fontStyle",
            this.getActiveStyle("fontStyle", target) == "normal"
          );
          setProps(
            "underline",
            Boolean(this.getActiveStyle("underline", target)) == false
          );
        }

        if (
          !this.drawning &&
          !["Erase", "Brush", "BrushSymmetry"].includes(target.type)
        ) {
          this.strokeWidth.value = parseInt(
            this.getActiveStyle("strokeWidth", target),
            10
          );

          let { color: strokeColor, alpha: alpha_stroke } = getColorHEX(
              this.getActiveStyle("stroke", target)
            ),
            { color: fillColor, alpha: alpha_fill } = getColorHEX(
              this.getActiveStyle("fill", target)
            );

          this.strokeColor.value = strokeColor;
          this.strokeColorTransparent.value = alpha_stroke;

          this.fillColor.value = fillColor;
          this.fillColorTransparent.value = alpha_fill;
        }
      });
      this.canvas.renderAll();
    };

    // ----- Canvas Events -----
    this.canvas.on({
      "selection:created": (o) => {
        this.setInputsStyleObject();
      },
      "selection:updated": (o) => {
        this.setInputsStyleObject();
      },
      // Mouse button down event
      "mouse:down": (o) => {
        if (!this.canvas.isDrawingMode && this.bringFrontSelected)
          this.canvas.bringToFront(this.canvas.getActiveObject());

        this.canvas.isDrawingMode = this.drawning;
        if (!this.canvas.isDrawingMode) return;

        if (["Brush", "Erase", "BrushSymmetry"].includes(this.type)) return;

        if (this.type != "Textbox") {
          let { x: left, y: top } = this.canvas.getPointer(o.e),
            colors = ["red", "blue", "green", "yellow", "purple", "orange"],
            strokeWidth = +this.strokeWidth.value,
            stroke =
              strokeWidth == 0
                ? "transparent"
                : toRGBA(
                    this.strokeColor.value,
                    this.strokeColorTransparent.value
                  ) || colors[Math.floor(Math.random() * colors.length)],
            fill = toRGBA(
              this.fillColor.value,
              this.fillColorTransparent.value
            ),
            shape = this.shapeCreate({
              type: this.type,
              left,
              top,
              stroke,
              fill,
              strokeWidth,
              points: [left, top, left, top],
            })
            ;

          this.originX = left;
          this.originY = top;

          if (shape) {
            this.canvas.add(shape).renderAll().setActiveObject(shape);
          }
        }
      },

      // Mouse move event
      "mouse:move": (o) => {
        if (!this.drawning) {
          try {
            let activeObjManipul = this.canvas.getActiveObject();
            activeObjManipul.hasControls = true;
            activeObjManipul.lockScalingX = this.locks.lockScalingX;
            activeObjManipul.lockScalingY = this.locks.lockScalingY;
            activeObjManipul.lockRotation = this.locks.lockRotation;

            if (!activeObjManipul.isEditing) {
              activeObjManipul.lockMovementX = this.locks.lockMovementX;
              activeObjManipul.lockMovementY = this.locks.lockMovementY;
            }
          } catch (e) {}
        }
        if (!this.canvas.isDrawingMode) {
          return;
        }

        if (["Brush", "Erase", "BrushSymmetry"].includes(this.type)) return;

        let pointer = this.canvas.getPointer(o.e),
          activeObj = this.canvas.getActiveObject();

        if (!activeObj) return;

        if (this.originX > pointer.x) {
          activeObj.set({ left: pointer.x });
        }
        if (this.originY > pointer.y) {
          activeObj.set({ top: pointer.y });
        }

        if (this.type == "Circle") {
          let radius =
            Math.max(
              Math.abs(this.originY - pointer.y),
              Math.abs(this.originX - pointer.x)
            ) / 2;
          if (radius > activeObj.strokeWidth)
            radius -= activeObj.strokeWidth / 2;
          activeObj.set({ radius: radius });
        } else if (this.type == "Line") {
          activeObj.set({ x2: pointer.x, y2: pointer.y });
        } else {
          activeObj.set({ width: Math.abs(this.originX - pointer.x) });
          activeObj.set({ height: Math.abs(this.originY - pointer.y) });
        }

        this.canvas.renderAll();
      },

      // Mouse button up event
      "mouse:up": (o) => {
        this.canvas._objects.forEach((object) => {
          if (!object.hasOwnProperty("controls")) {
            object.controls = {
              ...object.controls,
              removeControl: new fabric.Control({
                x: 0.5,
                y: -0.5,
                offsetY: -16,
                offsetX: 16,
                cursorStyle: "pointer",
                mouseUpHandler: removeObject.bind(this),
                render: renderIcon(removeImg),
                cornerSize: 24,
              }),
            };
          }
        });

        this.canvas.getActiveObject()?.setCoords();
        this.canvas.getActiveObjects()?.forEach((a) => a.setCoords());

        if (
          !["Brush", "Erase", "BrushSymmetry", "Image", "Textbox"].includes(
            this.type
          )
        )
          this.canvas.isDrawingMode = false;

        this.addToHistory();
        this.canvas.renderAll();
        this.uploadPaintFile(this.node.name);
      },

      // Object moving event
      "object:moving": (o) => {
        this.canvas.isDrawingMode = false;
      },

      // Object modify event
      "object:modified": () => {
        this.canvas.isDrawingMode = false;
        this.canvas.renderAll();
        this.uploadPaintFile(this.node.name);
      },
    });
    // ----- Canvas Events -----
  }

  addToHistory() {
    // Undo / rendo
    const objs = this.canvas.toJSON();

    if (this.undo_history.length > this.max_history_steps) {
      this.undo_history.shift();
      console.log(
        `[Info ${this.node.name}]: History saving step limit reached! Limit steps = ${this.max_history_steps}.`
      );
    }
    this.undo_history.push(objs);
    this.redo_history = [];
    if (this.undo_history.length) {
      this.undo_button.disabled = false;
    }
  }

  // Save canvas data to localStorage or JSON
  canvasSaveSettingsPainter() {
    try {
      const data = this.canvas.toJSON();
      if (LS_Painters && LS_Painters.hasOwnProperty(this.node.name)) {
        LS_Painters[this.node.name].canvas_settings = painters_settings_json
          ? data
          : JSON.stringify(data);

        LS_Painters[this.node.name].settings["currentCanvasSize"] =
          this.currentCanvasSize;

        LS_PSave();
      }
    } catch (e) {
      console.error(e);
    }
  }

  setCanvasLoadData(data) {
    const obj_data =
      typeof data === "string" || data instanceof String
        ? JSON.parse(data)
        : data;

    const canvas_settings = data.canvas_settings;
    const settings = data.settings;

    this.canvas.loadFromJSON(canvas_settings, () => {
      this.canvas.renderAll();
      //this.bgColor.value = getColorHEX(data.background).color || "";
    });
  }

  undoRedoLoadData(data) {
    this.canvas.loadFromJSON(data, () => {
      this.canvas.renderAll();
      //this.bgColor.value = getColorHEX(data.background).color || "";
    });
  }

  // Load canvas data from localStorage or JSON
  canvasLoadSettingPainter() {
    try {
      if (
        LS_Painters &&
        LS_Painters.hasOwnProperty(this.node.name) &&
        LS_Painters[this.node.name].hasOwnProperty("canvas_settings")
      ) {
        const data =
          typeof LS_Painters[this.node.name] === "string" ||
          LS_Painters[this.node.name] instanceof String
            ? JSON.parse(LS_Painters[this.node.name])
            : LS_Painters[this.node.name];
        this.setCanvasLoadData(data);
        this.addToHistory();
      }
    } catch (e) {
      console.error(e);
    }
  }

  undo() {
    if (this.undo_history.length > 0) {
      this.undo_button.disabled = false;
      this.redo_button.disabled = false;
      this.redo_history.push(this.undo_history.pop());

      const content = this.undo_history[this.undo_history.length - 1];
      this.undoRedoLoadData(content);
      this.canvas.renderAll();
    } else {
      this.undo_button.disabled = true;
    }
  }

  redo() {
    if (this.redo_history.length > 0) {
      this.redo_button.disabled = false;
      this.undo_button.disabled = false;

      const content = this.redo_history.pop();
      this.undo_history.push(content);
      this.undoRedoLoadData(content);
      this.canvas.renderAll();
    } else {
      this.redo_button.disabled = true;
    }
  }

  showImage(name) {
    let img = new Image();
    img.onload = () => {
      this.node.imgs = [img];
      app.graph.setDirtyCanvas(true);
    };

    let folder_separator = name.lastIndexOf("/");
    let subfolder = "";
    if (folder_separator > -1) {
      subfolder = name.substring(0, folder_separator);
      name = name.substring(folder_separator + 1);
    }

    img.src = api.apiURL(
      `/view?filename=${name}&type=input&subfolder=${subfolder}${app.getPreviewFormatParam()}&${new Date().getTime()}`
    );
    this.node.setSizeForImage?.();
  }

  uploadPaintFile(fileName) {
    // Upload paint to temp folder ComfyUI
    let activeObj = null;
    if (!this.canvas.isDrawingMode) {
      activeObj = this.canvas.getActiveObject();

      if (activeObj) {
        activeObj.hasControls = false;
        activeObj.hasBorders = false;
        this.canvas.getActiveObjects().forEach((a_obs) => {
          a_obs.hasControls = false;
          a_obs.hasBorders = false;
        });
        this.canvas.renderAll();
      }
    }

    const uploadFile = async (blobFile) => {
      try {
        const resp = await fetch("/upload/image", {
          method: "POST",
          body: blobFile,
        });

        if (resp.status === 200) {
          const data = await resp.json();

          if (!this.image.options.values.includes(data.name)) {
            this.image.options.values.push(data.name);
          }

          this.image.value = data.name;
          this.showImage(data.name);

          if (activeObj && !this.drawning) {
            activeObj.hasControls = true;
            activeObj.hasBorders = true;

            this.canvas.getActiveObjects().forEach((a_obs) => {
              a_obs.hasControls = true;
              a_obs.hasBorders = true;
            });
            this.canvas.renderAll();
          }
          this.canvasSaveSettingsPainter();
        } else {
          alert(resp.status + " - " + resp.statusText);
        }
      } catch (error) {
        console.log(error);
      }
    };

    this.canvas.lowerCanvasEl.toBlob(function (blob) {
      let formData = new FormData();
      formData.append("image", blob, fileName);
      formData.append("overwrite", "true");
      //formData.append("type", "temp");
      uploadFile(formData);
    }, "image/png");
    // - end

    const callb = this.node.callback,
      self = this;
    this.image.callback = function () {
      self.image.value = self.node.name;
      if (callb) {
        return callb.apply(this, arguments);
      }
    };
  }
}
// ================= END CLASS PAINTER ================

// ================= CREATE PAINTER WIDGET ============
export function PainterWidget(node, inputName, inputData, app) {
  node.name = inputName;
  const widget = {
    type: "painter_widget",
    name: `painter${inputName}`,
    value:'',
    callback: () => {},
    draw: function (ctx, parentNode, widgetWidth, y, widgetHeight) {
      const margin = 10,
        visible = app.canvas.ds.scale > 0.5 && this.type === "painter_widget",
        clientRectBound = ctx.canvas.getBoundingClientRect(),
        transform = new DOMMatrix()
          .scaleSelf(
            clientRectBound.width / ctx.canvas.width,
            clientRectBound.height / ctx.canvas.height
          )
          .multiplySelf(ctx.getTransform())
          .translateSelf(margin, margin + y),
          w = (widgetWidth - margin * 2 - 3) * transform.a,
        scale = new DOMMatrix().scaleSelf(transform.a, transform.d);

      let h=w/this.painter_wrap.children[0].width*this.painter_wrap.children[0].height

      let aspect_ratio = 1;
      if (node?.imgs && typeof node.imgs !== undefined) {
        aspect_ratio = node.imgs[0].naturalHeight / node.imgs[0].naturalWidth;
      }
      Object.assign(this.painter_wrap.style, {
        left: `${parentNode.openPose.canvas.lowerCanvasEl.parentElement.offsetLeft}px`,
        top: `${parentNode.openPose.canvas.lowerCanvasEl.parentElement.offsetTop}px`,
        width: w + "px",
        height: h + "px",
        position: "absolute",
        display: parentNode.painter.disabled ? "none":"block" ,
        zIndex: app.graph._nodes.indexOf(node),
      });

      Object.assign(this.painter_wrap.children[0].style, {
        //transformOrigin: "0 0",
        //transform: scale,
        width: w + "px",
        height: h + "px",
      });

      Object.assign(this.painter_wrap.children[1].style, {
        //transformOrigin: "0 0",
        //transform: scale,
        width: w + "px",
        height: h + "px",
      });

      Array.from(
        this.painter_wrap.children[2].querySelectorAll(
          "input, button, input:after, span, div.painter_drawning_box"
        )
      ).forEach((element) => {
        if (element.type == "number") {
          Object.assign(element.style, {
            width: `${40 * transform.a}px`,
            height: `${21 * transform.d}px`,
            fontSize: `${transform.d * 10.0}px`,
          });
        } else if (element.tagName == "SPAN") {
          // NOPE
        } else if (element.tagName == "DIV") {
          Object.assign(element.style, {
            width: `${88 * transform.a}px`,
            left: `${-90 * transform.a}px`,
          });
        } else {
          let sizesEl = { w: 25, h: 25, fs: 10 };

          if (element.id.includes("lock")) sizesEl = { w: 75, h: 15, fs: 10 };
          if (element.id.includes("zpos")) sizesEl = { w: 80, h: 15, fs: 7 };
          if (
            ["painter_change_mode", "clearCanvas"].includes(element.id)
          )
            sizesEl.w = 75;
          if (element.hasAttribute("painter_object"))
            sizesEl = { w: 58, h: 16, fs: 10 };
          if (element.hasAttribute("bgImage"))
            sizesEl = { w: 60, h: 20, fs: 10 };

          Object.assign(element.style, {
            cursor: "pointer",
            width: `${sizesEl.w * transform.a}px`,
            height: `${sizesEl.h * transform.d}px`,
            fontSize: `${transform.d * sizesEl.fs}px`,
          });
        }
      });
      this.painter_wrap.hidden = !visible;
    },
  };

  // Fabric canvas
  let canvasPainter = document.createElement("canvas");
  node.painter = new Painter(node, canvasPainter);

  node.painter.canvas.setWidth(node.painter.currentCanvasSize.width);
  node.painter.canvas.setHeight(node.painter.currentCanvasSize.height);

  widget.painter_wrap = node.painter.canvas.wrapperEl;
  widget.parent = node;

  Object.defineProperty(widget, "value", {
    set: (x) => {
      if (x == "") return;
      let data=JSON.parse(x)
      node.painter.undo_history.push(data);
      node.painter.undoRedoLoadData(data);
      node.painter.canvas.renderAll();
    },
    get: () => {
      const objs = node.painter.canvas.toJSON();
      return JSON.stringify(objs);
    }
  });

  node.painter.makeElements();

  let parentNode = document.createElement("div");
  parentNode.appendChild(widget.painter_wrap)
  app.canvasContainer.appendChild(parentNode)

  // node.addWidget("button", "清除画布", "clear_painer", () => {
  //   node.painter.list_objects_panel__items.innerHTML = "";
  //   node.painter.clearCanvas();
  // });

  // Add customWidget to node
  node.addCustomWidget(widget);

  // node.onRemoved = () => {
  //   if (Object.hasOwn(LS_Painters, node.name)) {
  //     delete LS_Painters[node.name];
  //     LS_Save();
  //   }

  //   // When removing this node we need to remove the input from the DOM
  //   for (let y in node.widgets) {
  //     if (node.widgets[y].painter_wrap) {
  //       node.widgets[y].painter_wrap.remove();
  //     }
  //   }
  // };

  // widget.onRemove = () => {
  //   widget.painter_wrap?.remove();
  // };

  node.onResize = function () {
    let [w, h] = this.size;
    let aspect_ratio = 1;
    aspect_ratio = node.painter.currentCanvasSize.height/node.painter.currentCanvasSize.width;

    if (node?.imgs && typeof this.imgs !== undefined) {
      aspect_ratio = this.imgs[0].naturalHeight / this.imgs[0].naturalWidth;
    }
    let buffer = 350;
    if (w > this.painter.maxNodeSize) w = w - (w - this.painter.maxNodeSize);
    if (w < 600) w = 600;

    h = w * aspect_ratio + buffer;

    this.size = [w, h];
  };

  node.onDrawBackground = function (ctx) {
    if (!this.flags.collapsed) {
      node.painter.canvas.wrapperEl.hidden = false;
      if (this.imgs && this.imgs.length) {
        if (app.canvas.ds.scale > 0.8) {
          let [dw, dh] = this.size;

          let w = this.imgs[0].naturalWidth;
          let h = this.imgs[0].naturalHeight;

          const scaleX = dw / w;
          const scaleY = dh / h;
          const scale = Math.min(scaleX, scaleY, 1);

          w *= scale / 8;
          h *= scale / 8;

          let x = 5;
          let y = dh - h - 5;

          ctx.drawImage(this.imgs[0], x, y, w, h);
          ctx.font = "10px serif";
          ctx.strokeStyle = "white";
          ctx.strokeRect(x, y, w, h);
          ctx.fillStyle = "rgba(255,255,255,0.7)";
          ctx.fillText("Mask", w / 2, dh - 10);
        }
      }
    } else {
      node.painter.canvas.wrapperEl.hidden = true;
    }
  };

  app.canvas.onDrawBackground = function () {
    // Draw node isnt fired once the node is off the screen
    // if it goes off screen quickly, the input may not be removed
    // this shifts it off screen so it can be moved back if the node is visible.
    for (let n in app.graph._nodes) {
      const currnode = app.graph._nodes[n];
      for (let w in currnode.widgets) {
        let wid = currnode.widgets[w];
        if (Object.hasOwn(wid, "painter_widget")) {
          wid.painter_wrap.style.left = -8000 + "px";
          wid.painter_wrap.style.position = "absolute";
        }
      }
    }
  };

  return { widget: widget };
}
// ================= END CREATE PAINTER WIDGET ============

// ================= CREATE EXTENSION ================
async function saveData() {
  try {
    const rawResponse = await fetch("/lam/save_node_settings", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(LS_Painters),
    });
    if (rawResponse.status !== 200)
      throw new Error(`Error painter save settings: ${rawResponse.statusText}`);
  } catch (e) {
    console.log(`Error painter save settings: ${e}`);
  }
}

export async function loadData() {
  try {
    const rawResponse = await api.fetchApi("/alekpet/loading_node_settings");
    if (rawResponse.status !== 200)
      throw new Error(`Error painter save settings: ${rawResponse.statusText}`);

    const data = await rawResponse?.json();
    if (!data) return {};

    return data.settings_nodes;
  } catch (e) {
    console.log(`Error painter load settings: ${e}`);
    return {};
  }
}

export function createMessage(title, decriptions, parent, func) {
  const message = document.createElement("div");
  message.className = "show_message_info";
  message.style = `width: 300px;
position: absolute;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
display: flex;
background: #3b2222;
z-index: 9999;
justify-content: center;
flex-direction: column;
align-items: stretch;
text-align: center;
border-radius: 6px;
box-shadow: 3px 3px 6px #141414;
border: 1px solid #f91b1b;
color: white; 
padding: 6px;
opacity: .8;
font-family: sans-serif;
line-height: 1.5`;
  message.innerHTML = `<div style="background: #8f210f; padding: 5px; border-radius: 6px; margin-bottom: 5px;">${title}</div><div>${decriptions}</div>`;
  parent && parent?.nodeType && parent.nodeType === 1
    ? parent.appendChild(message)
    : document.body.appendChild(message);

  if (func && typeof func === "function") {
    func.apply();
  }

  return message;
}
