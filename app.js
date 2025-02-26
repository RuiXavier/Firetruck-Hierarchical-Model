import { lookAt, ortho, mat4, vec3, flatten, normalMatrix } from "/libs/MV.js";
import {
	loadShadersFromURLS,
	buildProgramFromSources,
	setupWebGL,
} from "/libs/utils.js";
import { modelView, loadMatrix } from "/libs/stack.js";

import * as CUBE from "/libs/objects/cube.js";
import * as SPHERE from "/libs/objects/sphere.js";
import * as CYLINDER from "/libs/objects/cylinder.js";
import * as PYRAMID from "/libs/objects/pyramid.js";
import * as TORUS from "/libs/objects/torus.js";

import Node from "/graphNode.js";

import * as CONSTANTS from "/constants.js";

const DIST = 10;

let theta = CONSTANTS.DEFAULT_THETA;
let gamma = CONSTANTS.DEFAULT_GAMMA;

let all_views = true;

let big_view, front_view, left_view, top_view, axo_view;

let projection = mat4();

let zoom = CONSTANTS.DEFAULT_ZOOM;
let aspect = 1.0;

let currentMode = CONSTANTS.DRAW_DEFAULT_MODE;

let translation = CONSTANTS.DEFAULT_TRANSLATION;
let wheelRotation = CONSTANTS.DEFAULT_ROTATION;

let blinker_color = CONSTANTS.COLORS.GREY;

let lightColor = CONSTANTS.COLORS.GREY;

let sirenColor = CONSTANTS.COLORS.GREY;

let sirenInterval;

let blinker_interval;

let ladder_user_offset_x = 0.1;
let ladder_user_angle = 0;
let ladder_user_tilt = 0;

let isRollingUp = CONSTANTS.IS_ROLLING_UP_DEFAULT;
let rollUpProgress = CONSTANTS.DEFAULT_ROLL_UP;

// Initialize the front view looking from the front of the truck
front_view = lookAt(
	vec3(0, CONSTANTS.CAMERA_OFFSET, DIST),
	vec3(0, CONSTANTS.CAMERA_OFFSET, 0),
	vec3(0, 1, 0)
);

// Initialize the top view looking down from above the truck
top_view = lookAt(vec3(0, DIST, 0), vec3(0, 0, 0), vec3(0, 0, -1));

// Initialize the left view looking from the left side of the truck
left_view = lookAt(
	vec3(-DIST, CONSTANTS.CAMERA_OFFSET, 0),
	vec3(0, CONSTANTS.CAMERA_OFFSET, 0),
	vec3(0, 1, 0)
);

// Initialize the axonometric view with default angles
axo_view = calculateAxoView(CONSTANTS.DEFAULT_THETA, CONSTANTS.DEFAULT_GAMMA);

// Set the initial big view to the front view
big_view = front_view;

/** @type{WebGL2RenderingContext} */
let gl;

/** @type{WebGLProgram} */
let program;

/** @type{HTMLCanvasElement} */
let canvas;

function updateModelView(gl, program, modelView) {
	const u_model_view = gl.getUniformLocation(program, "u_model_view");
	gl.uniformMatrix4fv(u_model_view, false, flatten(modelView));
	const u_normals = gl.getUniformLocation(program, "u_normals");
	gl.uniformMatrix4fv(u_normals, false, flatten(normalMatrix(modelView)));
}

function updateProjection(gl, program, projection) {
	const u_projection = gl.getUniformLocation(program, "u_projection");
	gl.uniformMatrix4fv(u_projection, false, flatten(projection));
}

/**
 * Toggles the view mode between showing all views and showing a single view.
 *
 * This function switches the `all_views` variable between true and false,
 * determining whether all views are displayed or just one.
 */
function toggle_view_mode() {
	all_views = !all_views;
}

function resize() {
	canvas.height = window.innerHeight;
	canvas.width = window.innerWidth;

	aspect = window.innerWidth / window.innerHeight;
}

function initialize_objects() {
	CUBE.init(gl);
	SPHERE.init(gl);
	CYLINDER.init(gl);
	PYRAMID.init(gl);
	TORUS.init(gl, 30, 30, 0.8, 0.2);
}

/**
 * Handles key down events and performs corresponding actions.
 *
 * This function maps specific keys to actions such as toggling view modes,
 * adjusting angles, resetting zoom, and translating the truck. When a key
 * is pressed, the corresponding action is executed.
 *
 * @param {KeyboardEvent} event - The keyboard event object.
 */
function handle_key_down(event) {
	const actions = {
		0: toggle_view_mode,
		1: () => set_big_view(front_view),
		2: () => set_big_view(left_view),
		3: () => set_big_view(top_view),
		4: () => set_big_view(axo_view),
		" ": () => toggle_render_mode(),
		ArrowRight: () => adjust_theta(CONSTANTS.ANGLE_INCREMENT),
		ArrowLeft: () => adjust_theta(-CONSTANTS.ANGLE_INCREMENT),
		ArrowUp: () => adjust_gamma(CONSTANTS.ANGLE_INCREMENT),
		ArrowDown: () => adjust_gamma(-CONSTANTS.ANGLE_INCREMENT),
		r: () => reset_zoom(),
		a: () => {
			calculate_wheel_rotation(
				(translation -= CONSTANTS.TRANSLATION_INCREMENT)
			);
		},
		d: () => {
			calculate_wheel_rotation(
				(translation += CONSTANTS.TRANSLATION_INCREMENT)
			);
		},
		c: () => toggleLights(),
		x: toggleSiren,
		i: toggleBlinker,
		z: () => (isRollingUp = !isRollingUp),
		o: increaseLadderUserOffset,
		p: decreaseLadderUserOffset,
		q: increaseLadderUserAngle,
		e: decreaseLadderUserAngle,
		w: decreaseLadderUserTilt,
		s: increaseLadderUserTilt,
		h: toggleHelpPanel,
	};
	if (actions[event.key]) actions[event.key]();
}

/**
 * Toggles the visibility of the help panel.
 *
 * This function finds the div with the id 'help_panel' and toggles its display
 * property between 'none' and 'block'.
 */
function toggleHelpPanel() {
	const helpPanel = document.getElementById("help_panel");
	if (helpPanel) {
		helpPanel.style.display =
			helpPanel.style.display === "none" ? "block" : "none";
	}
}

/**
 * Handles mouse wheel events to adjust the zoom level.
 *
 * This function modifies the zoom level based on the mouse wheel delta.
 * Scrolling up zooms in, and scrolling down zooms out.
 *
 * @param {WheelEvent} event - The mouse wheel event object.
 */
function handle_wheel(event) {
	zoom *= 1 + event.deltaY / 1000;
}

function main(shaders) {
	canvas = document.getElementById("gl-canvas");
	gl = setupWebGL(canvas);
	program = buildProgramFromSources(
		gl,
		shaders["shader.vert"],
		shaders["shader.frag"]
	);

	gl.clearColor(0.7, 0.7, 0.7, 1.0);

	gl.enable(gl.DEPTH_TEST);

	resize();
	window.addEventListener("keydown", handle_key_down);
	window.addEventListener("resize", resize);
	window.addEventListener("wheel", handle_wheel);

	initialize_objects();

	// This is needed to let wireframe lines to be visible on top of shaded triangles
	gl.enable(gl.POLYGON_OFFSET_FILL);
	gl.polygonOffset(1, 1);

	window.requestAnimationFrame(render);
}

function draw_scene(view) {
	gl.useProgram(program);

	projection = ortho(-aspect * zoom, aspect * zoom, -zoom, zoom, -100, 100);
	updateProjection(gl, program, projection);

	loadMatrix(view);

	const rootNode = new Node();
	rootNode.localMatrix = modelView();

	draw_floor(rootNode);
	draw_truck(rootNode);

	rootNode.updateWorldMatrix();
	rootNode.draw(gl, program);
}

function draw_views() {
	let hw = canvas.width / 2;
	let hh = canvas.height / 2;

	if (all_views) {
		// Draw on front view
		gl.viewport(0, hh, hw, hh);
		draw_scene(front_view);

		// Draw on top view
		gl.viewport(0, 0, hw, hh);
		draw_scene(top_view);

		// Draw on left view
		gl.viewport(hw, hh, hw, hh);
		draw_scene(left_view);

		// Draw of 4th view
		gl.viewport(hw, 0, hw, hh);
		draw_scene(axo_view);
	} else {
		gl.viewport(0, 0, canvas.width, canvas.height);
		draw_scene(big_view);
	}
}

function render() {
	window.requestAnimationFrame(render);
	animateRollUp();

	gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
	draw_views();
}

loadShadersFromURLS(["shader.vert", "shader.frag"]).then((shaders) =>
	main(shaders)
);

/**
 * Calculate the axonometric view matrix based on the given theta and gamma angles.
 *
 * @param {number} theta - The angle in degrees.
 * @param {number} gamma - The angle in degrees.
 * @returns {mat4} The axonometric view matrix.
 */
function calculateAxoView(theta, gamma) {
	return lookAt(
		vec3(
			DIST *
				Math.cos((theta * Math.PI) / 180) *
				Math.cos((gamma * Math.PI) / 180),
			DIST * Math.sin((gamma * Math.PI) / 180) + CONSTANTS.CAMERA_OFFSET,
			DIST *
				Math.sin((theta * Math.PI) / 180) *
				Math.cos((gamma * Math.PI) / 180)
		),
		vec3(0, CONSTANTS.CAMERA_OFFSET, 0),
		vec3(0, 1, 0)
	);
}

/**
 * Set the big view to the given view.
 *
 * @param {mat4} view - The view to set as the big view.
 */
function set_big_view(view) {
	big_view = view;
}

/**
 * Toggle the render mode between wireframe (LINES) and solid (TRIANGLES).
 */
function toggle_render_mode() {
	currentMode = currentMode === gl.TRIANGLES ? gl.LINES : gl.TRIANGLES;
}

/**
 * Update the axonometric view based on the current theta and gamma angles.
 */
function update_axo_view() {
	const newAxoView = calculateAxoView(theta, gamma);
	if (all_views) {
		axo_view = newAxoView;
	} else if (can_update_axo_view()) {
		axo_view = newAxoView;
		big_view = axo_view;
	}
}

/**
 * Determine if the axonometric view can be updated.
 *
 * @returns {boolean} True if the axo view can be updated (if all views are
 *  shown or if the axo view is the big view), false otherwise.
 */
function can_update_axo_view() {
	return (
		all_views ||
		(big_view !== front_view && big_view !== left_view && big_view !== top_view)
	);
}

/**
 * Adjust theta by the given delta.
 *
 * @param {number} delta - The amount to adjust theta by.
 */
function adjust_theta(delta) {
	if (can_update_axo_view()) {
		theta += delta;
	}
	update_axo_view();
}

/**
 * Adjusts the gamma value by the given delta.
 *
 * This function increases or decreases the gamma value by the specified delta
 * if the axonometric view can be updated. After adjusting the gamma value,
 * it updates the axonometric view.
 *
 * @param {number} delta - The amount to adjust gamma by.
 */
function adjust_gamma(delta) {
	if (can_update_axo_view()) {
		gamma += delta;
	}
	update_axo_view();
}

/**
 * Resets the zoom level to the default value.
 *
 * This function sets the zoom variable to the default zoom value defined in the constants.
 */
function reset_zoom() {
	zoom = CONSTANTS.DEFAULT_ZOOM;
}

/**
 * Creates and draws the floor of the scene.
 *
 * This function creates a grid of square nodes, translates and scales each square,
 * sets its drawing information, and attaches it to the parent node.
 *
 * @param {Node} parent - The root node to which the floor squares will be attached.
 */
function draw_floor(parent) {
	for (
		let i = -CONSTANTS.FLOOR_SQUARES_PER_SIDE;
		i <= CONSTANTS.FLOOR_SQUARES_PER_SIDE;
		i++
	) {
		for (
			let j = -CONSTANTS.FLOOR_SQUARES_PER_SIDE;
			j <= CONSTANTS.FLOOR_SQUARES_PER_SIDE;
			j++
		) {
			const squareNode = new Node(); // Clone the square node
			squareNode.translate(i, 0, j);
			squareNode.scale(1, CONSTANTS.FLOOR_HEIGHT, 1);
			squareNode.drawInfo = {
				primitive: CUBE,
				currentMode: currentMode,
				color:
					(i + j) % 2 === 0 ? CONSTANTS.COLORS.BLACK : CONSTANTS.COLORS.GREY,
			};
			squareNode.setParent(parent);
		}
	}
}

/**
 * Draws the entire truck.
 *
 * This function creates a truck node, translates it to the specified position,
 * draws the wheels and underbody, and attaches the truck node to the parent node.
 *
 * @param {Node} parent - The root node to which the truck will be attached.
 */
function draw_truck(parent) {
	const truckNode = new Node();

	truckNode.translate(translation, CONSTANTS.TRUCK_OFFSET, 0);

	draw_wheels(truckNode);
	setup_under_body(truckNode);
	setup_front_body(truckNode);
	setup_back_body(truckNode);
	setup_ladder(truckNode);

	truckNode.setParent(parent);
}

/**
 * Draws the wheels of the truck.
 *
 * This function creates a wheels node, draws the front and back axles with wheels,
 * and attaches the wheels node to the parent truck node.
 *
 * @param {Node} parent - The truck node to which the wheels will be attached.
 */
function draw_wheels(parent) {
	// Draw the front axle
	draw_axles(parent, CONSTANTS.DISTANCE_BETWEEN_AXLES);

	// Draw the back axle
	draw_axles(parent, -CONSTANTS.DISTANCE_BETWEEN_AXLES);
}

/**
 * Draws the axles of the truck.
 *
 * This function creates an axles node, translates and rotates it to the specified
 * position, draws the axle and wheels, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the axles will be attached.
 * @param {number} distance - The distance to translate the axles node along the X-axis.
 */
function draw_axles(parent, distance) {
	const axlesNode = new Node();

	axlesNode.translate(distance, 0, 0);
	axlesNode.rotateX(CONSTANTS.AXLE_ROTATION);

	draw_axle(axlesNode);
	draw_wheel(axlesNode, CONSTANTS.DISTANCE_BETWEEN_WHEELS_SAME_AXLE);
	draw_wheel(axlesNode, -CONSTANTS.DISTANCE_BETWEEN_WHEELS_SAME_AXLE);

	axlesNode.setParent(parent);
}

/**
 * Draws a single axle of the truck.
 *
 * This function creates an axle node, scales it to the specified dimensions,
 * sets its drawing information, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the axle will be attached.
 */
function draw_axle(parent) {
	const axleNode = new Node();

	axleNode.scale(
		CONSTANTS.AXLE_RADIUS,
		CONSTANTS.AXLE_LENGTH,
		CONSTANTS.AXLE_RADIUS
	);

	axleNode.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.BLACK,
		currentMode,
	};

	axleNode.setParent(parent);
}

/**
 * Draws a wheel of the truck.
 * @param {Node} parent the axles node
 * @param {number} distance the distance between the wheels on the same axle
 */
function draw_wheel(parent, distance) {
	const wheelNode = new Node();

	wheelNode.translate(0, distance, 0);
	wheelNode.rotateY(wheelRotation);

	draw_tire(wheelNode);
	draw_rim(wheelNode);

	wheelNode.setParent(parent);
}

/**
 * Draws the tire of the wheel.
 *
 * This function creates a tire node, scales it to the specified dimensions,
 * sets its drawing information, and attaches it to the parent wheel node.
 *
 * @param {Node} parent - The wheel node to which the tire will be attached.
 */
function draw_tire(parent) {
	const tireNode = new Node();

	tireNode.scale(
		CONSTANTS.WHEEL_RADIUS,
		CONSTANTS.WHEEL_THICKNESS,
		CONSTANTS.WHEEL_RADIUS
	);

	tireNode.drawInfo = {
		primitive: TORUS,
		color: CONSTANTS.COLORS.BLACK,
		currentMode,
	};

	tireNode.setParent(parent);
}

/**
 * Draws the rim of the wheel.
 *
 * This function creates a rim node, scales it to the specified dimensions,
 * sets its drawing information, and attaches it to the parent wheel node.
 *
 * @param {Node} parent - The wheel node to which the rim will be attached.
 */
function draw_rim(parent) {
	const rimNode = new Node();

	rimNode.scale(
		CONSTANTS.RIM_RADIUS,
		CONSTANTS.RIM_THICKNESS,
		CONSTANTS.RIM_RADIUS
	);

	rimNode.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};

	rimNode.setParent(parent);
}

/**
 * Calculates the wheel rotation based on the given translation.
 *
 * The wheel rotation is calculated using the formula: 2 * pi * r * theta = distance,
 * where r is the wheel radius and theta is the rotation angle in degrees.
 *
 * @param {number} translation - The translation distance of the truck.
 * @returns {number} The calculated wheel rotation angle in degrees.
 */
function calculate_wheel_rotation(translation) {
	wheelRotation =
		(-1 * (translation * 360)) / (2 * Math.PI * CONSTANTS.WHEEL_RADIUS);
}

/**
 * Sets up the underbody of the truck by creating a node, translating it,
 * drawing the underbody, and attaching it to the parent node.
 *
 * @param {Node} parent - The node to which the underbody will be attached.
 */
function setup_under_body(parent) {
	const underbodySetupNode = new Node();

	underbodySetupNode.translate(0, CONSTANTS.UNDER_BODY_OFFSET, 0);

	draw_under_body(underbodySetupNode);

	underbodySetupNode.setParent(parent);
}

/**
 * Draws the underbody of the truck.
 *
 * @param {Node} parent - The node to which the underbody will be attached.
 */
function draw_under_body(parent) {
	const underBodyNode = new Node();

	const upperPlaqueAuxNode = new Node();

	upperPlaqueAuxNode.translate(0, CONSTANTS.UPPER_PLAQUE_OFFSET, 0);
	draw_upper_plaque(upperPlaqueAuxNode);
	draw_blinkers(upperPlaqueAuxNode);

	upperPlaqueAuxNode.setParent(underBodyNode);

	draw_lower_plaque(underBodyNode);
	draw_bumpers(underBodyNode);

	underBodyNode.setParent(parent);
}

/**
 * Draws the lower plaque of the underbody.
 *
 * @param {Node} parent - The node to which the lower plaque will be attached.
 */
function draw_lower_plaque(parent) {
	const lowerPlaqueNode = new Node();

	lowerPlaqueNode.scale(
		CONSTANTS.LOWER_PLAQUE_WIDTH,
		CONSTANTS.LOWER_PLAQUE_HEIGHT,
		CONSTANTS.LOWER_PLAQUE_LENGTH
	);

	lowerPlaqueNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.TRUCK_RED,
		currentMode,
	};

	lowerPlaqueNode.setParent(parent);
}

/**
 * Draws the front and back bumpers of the underbody.
 *
 * @param {Node} parent - The node to which the bumpers will be attached.
 */
function draw_upper_plaque(parent) {
	const upperPlaqueNode = new Node();

	upperPlaqueNode.scale(
		CONSTANTS.UPPER_PLAQUE_WIDTH,
		CONSTANTS.UPPER_PLAQUE_HEIGHT,
		CONSTANTS.UPPER_PLAQUE_LENGTH
	);

	upperPlaqueNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.TRUCK_RED,
		currentMode,
	};

	upperPlaqueNode.setParent(parent);
}

/**
 * Draws the front and back bumpers of the underbody.
 *
 * @param {Node} parent - The node to which the bumpers will be attached.
 */
function draw_bumpers(parent) {
	draw_side_bumpers(parent);
	draw_front_and_back_bumpers(parent);
}

/**
 * Draws the side bumpers of the underbody.
 *
 * @param {Node} parent - The node to which the side bumpers will be attached.
 */
function draw_side_bumpers(parent) {
	create_bumper(
		parent,
		CONSTANTS.MIDDLE_SIDE_BUMPER_WIDTH,
		CONSTANTS.SIDE_BUMPER_HEIGHT,
		CONSTANTS.SIDE_BUMPER_LENGTH,
		0,
		0,
		CONSTANTS.SIDE_BUMPER_OFFSET_Z,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);
	create_bumper(
		parent,
		CONSTANTS.MIDDLE_SIDE_BUMPER_WIDTH,
		CONSTANTS.SIDE_BUMPER_HEIGHT,
		CONSTANTS.SIDE_BUMPER_LENGTH,
		0,
		0,
		-CONSTANTS.SIDE_BUMPER_OFFSET_Z,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);

	if (CONSTANTS.EDGE_SIDE_BUMPER_WIDTH > 0) {
		create_bumper(
			parent,
			CONSTANTS.EDGE_SIDE_BUMPER_WIDTH,
			CONSTANTS.SIDE_BUMPER_HEIGHT,
			CONSTANTS.SIDE_BUMPER_LENGTH,
			-CONSTANTS.EDGE_SIDE_BUMPER_OFFSET_X,
			0,
			CONSTANTS.SIDE_BUMPER_OFFSET_Z,
			CONSTANTS.COLORS.WHITE,
			currentMode
		);
		create_bumper(
			parent,
			CONSTANTS.EDGE_SIDE_BUMPER_WIDTH,
			CONSTANTS.SIDE_BUMPER_HEIGHT,
			CONSTANTS.SIDE_BUMPER_LENGTH,
			-CONSTANTS.EDGE_SIDE_BUMPER_OFFSET_X,
			0,
			-CONSTANTS.SIDE_BUMPER_OFFSET_Z,
			CONSTANTS.COLORS.WHITE,
			currentMode
		);
		create_bumper(
			parent,
			CONSTANTS.EDGE_SIDE_BUMPER_WIDTH,
			CONSTANTS.SIDE_BUMPER_HEIGHT,
			CONSTANTS.SIDE_BUMPER_LENGTH,
			CONSTANTS.EDGE_SIDE_BUMPER_OFFSET_X,
			0,
			CONSTANTS.SIDE_BUMPER_OFFSET_Z,
			CONSTANTS.COLORS.WHITE,
			currentMode
		);
		create_bumper(
			parent,
			CONSTANTS.EDGE_SIDE_BUMPER_WIDTH,
			CONSTANTS.SIDE_BUMPER_HEIGHT,
			CONSTANTS.SIDE_BUMPER_LENGTH,
			CONSTANTS.EDGE_SIDE_BUMPER_OFFSET_X,
			0,
			-CONSTANTS.SIDE_BUMPER_OFFSET_Z,
			CONSTANTS.COLORS.WHITE,
			currentMode
		);
	}
}

/**
 * Draws the blinkers of the truck.
 *
 * @param {Node} parent - The node to which the blinkers will be attached.
 */
function draw_front_and_back_bumpers(parent) {
	create_bumper(
		parent,
		CONSTANTS.EDGE_BUMPER_WIDTH,
		CONSTANTS.EDGE_BUMPER_HEIGHT,
		CONSTANTS.EDGE_BUMPER_LENGTH,
		-CONSTANTS.EDGE_BUMPER_OFFSET_X,
		0,
		0,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);

	create_bumper(
		parent,
		CONSTANTS.EDGE_BUMPER_WIDTH,
		CONSTANTS.EDGE_BUMPER_HEIGHT,
		CONSTANTS.EDGE_BUMPER_LENGTH,
		CONSTANTS.EDGE_BUMPER_OFFSET_X,
		0,
		0,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);
}

/**
 * Creates a bumper and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the bumper will be attached.
 * @param {number} width - The width of the bumper.
 * @param {number} height - The height of the bumper.
 * @param {number} length - The length of the bumper.
 * @param {number} translateX - The translation along the X-axis.
 * @param {number} translateY - The translation along the Y-axis.
 * @param {number} translateZ - The translation along the Z-axis.
 * @param {string} color - The color of the bumper.
 * @param {string} mode - The drawing mode for the bumper.
 * @returns {Node} The created bumper node.
 */
function create_bumper(
	parent,
	width,
	height,
	length,
	translateX,
	translateY,
	translateZ,
	color,
	mode
) {
	const bumper = new Node();
	bumper.scale(width, height, length);
	bumper.translate(translateX, translateY, translateZ);
	bumper.drawInfo = {
		primitive: CUBE,
		color: color,
		currentMode: mode,
	};
	bumper.setParent(parent);
}

/**
 * Creates a bumper and attaches it to the parent node.
 *
 * @param {Node} parent - The upper plaque aux node to which the bumper will be attached.
 * @param {number} width - The width of the bumper.
 * @param {number} height - The height of the bumper.
 * @param {number} length - The length of the bumper.
 * @param {number} translateX - The translation along the X-axis.
 * @param {number} translateY - The translation along the Y-axis.
 * @param {number} translateZ - The translation along the Z-axis.
 * @param {string} color - The color of the bumper.
 * @param {string} mode - The drawing mode for the bumper.
 * @returns {Node} The created bumper node.
 */
function create_blinker(
	parent,
	width,
	height,
	length,
	translateX,
	translateY,
	translateZ,
	color,
	mode
) {
	const blinker = new Node();
	blinker.scale(width, height, length);
	blinker.translate(translateX, translateY, translateZ);
	blinker.drawInfo = {
		primitive: CUBE,
		color: color,
		currentMode: mode,
		alphaBlending: true,
	};
	blinker.setParent(parent);
	return blinker;
}

/**
 * Draws the blinkers of the truck.
 *
 * This function creates and positions the front and back blinkers of the truck.
 * It uses the createBlinker function to set up each blinker with the specified
 * dimensions, positions, and colors, and attaches them to the parent node.
 *
 * @param {Node} parent - The node to which the blinkers will be attached.
 */
function draw_blinkers(parent) {
	create_blinker(
		parent,
		CONSTANTS.FRONT_BLINKER_WIDTH,
		CONSTANTS.FRONT_BLINKER_HEIGHT,
		CONSTANTS.FRONT_BLINKER_LENGTH,
		-CONSTANTS.FRONT_BLINKER_OFFSET_X,
		CONSTANTS.BLINKER_OFFSET_Y,
		CONSTANTS.FRONT_BLINKER_OFFSET_Z,
		blinker_color,
		currentMode
	);

	create_blinker(
		parent,
		CONSTANTS.FRONT_BLINKER_WIDTH,
		CONSTANTS.FRONT_BLINKER_HEIGHT,
		CONSTANTS.FRONT_BLINKER_LENGTH,
		-CONSTANTS.FRONT_BLINKER_OFFSET_X,
		CONSTANTS.BLINKER_OFFSET_Y,
		-CONSTANTS.FRONT_BLINKER_OFFSET_Z,
		blinker_color,
		currentMode
	);

	create_blinker(
		parent,
		CONSTANTS.BACK_BLINKER_WIDTH,
		CONSTANTS.BACK_BLINKER_HEIGHT,
		CONSTANTS.BACK_BLINKER_LENGTH,
		CONSTANTS.BACK_BLINKER_OFFSET_X,
		CONSTANTS.BLINKER_OFFSET_Y,
		CONSTANTS.BACK_BLINKER_OFFSET_Z,
		blinker_color,
		currentMode
	);

	create_blinker(
		parent,
		CONSTANTS.BACK_BLINKER_WIDTH,
		CONSTANTS.BACK_BLINKER_HEIGHT,
		CONSTANTS.BACK_BLINKER_LENGTH,
		CONSTANTS.BACK_BLINKER_OFFSET_X,
		CONSTANTS.BLINKER_OFFSET_Y,
		-CONSTANTS.BACK_BLINKER_OFFSET_Z,
		blinker_color,
		currentMode
	);
}

/**
 * Sets up the front body of the truck.
 *
 * This function creates a front body node, translates it to the specified position,
 * draws the front body, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the front body will be attached.
 */
function setup_front_body(parent) {
	const front_body = new Node();

	front_body.translate(
		CONSTANTS.FRONT_BODY_SETUP_OFFSET_X,
		CONSTANTS.FRONT_BODY_SETUP_OFFSET_Y,
		0
	);

	draw_front_body(front_body);

	front_body.setParent(parent);
}

/**
 * Draws the front body of the truck.
 *
 * This function draws various components of the front body of the truck,
 * including the front box, front window, lights, front left window,
 * front right window, and siren. Each component is drawn and attached
 * to the parent node.
 *
 * @param {Node} parent - The node to which the front body components will be attached.
 */
function draw_front_body(parent) {
	draw_front_box(parent);
	draw_front_window(parent);
	draw_lights(parent);
	draw_front_left_window(parent);
	draw_front_right_window(parent);
	draw_siren(parent);
}

/**
 * Draws the front box of the truck.
 *
 * This function creates a front box node, scales it to the specified dimensions,
 * sets its drawing information, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the front box will be attached.
 */
function draw_front_box(parent) {
	const frontBoxNode = new Node();

	frontBoxNode.scale(
		CONSTANTS.FRONT_BOX_WIDTH,
		CONSTANTS.FRONT_BOX_HEIGHT,
		CONSTANTS.FRONT_BOX_LENGTH
	);
	frontBoxNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.TRUCK_RED,
		currentMode,
	};

	frontBoxNode.setParent(parent);
}

/**
 * Draws the front window of the truck.
 *
 * This function creates a front window node, scales it to the specified dimensions,
 * translates it to the specified position, sets its drawing information, and attaches
 * it to the parent node.
 *
 * @param {Node} parent - The node to which the front window will be attached.
 */
function draw_front_window(parent) {
	const frontWindowNode = new Node();

	frontWindowNode.scale(
		CONSTANTS.FRONT_WINDOW_LENGTH,
		CONSTANTS.FRONT_WINDOW_HEIGHT,
		CONSTANTS.FRONT_WINDOW_WIDTH
	);
	frontWindowNode.translate(
		CONSTANTS.FRONT_WINDOW_OFFSET_X,
		CONSTANTS.FRONT_WINDOW_OFFSET_Y,
		0
	);
	frontWindowNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.LIGHT_BLUE,
		currentMode,
	};

	frontWindowNode.setParent(parent);
}

/**
 * Creates a light and attaches it to the parent node.
 *
 * This function creates a light node, scales and translates it to the specified dimensions and position,
 * sets its drawing information, and attaches it to the parent node. Additionally, it creates a glass node
 * to represent the glass covering of the light, scales it, sets its drawing information, and attaches it
 * to the light node.
 *
 * @param {Node} parent - The node to which the light will be attached.
 * @param {number} scaleX - The scale factor along the X-axis for the light.
 * @param {number} scaleY - The scale factor along the Y-axis for the light.
 * @param {number} scaleZ - The scale factor along the Z-axis for the light.
 * @param {number} translateX - The translation along the X-axis for the light.
 * @param {number} translateY - The translation along the Y-axis for the light.
 * @param {number} translateZ - The translation along the Z-axis for the light.
 * @param {string} color - The color of the light.
 * @param {string} mode - The drawing mode for the light.
 */
function create_light(
	parent,
	scaleX,
	scaleY,
	scaleZ,
	translateX,
	translateY,
	translateZ,
	color,
	mode
) {
	const lightNode = new Node();

	lightNode.scale(scaleX, scaleY, scaleZ);
	lightNode.translate(translateX, translateY, translateZ);
	lightNode.drawInfo = {
		primitive: SPHERE,
		color: color,
		currentMode: mode,
	};

	const glassNode = new Node();
	glassNode.scale(
		CONSTANTS.GLASS_NODE_SIZE,
		CONSTANTS.GLASS_NODE_SIZE,
		CONSTANTS.GLASS_NODE_SIZE
	);
	glassNode.drawInfo = {
		primitive: SPHERE,
		color: lightColor,
		currentMode: gl.LINES,
		alphaBlending: true,
	};
	glassNode.setParent(lightNode);

	lightNode.setParent(parent);
}

/**
 * Draws the lights of the truck.
 *
 * This function creates and positions the front lights of the truck.
 * It uses the create_light function to set up each light with the specified
 * dimensions, positions, and colors, and attaches them to the parent node.
 *
 * @param {Node} parent - The node to which the lights will be attached.
 */
function draw_lights(parent) {
	create_light(
		parent,
		CONSTANTS.FRONT_LIGHT_WIDTH,
		CONSTANTS.FRONT_LIGHT_HEIGHT,
		CONSTANTS.FRONT_LIGHT_LENGTH,
		-CONSTANTS.FRONT_LIGHT_OFFSET_X,
		-CONSTANTS.FRONT_LIGHT_OFFSET_Y,
		-CONSTANTS.FRONT_LIGHT_OFFSET_Z,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);

	create_light(
		parent,
		CONSTANTS.FRONT_LIGHT_WIDTH,
		CONSTANTS.FRONT_LIGHT_HEIGHT,
		CONSTANTS.FRONT_LIGHT_LENGTH,
		-CONSTANTS.FRONT_LIGHT_OFFSET_X,
		-CONSTANTS.FRONT_LIGHT_OFFSET_Y,
		CONSTANTS.FRONT_LIGHT_OFFSET_Z,
		CONSTANTS.COLORS.WHITE,
		currentMode
	);
}

/**
 * Toggles the color of the lights between grey and white.
 *
 * This function switches the light color from grey to white or from white to grey
 * based on the current color.
 */
function toggleLights() {
	lightColor =
		lightColor === CONSTANTS.COLORS.GREY
			? CONSTANTS.COLORS.WHITE
			: CONSTANTS.COLORS.GREY;
}

/**
 * Toggles the color of the blinkers between grey and orange.
 *
 * This function switches the blinker color from grey to orange or from orange to grey
 * based on the current color.
 */
function toggle_blinker_color() {
	blinker_color =
		blinker_color === CONSTANTS.COLORS.GREY
			? CONSTANTS.COLORS.ORANGE
			: CONSTANTS.COLORS.GREY;
}

/**
 * Draws the front left window of the truck.
 *
 * This function creates a node for the front left window, scales it to the specified dimensions,
 * translates it to the specified position, sets its drawing information, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the front left window will be attached.
 */
function draw_front_left_window(parent) {
	const leftWindowNode = new Node();

	leftWindowNode.scale(
		CONSTANTS.SIDE_WINDOW_WIDTH,
		CONSTANTS.SIDE_WINDOW_HEIGHT,
		CONSTANTS.SIDE_WINDOW_LENGTH
	);
	leftWindowNode.translate(
		-CONSTANTS.LEFT_WINDOW_OFFSET_X,
		CONSTANTS.LEFT_WINDOW_OFFSET_Y,
		-CONSTANTS.LEFT_WINDOW_OFFSET_Z
	);
	leftWindowNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.LIGHT_BLUE,
		currentMode,
	};

	leftWindowNode.setParent(parent);
}

/**
 * Draws the front right window of the truck.
 *
 * This function creates a node for the front right window, scales it to the specified dimensions,
 * translates it to the specified position, sets its drawing information, and attaches it to the parent node.
 *
 * @param {Node} parent - The node to which the front right window will be attached.
 */
function draw_front_right_window(parent) {
	const rightWindowNode = new Node();

	rightWindowNode.scale(
		CONSTANTS.SIDE_WINDOW_WIDTH,
		CONSTANTS.SIDE_WINDOW_HEIGHT,
		CONSTANTS.SIDE_WINDOW_LENGTH
	);
	rightWindowNode.translate(
		-CONSTANTS.RIGHT_WINDOW_OFFSET_X,
		CONSTANTS.RIGHT_WINDOW_OFFSET_Y,
		CONSTANTS.RIGHT_WINDOW_OFFSET_Z
	);
	rightWindowNode.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.LIGHT_BLUE,
		currentMode,
	};

	rightWindowNode.setParent(parent);
}

/**
 * Draws the siren of the truck.
 *
 * This function creates a siren node, scales and translates it to the specified dimensions and position,
 * sets its drawing information, and attaches it to the parent node. Additionally, it creates a glass node
 * to represent the glass covering of the siren, scales it, sets its drawing information, and attaches it
 * to the siren node.
 *
 * @param {Node} parent - The node to which the siren will be attached.
 */
function draw_siren(parent) {
	const sirenNode = new Node();
	sirenNode.scale(
		CONSTANTS.SIREN_SIZE,
		CONSTANTS.SIREN_SIZE,
		CONSTANTS.SIREN_SIZE
	);
	sirenNode.translate(0, CONSTANTS.SIREN_OFFSET_Y, 0);

	sirenNode.drawInfo = {
		primitive: SPHERE,
		color: sirenColor,
		currentMode,
		outline: false,
		alphaBlending: true,
	};
	sirenNode.setParent(parent);

	const glassSiren = new Node();
	glassSiren.scale(
		CONSTANTS.SIREN_GLASS_RATIO,
		CONSTANTS.SIREN_GLASS_RATIO,
		CONSTANTS.SIREN_GLASS_RATIO
	);
	glassSiren.drawInfo = {
		primitive: SPHERE,
		color: CONSTANTS.COLORS.SIREN,
		currentMode: gl.LINES,
		alphaBlending: true,
	};
	glassSiren.setParent(sirenNode);
}

/**
 * Toggles the siren on and off.
 *
 * This function starts or stops the siren interval, which alternates the siren color.
 * When the siren is turned off, the siren color is reset to grey.
 */
function toggleSiren() {
	if (sirenInterval) {
		clearInterval(sirenInterval);
		sirenColor = CONSTANTS.COLORS.GREY;
		sirenInterval = null;
	} else {
		sirenInterval = setInterval(toggleSirenColor, 500);
	}
}

/**
 * Toggles the blinker on and off.
 *
 * This function starts or stops the blinker interval, which alternates the blinker color.
 * When the blinker is turned off, the blinker color is reset to grey.
 */
function toggleBlinker() {
	if (blinker_interval) {
		clearInterval(blinker_interval);
		blinker_color = CONSTANTS.COLORS.GREY;
		blinker_interval = null;
	} else {
		blinker_interval = setInterval(toggle_blinker_color, 500);
	}
}

/**
 * Toggles the color of the siren between red and light blue.
 *
 * This function switches the siren color from red to light blue or from light blue to red
 * based on the current color.
 */
function toggleSirenColor() {
	sirenColor =
		sirenColor === CONSTANTS.COLORS.RED
			? CONSTANTS.COLORS.LIGHT_BLUE
			: CONSTANTS.COLORS.RED;
}

function setup_back_body(parent) {
	const backBodyNode = new Node();

	backBodyNode.translate(
		CONSTANTS.BACK_BODY_OFFSET_X,
		CONSTANTS.BACK_BODY_OFFSET_Y,
		0
	);

	draw_back_body(backBodyNode);
	draw_axe(backBodyNode);
	draw_water_tank(backBodyNode);

	backBodyNode.setParent(parent);
}

/**
 * Animates the roll-up and roll-down of the truck's windows.
 *
 * This function increases the roll-up progress if the windows are rolling up
 * and decreases the roll-up progress if the windows are rolling down. The progress
 * is adjusted by ROLL_UP_PROGRESS units per call, and it is bounded by the total
 * number of cubes.
 */
function animateRollUp() {
	if (isRollingUp && rollUpProgress < CONSTANTS.TOTAL_CUBES) {
		rollUpProgress += CONSTANTS.ROLL_UP_PROGRESS; // Increase the roll-up progress
	} else if (!isRollingUp && rollUpProgress > 0) {
		rollUpProgress -= CONSTANTS.ROLL_UP_PROGRESS; // Decrease to "roll down"
	}
}

/**
 * Creates a box node and attaches it to the parent node.
 *
 * This function creates a box node, scales and translates it to the specified dimensions and position,
 * sets its drawing information, and attaches it to the parent node.
 *
 * @param {number} width - The width of the box.
 * @param {number} height - The height of the box.
 * @param {number} length - The length of the box.
 * @param {string} color - The color of the box.
 * @param {Node} parent - The node to which the box will be attached.
 * @param {number} translateX - The translation along the X-axis for the box.
 * @param {number} translateY - The translation along the Y-axis for the box.
 * @param {number} translateZ - The translation along the Z-axis for the box.
 */
function create_box_node(
	width,
	height,
	length,
	color,
	parent,
	translateX,
	translateY,
	translateZ
) {
	const boxNode = new Node();

	boxNode.scale(width, height, length);
	boxNode.translate(translateX, translateY, translateZ);
	boxNode.drawInfo = {
		primitive: CUBE,
		color: color,
		currentMode,
	};

	boxNode.setParent(parent);
}

/**
 * Draws the back body of the truck.
 *
 * This function creates and positions the back body components of the truck,
 * including the top and bottom walls, left and right walls, and the window groups.
 * Each component is drawn and attached to the parent node.
 *
 * @param {Node} parent - The node to which the back body components will be attached.
 */
function draw_back_body(parent) {
	create_box_node(
		CONSTANTS.BACK_BOX_WIDTH,
		CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT,
		CONSTANTS.BACK_BOX_LENGTH,
		CONSTANTS.COLORS.TRUCK_RED,
		parent,
		0,
		CONSTANTS.BACK_BOX_HEIGHT / 2,
		0
	);
	create_box_node(
		CONSTANTS.BACK_BOX_WIDTH,
		CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT,
		CONSTANTS.BACK_BOX_LENGTH,
		CONSTANTS.COLORS.TRUCK_RED,
		parent,
		0,
		-CONSTANTS.BACK_BOX_HEIGHT / 2,
		0
	);
	create_box_node(
		CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
		CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT,
		CONSTANTS.BACK_BOX_LENGTH,
		CONSTANTS.COLORS.TRUCK_RED,
		parent,
		CONSTANTS.BACK_BOX_WIDTH / 2 - (1 / 2) * CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
		0,
		0
	);
	create_box_node(
		CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
		CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT,
		CONSTANTS.BACK_BOX_LENGTH,
		CONSTANTS.COLORS.TRUCK_RED,
		parent,
		-CONSTANTS.BACK_BOX_WIDTH / 2 + (1 / 2) * CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
		0,
		0
	);

	const windowGroupFront = new Node();
	for (let i = 0; i < CONSTANTS.TOTAL_CUBES; i++) {
		if (i < rollUpProgress) continue; // Skip cubes that have "rolled up"

		const windowCube = new Node();
		const WINDOW_CUBE_HEIGHT =
			(CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT) /
			CONSTANTS.TOTAL_CUBES;

		windowCube.scale(
			CONSTANTS.BACK_BOX_WIDTH - 2 * CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
			WINDOW_CUBE_HEIGHT,
			0.01
		);
		windowCube.translate(
			0,
			WINDOW_CUBE_HEIGHT * (i + 1 / 2) -
				(CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT) / 2,
			0
		);

		windowCube.drawInfo = {
			primitive: CUBE,
			color: CONSTANTS.COLORS.GREY,
			currentMode,
		};

		windowCube.setParent(windowGroupFront);
	}
	windowGroupFront.setParent(parent);
	windowGroupFront.translate(0, 0, CONSTANTS.BACK_BOX_LENGTH / 2);

	const windowGroupBack = new Node();
	for (let i = 0; i < CONSTANTS.TOTAL_CUBES; i++) {
		if (i < rollUpProgress) continue; // Skip cubes that have "rolled up"

		const windowCube = new Node();
		const WINDOW_CUBE_HEIGHT =
			(CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT) /
			CONSTANTS.TOTAL_CUBES;

		windowCube.scale(
			CONSTANTS.BACK_BOX_WIDTH - 2 * CONSTANTS.RIGHT_LEFT_WALLS_WIDTH,
			WINDOW_CUBE_HEIGHT,
			0.01
		);
		windowCube.translate(
			0,
			WINDOW_CUBE_HEIGHT * (i + 1 / 2) -
				(CONSTANTS.BACK_BOX_HEIGHT - CONSTANTS.TOP_BOTTOM_WALLS_HEIGHT) / 2,
			0
		);

		windowCube.drawInfo = {
			primitive: CUBE,
			color: CONSTANTS.COLORS.GREY,
			currentMode,
		};

		windowCube.setParent(windowGroupBack);
	}
	windowGroupBack.translate(0, 0, -CONSTANTS.BACK_BOX_LENGTH / 2);
	windowGroupBack.setParent(parent);
}

/**
 * Draws an axe.
 *
 * This function creates and positions the body and head of an axe.
 * It uses the specified constants for dimensions, rotations, translations, and colors,
 * and attaches the axe components to the parent node.
 *
 * @param {Node} parent - The node to which the axe components will be attached.
 */
function draw_axe(parent) {
	const axeBody = new Node();

	axeBody.rotateX(CONSTANTS.AXE_BODY_ROTATION);
	axeBody.scale(
		CONSTANTS.AXE_BODY_WIDTH,
		CONSTANTS.AXE_BODY_HEIGHT,
		CONSTANTS.AXE_BODY_LENGTH
	);
	axeBody.translate(
		CONSTANTS.AXE_BODY_OFFSET_X,
		CONSTANTS.AXE_BODY_OFFSET_Y,
		CONSTANTS.AXE_BODY_OFFSET_Z
	);
	axeBody.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.BROWN,
		currentMode,
	};
	axeBody.setParent(parent);

	const axeHead = new Node();

	axeHead.rotateX(CONSTANTS.AXE_HEAD_ROTATION);
	axeHead.scale(
		CONSTANTS.AXE_HEAD_WIDTH,
		CONSTANTS.AXE_HEAD_HEIGHT,
		CONSTANTS.AXE_HEAD_LENGTH
	);
	axeHead.translate(
		CONSTANTS.AXE_HEAD_OFFSET_X,
		CONSTANTS.AXE_HEAD_OFFSET_Y,
		CONSTANTS.AXE_HEAD_OFFSET_Z
	);
	axeHead.drawInfo = {
		primitive: PYRAMID, // Assuming the axe head can be represented as a pyramid
		color: CONSTANTS.COLORS.GREY, // Color of the axe head
		currentMode,
	};

	axeHead.setParent(parent);
}

/**
 * Draws the water tank and its components.
 *
 * @param {Node} parent - The parent node to which the water tank will be attached.
 */
function draw_water_tank(parent) {
	const waterTank = new Node();
	waterTank.rotateZ(90);
	waterTank.translate(
		CONSTANTS.WATER_TANK_OFFSET_X,
		CONSTANTS.WATER_TANK_OFFSET_Y,
		CONSTANTS.WATER_TANK_OFFSET_Z
	);

	const water = new Node();
	water.scale(
		CONSTANTS.WATER_WIDTH,
		CONSTANTS.WATER_HEIGHT,
		CONSTANTS.WATER_LENGTH
	);
	water.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.LIGHT_BLUE,
		currentMode,
	};
	water.setParent(waterTank);
	waterTank.setParent(parent);

	const waterGlass = new Node();
	waterGlass.scale(
		CONSTANTS.WATER_GLASS_WIDTH,
		CONSTANTS.WATER_GLASS_HEIGHT,
		CONSTANTS.WATER_GLASS_LENGTH
	);
	waterGlass.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.SIREN,
		currentMode,
		alphaBlending: true,
	};
	waterGlass.setParent(waterTank);

	const tubes = new Node();
	tubes.setParent(waterTank);
	draw_tubes(tubes);

	const tapWheel = new Node();
	draw_tap_wheel(tapWheel);
	tapWheel.translate(
		CONSTANTS.WATER_TANK_OFFSET_X,
		CONSTANTS.WATER_TANK_OFFSET_Y,
		CONSTANTS.WATER_TANK_OFFSET_Z
	);
	tapWheel.setParent(parent);
}

/**
 * Draws the tap wheel and its components.
 *
 * @param {Node} parent - The parent node to which the tap wheel will be attached.
 */
function draw_tap_wheel(parent) {
	const tapWheel = new Node();
	tapWheel.scale(
		CONSTANTS.TAP_WHEEL_WIDTH,
		CONSTANTS.TAP_WHEEL_HEIGHT,
		CONSTANTS.TAP_WHEEL_LENGTH
	);
	tapWheel.translate(
		CONSTANTS.TAP_WHEEL_OFFSET_X,
		CONSTANTS.TAP_WHEEL_OFFSET_Y,
		CONSTANTS.TAP_WHEEL_OFFSET_Z
	);

	const wheel = new Node();
	wheel.drawInfo = {
		primitive: TORUS,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	wheel.setParent(tapWheel);

	const wheelVerticalDetail = new Node();
	wheelVerticalDetail.scale(
		CONSTANTS.TAP_WHEEL_VERTICAL_DETAIL_WIDTH,
		CONSTANTS.TAP_WHEEL_VERTICAL_DETAIL_HEIGHT,
		CONSTANTS.TAP_WHEEL_VERTICAL_DETAIL_LENGTH
	);
	wheelVerticalDetail.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	wheelVerticalDetail.setParent(tapWheel);

	const wheelHorizontalDetail = new Node();
	wheelHorizontalDetail.scale(
		CONSTANTS.TAP_WHEEL_HORIZONTAL_DETAIL_WIDTH,
		CONSTANTS.TAP_WHEEL_HORIZONTAL_DETAIL_HEIGHT,
		CONSTANTS.TAP_WHEEL_HORIZONTAL_DETAIL_LENGTH
	);
	wheelHorizontalDetail.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	wheelHorizontalDetail.setParent(tapWheel);

	tapWheel.setParent(parent);
}

/**
 * Draws the tubes and their components.
 *
 * @param {Node} parent - The parent node to which the tubes will be attached.
 */
function draw_tubes(parent) {
	const backTube = new Node();
	backTube.scale(
		CONSTANTS.BACK_TUBE_WIDTH,
		CONSTANTS.BACK_TUBE_HEIGHT,
		CONSTANTS.BACK_TUBE_LENGTH
	);
	backTube.translate(
		CONSTANTS.BACK_TUBE_OFFSET_X,
		CONSTANTS.BACK_TUBE_OFFSET_Y,
		CONSTANTS.BACK_TUBE_OFFSET_Z
	);
	backTube.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
		outline: true,
	};
	backTube.setParent(parent);

	const frontTube = new Node();
	frontTube.scale(
		CONSTANTS.FRONT_TUBE_WIDTH,
		CONSTANTS.FRONT_TUBE_HEIGHT,
		CONSTANTS.FRONT_TUBE_LENGTH
	);
	frontTube.translate(
		CONSTANTS.FRONT_TUBE_OFFSET_X,
		CONSTANTS.FRONT_TUBE_OFFSET_Y,
		CONSTANTS.FRONT_TUBE_OFFSET_Z
	);
	frontTube.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
		outline: true,
	};
	frontTube.setParent(parent);

	const upperTube = new Node();
	upperTube.scale(
		CONSTANTS.UPPER_TUBE_WIDTH,
		CONSTANTS.UPPER_TUBE_HEIGHT,
		CONSTANTS.UPPER_TUBE_LENGTH
	);
	upperTube.translate(
		CONSTANTS.UPPER_TUBE_OFFSET_X,
		CONSTANTS.UPPER_TUBE_OFFSET_Y,
		CONSTANTS.UPPER_TUBE_OFFSET_Z
	);
	upperTube.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	upperTube.setParent(parent);
}

/**
 * Sets up the ladder by creating a ladder node, translating it to the specified position,
 * drawing the ladder, and attaching it to the parent node.
 *
 * @param {Node} parent - The node to which the ladder will be attached.
 */
function setup_ladder(parent) {
	const ladderNode = new Node();
	ladderNode.translate(
		CONSTANTS.LADDER_SETUP_OFFSET_X,
		CONSTANTS.LADDER_SETUP_OFFSET_Y,
		0
	);
	draw_ladder(ladderNode);
	ladderNode.setParent(parent);
}

/**
 * Draws the ladder by creating and positioning its components.
 *
 * This function creates a ladder node, rotates it based on the user angle,
 * draws the ladder base, and then creates and positions the bottom and top ladder steps.
 * It uses the specified constants for dimensions, translations, and rotations,
 * and attaches the ladder components to the parent node.
 *
 * @param {Node} parent - The node to which the ladder will be attached.
 */
function draw_ladder(parent) {
	const ladder = new Node();
	ladder.rotateY(ladder_user_angle);
	draw_ladder_base(ladder);

	const ladders = new Node();
	ladders.rotateZ(ladder_user_tilt);
	ladders.translate(0, CONSTANTS.LADDER_PART_OFFSET_Y, 0);
	ladders.setParent(ladder);

	const bottom_ladder = new Node();
	draw_ladder_steps(bottom_ladder);
	bottom_ladder.setParent(ladders);

	const top_ladder = new Node();
	top_ladder.translate(
		CONSTANTS.TOP_LADDER_OFFSET_X * -ladder_user_offset_x,
		CONSTANTS.TOP_LADDER_OFFSET_Y,
		0
	);
	draw_ladder_steps(top_ladder);
	top_ladder.setParent(ladders);

	ladder.setParent(parent);
}

/**
 * Draws the base of the ladder.
 *
 * This function creates and positions the base and block components of the ladder.
 * It uses the specified constants for dimensions, translations, and colors,
 * and attaches the ladder components to the parent node.
 *
 * @param {Node} parent - The node to which the ladder base components will be attached.
 */
function draw_ladder_base(parent) {
	const base = new Node();
	base.scale(
		CONSTANTS.LADDER_BASE_WIDTH,
		CONSTANTS.LADDER_BASE_HEIGHT,
		CONSTANTS.LADDER_BASE_WIDTH
	);
	base.drawInfo = {
		primitive: CYLINDER,
		color: CONSTANTS.COLORS.WHITE,
		currentMode,
	};

	const block = new Node();
	block.scale(
		CONSTANTS.BASE_BLOCK_WIDTH,
		CONSTANTS.BASE_BLOCK_HEIGHT,
		CONSTANTS.BASE_BLOCK_WIDTH
	);
	block.translate(0, CONSTANTS.BASE_BLOCK_OFFSET_Y, 0);
	block.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.WHITE,
		currentMode,
	};

	block.setParent(parent);
	base.setParent(parent);
}

/**
 * Draws the ladder steps and their components.
 *
 * This function creates and positions the left and right parts of the ladder,
 * as well as the steps. It uses the specified constants for dimensions, translations,
 * and colors, and attaches the ladder components to the parent node.
 *
 * @param {Node} parent - The parent node to which the ladder steps will be attached.
 */
function draw_ladder_steps(parent) {
	const leftPart = new Node();
	const rightPart = new Node();

	leftPart.scale(
		CONSTANTS.LADDER_PART_WIDTH,
		CONSTANTS.LADDER_PART_HEIGHT,
		CONSTANTS.LADDER_PART_LENGTH
	);
	leftPart.translate(
		CONSTANTS.LADDER_PART_OFFSET_X,
		0,
		CONSTANTS.LADDER_PART_OFFSET_Z
	);
	leftPart.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	leftPart.setParent(parent);

	rightPart.scale(
		CONSTANTS.LADDER_PART_WIDTH,
		CONSTANTS.LADDER_PART_HEIGHT,
		CONSTANTS.LADDER_PART_LENGTH
	);
	rightPart.translate(
		CONSTANTS.LADDER_PART_OFFSET_X,
		0,
		-CONSTANTS.LADDER_PART_OFFSET_Z
	);
	rightPart.drawInfo = {
		primitive: CUBE,
		color: CONSTANTS.COLORS.GREY,
		currentMode,
	};
	rightPart.setParent(parent);

	const steps = new Node();
	steps.translate(-CONSTANTS.LADDER_STEP_SPACING, 0, 0);
	steps.setParent(parent);
	for (let i = 1; i < CONSTANTS.MAX_LADDER_STEPS; i++) {
		const step = new Node();
		step.scale(
			CONSTANTS.LADDER_STEP_WIDTH,
			CONSTANTS.LADDER_STEP_HEIGHT,
			CONSTANTS.LADDER_STEP_LENGTH
		);
		step.translate(0, 0, -i * CONSTANTS.LADDER_STEP_SPACING);
		step.rotateY(90);
		step.drawInfo = {
			primitive: CUBE,
			color: CONSTANTS.COLORS.GREY,
			currentMode,
		};
		step.setParent(steps);
	}
}

/**
 * Increases the ladder user offset.
 */
function increaseLadderUserOffset() {
	ladder_user_offset_x =
		ladder_user_offset_x >= 0.9 ? 0.9 : ladder_user_offset_x + 0.01;
	TOP_LADDER_OFFSET_X = -ladder_user_offset_x * CONSTANTS.LADDER_PART_WIDTH;
}

/**
 * Decreases the ladder user offset.
 */
function decreaseLadderUserOffset() {
	ladder_user_offset_x =
		ladder_user_offset_x <= 0.1 ? 0.1 : ladder_user_offset_x - 0.01;
	CONSTANTS.TOP_LADDER_OFFSET_X =
		-ladder_user_offset_x * CONSTANTS.LADDER_PART_WIDTH;
}

/**
 * Increases the ladder user angle.
 */
function increaseLadderUserAngle() {
	ladder_user_angle += 5;
}

/**
 * Decreases the ladder user angle.
 */
function decreaseLadderUserAngle() {
	ladder_user_angle -= 5;
}

/**
 * Decreases the ladder user tilt.
 */
function decreaseLadderUserTilt() {
	ladder_user_tilt = ladder_user_tilt <= -180 ? -180 : ladder_user_tilt - 5;
}

/**
 * Increases the ladder user tilt.
 */
function increaseLadderUserTilt() {
	ladder_user_tilt = ladder_user_tilt >= 0 ? 0 : ladder_user_tilt + 5;
}

