import { mat4, mult, flatten, rotate, vec3, scalem } from "./libs/MV.js";

/**
 * @typedef {Object} DrawInfo
 * @property {Object} primitive - The primitive to draw.
 * @property {number[]} color - The color of the primitive.
 * @property {string} currentMode - The current drawing mode.
 * @property {boolean} outline - Whether to draw the outline.
 * @property {boolean} alphaBlending - Whether to use alpha blending.
 */

export default class Node {
  constructor() {
    this.children = [];
    this.localMatrix = mat4(); // Identity matrix
    this.worldMatrix = mat4(); // Identity matrix
    this.parent = null;
    /** @type {DrawInfo|null} */
    this.drawInfo = null;
    this.rotation = 0;
    this.needsMatrixUpdate = true; // Track if matrix needs updating
  }

  setParent(parent) {
    if (this.parent) {
      const ndx = this.parent.children.indexOf(this);
      if (ndx >= 0) this.parent.children.splice(ndx, 1);
    }
    if (parent) parent.children.push(this);
    this.parent = parent;
    this.needsMatrixUpdate = true;
  }

  updateWorldMatrix(parentWorldMatrix) {
    if (!this.needsMatrixUpdate && !parentWorldMatrix) return;

    this.worldMatrix = parentWorldMatrix
      ? mult(parentWorldMatrix, this.localMatrix)
      : this.localMatrix;

    this.children.forEach((child) => child.updateWorldMatrix(this.worldMatrix));
    this.needsMatrixUpdate = false;
  }

  draw(gl, program) {
    if (this.drawInfo) {
      const u_base_color = gl.getUniformLocation(program, "u_base_color");
      const u_model_view = gl.getUniformLocation(program, "u_model_view");

      gl.uniform4fv(u_base_color, this.drawInfo.color || [1, 0, 0, 1]);
      gl.uniformMatrix4fv(u_model_view, false, flatten(this.worldMatrix));
      
      if (this.drawInfo.alphaBlending) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      }

      this.drawInfo.primitive.draw(gl, program, this.drawInfo.currentMode);

      if(this.drawInfo.outline && this.drawInfo.outline === true || this.drawInfo.outline === undefined) {
        if (this.drawInfo.currentMode !== gl.LINES) {
          gl.uniform4fv(u_base_color, [0, 0, 0, 1]);
          this.drawInfo.primitive.draw(gl, program, gl.LINES);
        }
      }
      
      if (this.drawInfo.alphaBlending) {
        gl.disable(gl.BLEND);
      }
    }

    this.children.forEach((child) => child.draw(gl, program));
  }

  translate(x, y, z) {
    const translation = mat4();
    translation[0][3] = x;
    translation[1][3] = y;
    translation[2][3] = z;
    this.localMatrix = mult(translation, this.localMatrix);
    this.needsMatrixUpdate = true;
  }

  rotateX(angle) {
    const rotation = rotate(angle, vec3(1, 0, 0));
    this.localMatrix = mult(rotation, this.localMatrix);
    this.needsMatrixUpdate = true;
  }

  rotateY(angle) {
    const rotation = rotate(angle, vec3(0, 1, 0));
    this.localMatrix = mult(rotation, this.localMatrix);
    this.needsMatrixUpdate = true;
  }

  rotateZ(angle) {
    const rotation = rotate(angle, vec3(0, 0, 1));
    this.localMatrix = mult(rotation, this.localMatrix);
    this.needsMatrixUpdate = true;
  }

  scale(x, y, z) {
    const scaling = scalem(x, y, z);
    this.localMatrix = mult(scaling, this.localMatrix);
    this.needsMatrixUpdate = true;
  }
}
